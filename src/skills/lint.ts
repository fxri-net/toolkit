// 技能规范校验：命名 / frontmatter / 双写版本 / 篇幅 / references / 敏感信息 / 版本递增
// 可机械检出的规则集中在此，命令层只做参数解析与输出；版本解析与递增命令共用 bump 的同一口径
import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { readTextFile } from "../read-text"
import { matchGlob } from "../scope/glob"
import { versionGt } from "../version"
import { readSkillFrontmatterListFromContent, readSkillFrontmatterValueFromContent } from "./source/metadata"
import { skillsSourceDir } from "./source/package"
import { isInside, realPath, toRepoRel } from "./source/paths"
import { STRICT_SKILL_VERSION, parseSkillVersion, readBodyVersionFromContent, readFrontmatterVersionFromContent } from "./versioning"
import { SKILL_PREFIX } from "./prefix"
import { SKILL_TIERS, SKILL_TYPE_VALUES } from "./types"

// 技能标识文件与 references 目录
const SKILL_ENTRY = "SKILL.md"
const REFERENCES_DIR = "references"
// 技能目录名前缀（轻量模块提供，命名门禁与 help 文案共用）
const DEFAULT_PREFIX = SKILL_PREFIX
const DIR_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
// 版本号严格三段式：技能版本独立于产品包版本，不接受预发布后缀
const STRICT_VERSION_PATTERN = STRICT_SKILL_VERSION
// 入口篇幅默认档：150 行 / 8000 字符只告警，200 行 / 12000 字符报错
// 导出供 `skill lint --help` 文案拼接，避免帮助里再写一份数字
export const DEFAULT_WARN_LINES = 150
export const DEFAULT_MAX_LINES = 200
export const DEFAULT_MAX_CHARS = 12000
// 告警字符线取硬上限的 2/3（默认 8000 / 12000 同比例），随 --budget 同步缩放
const WARN_CHARS_RATIO = 2 / 3
// 默认告警字符线单独导出：文档一致性测试直接引用，不在别处再算一次
export const DEFAULT_WARN_CHARS = Math.floor(DEFAULT_MAX_CHARS * WARN_CHARS_RATIO)
// frontmatter 必填字段：顶层键与 metadata 缩进键统一由 readSkillFrontmatterValue 读取
const REQUIRED_FIELDS = ["name", "description", "license", "version", "tier", "author", "source"]
// 技能分层枚举：与安装侧 SkillTier 同源
const TIERS: readonly string[] = SKILL_TIERS
// 命名族表文件名：本包 skills/ 下存在该文件时启用命名门禁，外部目录不强制
const NAMESPACES_FILE = "namespaces.json"
// 元数据三件取值：形态枚举 / 作用域非空 / 触发词非空数组
const SKILL_TYPES: readonly string[] = SKILL_TYPE_VALUES

export interface SkillLintOptions {
  // 待检查目录：缺省为本包 skills/
  dirs?: string[]
  // 版本递增基准（git ref）；不传则不校验递增
  base?: string
  // 入口字符硬上限；告警线按 2/3 推导
  budget?: number
  // 入口行数硬上限
  maxLines?: number
  // 入口行数告警线
  warnLines?: number
  // 跳过匹配的技能目录（名称或相对路径，glob）
  ignore?: string[]
  // 目录名前缀
  prefix?: string
  // 只校验指定技能名（供 bump 写回后的定向校验）
  skills?: string[]
  // 内存内容覆盖：绝对路径 → 文本；供 bump 在落盘前校验待写内容
  contents?: Map<string, string>
}

export interface SkillLintIssue {
  // 展示用路径（cwd 内为相对路径）
  file: string
  line?: number
  level: "error" | "warn"
  // 稳定问题码：供调用方聚合，不受文案变化影响
  code: string
  message: string
}

export interface SkillLintSummary {
  skills: number
  errors: number
  warnings: number
  ignored: number
  // 版本递增基准；未传为 null
  base: string | null
  // 基准不可用时的跳过原因（非仓库 / 浅克隆 / 基准不存在），由命令层写 stderr
  baseSkipped: string | null
}

export interface SkillLintReport {
  // 参与检查的技能入口文件
  files: string[]
  issues: SkillLintIssue[]
  summary: SkillLintSummary
}

// 单个技能目标：目录真实路径、名称与所属检查根
interface SkillTarget {
  dir: string
  name: string
  root: string
}

// 技能目录内文件：相对技能目录的 posix 路径与实际路径
interface SkillFile {
  abs: string
  rel: string
}

// 命名族表：族名 → 表内登记的技能名集合
interface NamespaceTable {
  families: Map<string, Set<string>>
}

// 命名族表加载结果：表不可用时的原因由调用方按错误上报
interface NamespaceLoad {
  table?: NamespaceTable
  error?: string
}

// 读取检查根下的族表：文件不存在即不启用命名门禁（外部技能目录不强制本包命名规则）
function loadNamespaces(root: string): NamespaceLoad {
  const file = join(root, NAMESPACES_FILE)
  if (!existsSync(file)) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(readTextFile(file))
  } catch (e) {
    return { error: `无法解析 ${NAMESPACES_FILE}：${(e as Error).message}` }
  }
  const families = (parsed as { families?: unknown } | null)?.families
  if (!families || typeof families !== "object" || Array.isArray(families)) return { error: `${NAMESPACES_FILE} 缺少 families 对象` }
  const table: NamespaceTable = { families: new Map() }
  for (const [family, value] of Object.entries(families as Record<string, unknown>)) {
    const skills = (value as { skills?: unknown } | null)?.skills
    if (!Array.isArray(skills)) return { error: `${NAMESPACES_FILE} 的族 ${family} 缺少 skills 数组` }
    table.families.set(family, new Set(skills.filter((item): item is string => typeof item === "string")))
  }
  return { table }
}

// 按族表解析技能名：取最长匹配族，剩余部分即主题；无匹配返回空族
function splitSkillName(name: string, table: NamespaceTable): { rest: string; family: string; topic: string } {
  const rest = name.startsWith(DEFAULT_PREFIX) ? name.slice(DEFAULT_PREFIX.length) : ""
  let family = ""
  for (const key of table.families.keys()) {
    if ((rest === key || rest.startsWith(`${key}-`)) && key.length > family.length) family = key
  }
  const topic = !family ? "" : rest === family ? "" : rest.slice(family.length + 1)
  return { rest, family, topic }
}

// 命名门禁：名称为 fxri-<族>-<主题>、族在表内、主题非空且不与族重名，元数据三件齐全
function checkNamespace(target: SkillTarget, content: string, table: NamespaceTable, issues: SkillLintIssue[]): void {
  const entry = join(target.dir, SKILL_ENTRY)
  const { rest, family, topic } = splitSkillName(target.name, table)
  if (!rest) {
    pushIssue(issues, entry, "error", "namespace-name", `技能名须为 ${DEFAULT_PREFIX}<族>-<主题>：${target.name}`)
  } else if (!family) {
    pushIssue(issues, entry, "error", "namespace-family", `技能名的族不在 ${NAMESPACES_FILE}：${target.name}（可用族：${[...table.families.keys()].join(" / ")}）`)
  } else if (!topic || topic === family) {
    pushIssue(issues, entry, "error", "namespace-topic", `技能名缺少主题段或主题与族重复：${target.name}`)
  }
  const type = readSkillFrontmatterValueFromContent(content, "type")
  if (!SKILL_TYPES.includes(type)) pushIssue(issues, entry, "error", "metadata-type", `metadata.type 仅支持 ${SKILL_TYPES.join(" / ")}：${type || "未声明"}`)
  const scope = readSkillFrontmatterValueFromContent(content, "scope")
  if (!scope) pushIssue(issues, entry, "error", "metadata-scope", "metadata.scope 不能为空")
  const triggers = readSkillFrontmatterListFromContent(content, "triggers")
  if (triggers.length === 0) pushIssue(issues, entry, "error", "metadata-triggers", "metadata.triggers 须为非空字符串数组")
}

// 族表与技能归属双向一致：同一技能只属一族，族内技能数与表一致（被 --ignore 跳过的技能不参与比对）
function checkNamespaceTable(root: string, targets: SkillTarget[], table: NamespaceTable, ignores: string[], issues: SkillLintIssue[]): void {
  const file = join(root, NAMESPACES_FILE)
  const ignored = (name: string) => ignores.some((pattern) => matchGlob(name, pattern))
  const actual = new Map<string, string[]>()
  for (const target of targets) {
    const { family } = splitSkillName(target.name, table)
    if (!family) continue
    actual.set(family, [...(actual.get(family) ?? []), target.name])
  }
  // 同一技能出现在多个族即歧义，无法判定归属
  const owners = new Map<string, string>()
  for (const [family, declared] of table.families) {
    for (const name of declared) {
      if (ignored(name)) continue
      const previous = owners.get(name)
      if (previous && previous !== family) {
        pushIssue(issues, file, "error", "namespace-duplicate", `技能 ${name} 同时归属族 ${previous} 与 ${family}`)
        continue
      }
      owners.set(name, family)
    }
  }
  for (const [family, declared] of table.families) {
    const listed = [...new Set([...declared].filter((name) => !ignored(name)))].sort()
    const found = [...(actual.get(family) ?? [])].sort()
    if (listed.length !== found.length || listed.some((name, index) => name !== found[index])) {
      pushIssue(issues, file, "error", "namespace-count", `族 ${family} 的技能表为 [${listed.join(", ")}]，实际为 [${found.join(", ")}]`)
    }
  }
}

// 机器相关绝对路径与常见令牌的最小模式集：只拦可证实暴露本机环境或凭据的写法
const SENSITIVE_PATTERNS: Array<{ code: string; label: string; re: RegExp }> = [
  { code: "secret-private-key", label: "私钥块", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  {
    code: "secret-token",
    label: "疑似访问令牌",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,})\b/,
  },
  {
    code: "machine-path",
    label: "机器相关绝对路径",
    // 盘符 + 用户目录、/Users/ 与 /home/；<placeholder> / example / username / user / runner 等通用示例放行
    re: /(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/](?!<|example\b|username\b|user\b)[^\\/\s"']+|\/Users\/(?!<|example\b|username\b|user\b)[A-Za-z0-9._-]+|\/home\/(?!<|example\b|username\b|user\b|runner\b)[A-Za-z0-9._-]+)/,
  },
]

// 展示路径：cwd 内用相对路径（统一正斜杠），cwd 外用绝对路径
function displayPath(file: string): string {
  const rel = relative(process.cwd(), file)
  return (rel && !rel.startsWith("..") ? rel : file).split(sep).join("/")
}

// 文本归一：统一换行，BOM 已由 readTextFile 去除；行尾差异不参与内容比较
function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n")
}

// 内容读取：优先取内存覆盖（bump 预演与写回前校验），否则读磁盘
type ContentOverrides = Map<string, string>

function contentOf(file: string, overrides: ContentOverrides): string {
  const key = file.replace(/\\/g, "/").toLowerCase()
  return overrides.get(key) ?? readTextFile(file)
}

// 行数：不把文件末尾换行形成的空行计入
function countLines(text: string): number {
  const normalized = normalizeText(text).replace(/\n$/, "")
  return normalized === "" ? 0 : normalized.split("\n").length
}

// 写入一条问题：路径统一走 displayPath，level 与 code 由调用方给出
function pushIssue(issues: SkillLintIssue[], file: string, level: "error" | "warn", code: string, message: string, line?: number): void {
  issues.push({ file: displayPath(file), ...(line === undefined ? {} : { line }), level, code, message })
}

// 收集技能目录：支持「目录本身就是技能」与「目录下逐个技能」两种形态
function collectTargets(dirs: string[], ignores: string[], issues: SkillLintIssue[]): { targets: SkillTarget[]; ignored: number } {
  const targets: SkillTarget[] = []
  const seenDirs = new Set<string>()
  let ignored = 0
  // 同一技能目录可能由多个参数指向，按真实路径去重，避免重复报告
  const pushTarget = (target: SkillTarget) => {
    if (seenDirs.has(target.dir)) return
    seenDirs.add(target.dir)
    if (isIgnored(target, ignores)) {
      ignored += 1
      return
    }
    targets.push(target)
  }
  for (const raw of dirs) {
    const abs = resolve(raw)
    if (!existsSync(abs)) {
      pushIssue(issues, abs, "error", "target-missing", `技能目录不存在：${raw}`)
      continue
    }
    let stat
    try {
      stat = statSync(abs)
    } catch (e) {
      pushIssue(issues, abs, "error", "target-unreadable", `技能目录不可读：${(e as Error).message}`)
      continue
    }
    if (!stat.isDirectory()) {
      pushIssue(issues, abs, "error", "target-not-directory", `目标不是目录：${raw}`)
      continue
    }
    const root = realPath(abs)
    if (existsSync(join(root, SKILL_ENTRY))) {
      pushTarget({ dir: root, name: basename(root), root })
      continue
    }
    let names: string[]
    try {
      names = readdirSync(root).sort()
    } catch (e) {
      pushIssue(issues, abs, "error", "target-unreadable", `技能目录不可读：${(e as Error).message}`)
      continue
    }
    const found: SkillTarget[] = []
    for (const name of names) {
      const dir = join(root, name)
      let entryStat
      try {
        entryStat = lstatSync(dir)
      } catch {
        continue
      }
      if (!entryStat.isDirectory() && !entryStat.isSymbolicLink()) continue
      if (!existsSync(join(dir, SKILL_ENTRY))) continue
      const real = realPath(dir)
      // 符号链接越出检查根即拒绝，避免把检查根之外的仓库内容纳入校验
      if (real !== root && !isInside(real, root)) {
        pushIssue(issues, join(dir, SKILL_ENTRY), "error", "symlink-escape", `技能目录越出检查根：${name}`)
        continue
      }
      found.push({ dir: real, name, root })
    }
    if (found.length === 0) {
      pushIssue(issues, abs, "error", "no-skills", `目录下没有技能（缺少 ${SKILL_ENTRY}）：${raw}`)
      continue
    }
    found.forEach(pushTarget)
  }
  return { targets, ignored }
}

// 忽略判定：技能目录名或相对检查根的路径命中任一 glob 即跳过
function isIgnored(target: SkillTarget, ignores: string[]): boolean {
  if (ignores.length === 0) return false
  const rel = toRepoRel(target.root, target.dir) || target.name
  return ignores.some((pattern) => matchGlob(target.name, pattern) || matchGlob(rel, pattern))
}

// 遍历技能文件：真实路径防环，符号链接越出技能目录即报错
function walkSkillFiles(target: SkillTarget, issues: SkillLintIssue[]): SkillFile[] {
  const root = target.dir
  const seen = new Set<string>()
  const files: SkillFile[] = []
  const walk = (dir: string, rel: string) => {
    const real = realPath(dir)
    if (seen.has(real)) return
    seen.add(real)
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      pushIssue(issues, join(root, SKILL_ENTRY), "error", "skill-unreadable", `技能目录不可读：${(e as Error).message}`)
      return
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name)
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      let entryStat
      try {
        entryStat = lstatSync(abs)
      } catch {
        continue
      }
      if (entryStat.isSymbolicLink()) {
        const realTarget = realPath(abs)
        if (realTarget !== root && !isInside(realTarget, root)) {
          pushIssue(issues, abs, "error", "symlink-escape", `符号链接越出技能目录：${childRel}`)
          continue
        }
      }
      let targetStat
      try {
        targetStat = statSync(abs)
      } catch {
        continue
      }
      if (targetStat.isDirectory()) walk(abs, childRel)
      else if (targetStat.isFile()) files.push({ abs, rel: childRel })
    }
  }
  walk(root, "")
  return files.sort((a, b) => a.rel.localeCompare(b.rel))
}

// 从 Markdown 提取引用：链接与行内代码两种写法，剝离锚点并排除外链 / 占位符 / 通配
function markdownReferences(text: string): string[] {
  const refs = new Set<string>()
  for (const matched of text.matchAll(/\]\(([^)\s]+)\)/g)) refs.add(matched[1] ?? "")
  for (const matched of text.matchAll(/`([^`\n]+?\.md)`/g)) refs.add(matched[1] ?? "")
  return [...refs]
    .map((ref) => ref.split("#")[0]!.trim())
    .filter((ref) => {
      if (!ref || !ref.endsWith(".md")) return false
      if (ref.startsWith("#") || ref.startsWith("/")) return false
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref)) return false
      return !/[<>{}*]/.test(ref)
    })
}

// 引用候选路径：依次按所在目录、技能根、检查根解析
function referenceCandidates(ref: string, fileDir: string, target: SkillTarget): string[] {
  const normalized = ref.replace(/\\/g, "/").replace(/^\.\//, "")
  return [resolve(fileDir, normalized), resolve(target.dir, normalized), resolve(target.root, normalized)]
}

// references 检查：只校验落在 references/ 路径面的引用；可达性按技能根与检查根兜底，越出检查根即报错
function checkReferences(target: SkillTarget, files: SkillFile[], issues: SkillLintIssue[], overrides: ContentOverrides): void {
  const unresolved = new Map<string, string>()
  for (const file of files) {
    if (!file.rel.endsWith(".md")) continue
    const text = contentOf(file.abs, overrides)
    for (const ref of markdownReferences(text)) {
      // 检查面只覆盖 references 路径：仓库级文档（SPEC.md / AGENTS.md）不属技能引用
      if (!ref.replace(/\\/g, "/").includes(`${REFERENCES_DIR}/`)) continue
      const candidates = referenceCandidates(ref, dirname(file.abs), target)
      // 越界判定以第一候选为准：相对引用本身已跑出检查根
      const primary = candidates[0]!
      if (primary !== target.root && !isInside(primary, target.root)) {
        if (!unresolved.has(ref)) unresolved.set(ref, `引用越出检查根：${ref}`)
        continue
      }
      if (!candidates.some((candidate) => existsSync(candidate))) {
        if (!unresolved.has(ref)) unresolved.set(ref, `引用不存在：${ref}`)
      }
    }
  }
  for (const message of unresolved.values()) pushIssue(issues, join(target.dir, SKILL_ENTRY), "error", "reference-invalid", message)
}

// 未被入口或同技能文档引用的 references 文件：只告警，避免拆档后留下死文件
function checkUnusedReferences(target: SkillTarget, files: SkillFile[], issues: SkillLintIssue[], overrides: ContentOverrides): void {
  const referenced = new Set<string>()
  for (const file of files) {
    if (!file.rel.endsWith(".md")) continue
    for (const ref of markdownReferences(contentOf(file.abs, overrides))) referenced.add(basename(ref))
  }
  for (const file of files) {
    if (!file.rel.startsWith(`${REFERENCES_DIR}/`)) continue
    if (referenced.has(basename(file.rel))) continue
    pushIssue(issues, file.abs, "warn", "reference-unused", `未被引用的 reference：${file.rel}`)
  }
}

// 敏感信息扫描：入口与 references 内容同时生效，命中即错误
function checkSensitive(target: SkillTarget, files: SkillFile[], issues: SkillLintIssue[], overrides: ContentOverrides): void {
  for (const file of files) {
    const inFace = file.rel === SKILL_ENTRY || file.rel.startsWith(`${REFERENCES_DIR}/`)
    if (!inFace || !file.rel.endsWith(".md")) continue
    const text = normalizeText(contentOf(file.abs, overrides))
    for (const pattern of SENSITIVE_PATTERNS) {
      const matched = pattern.re.exec(text)
      if (!matched) continue
      const line = text.slice(0, matched.index).split("\n").length
      pushIssue(issues, file.abs, "error", pattern.code, `疑似${pattern.label}：${matched[0]}`, line)
    }
  }
}

// 入口篇幅：字符硬上限与行数两档阈值；超硬上限报错，超告警线只告警
function checkBudget(entry: string, issues: SkillLintIssue[], options: { warnLines: number; maxLines: number; budget: number; warnChars: number }, overrides: ContentOverrides): void {
  const text = normalizeText(contentOf(entry, overrides))
  const chars = text.length
  const lines = countLines(text)
  const hard = chars > options.budget || lines > options.maxLines
  if (hard) {
    pushIssue(issues, entry, "error", "budget-exceeded", `入口超出硬上限：${lines} 行 / ${chars} 字符（上限 ${options.maxLines} 行 / ${options.budget} 字符）`)
    return
  }
  if (chars > options.warnChars || lines > options.warnLines) {
    pushIssue(issues, entry, "warn", "budget-warn", `入口超出告警线：${lines} 行 / ${chars} 字符（告警线 ${options.warnLines} 行 / ${options.warnChars} 字符）`)
  }
}

// git 调用：超时与执行失败统一由 status 判定，不抛异常
function runGit(args: string[], cwd: string) {
  return spawnSync("git", args, { cwd, encoding: "utf8", timeout: 15000 })
}

// 基准仓库信息：按检查根缓存，避免逐技能重复探测
interface BaseRepoInfo {
  root?: string
  skip?: string
}

// 解析基准仓库与基准提交可用性：非仓库 / 浅克隆 / 基准不存在时给出明确跳过原因
function resolveBaseRepo(target: SkillTarget, base: string, cache: Map<string, BaseRepoInfo>): BaseRepoInfo {
  const cached = cache.get(target.root)
  if (cached) return cached
  const probe = runGit(["rev-parse", "--show-toplevel"], target.root)
  if (probe.status !== 0) {
    const info = { skip: `检查根不在 git 仓库内（${displayPath(target.root)}）` }
    cache.set(target.root, info)
    return info
  }
  const root = probe.stdout.trim()
  const verify = runGit(["rev-parse", "--verify", "--quiet", `${base}^{commit}`], root)
  if (verify.status !== 0) {
    const shallow = runGit(["rev-parse", "--is-shallow-repository"], root).stdout.trim() === "true"
    const info = { skip: shallow ? `浅克隆缺少基准提交 ${base}` : `基准提交 ${base} 不存在` }
    cache.set(target.root, info)
    return info
  }
  const info = { root }
  cache.set(target.root, info)
  return info
}

// 版本递增校验：技能内容相对基准有变更时，当前版本必须高于基准版本
function checkVersionBump(target: SkillTarget, files: SkillFile[], base: string, repo: BaseRepoInfo, issues: SkillLintIssue[], overrides: ContentOverrides): void {
  const repoRoot = repo.root
  if (!repoRoot) return
  const rel = toRepoRel(repoRoot, target.dir)
  if (!rel || rel.startsWith("..")) return
  const listed = runGit(["ls-tree", "-r", "--name-only", base, "--", rel], repoRoot)
  if (listed.status !== 0) {
    pushIssue(issues, join(target.dir, SKILL_ENTRY), "error", "base-unreadable", `无法读取基准提交中的技能内容：${base}`)
    return
  }
  const baseFiles = listed.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  // 新增技能在基准中不存在，不要求递增
  if (baseFiles.length === 0) return
  const current = new Map(files.map((file) => [file.rel, file.abs]))
  let changed = baseFiles.length !== current.size
  for (const baseFile of baseFiles) {
    const relToSkill = baseFile.slice(rel.length + 1)
    const abs = current.get(relToSkill)
    if (!abs) {
      changed = true
      break
    }
    const shown = runGit(["show", `${base}:${baseFile}`], repoRoot)
    if (shown.status !== 0 || normalizeText(shown.stdout) !== normalizeText(readTextFile(abs))) {
      changed = true
      break
    }
  }
  if (!changed) return
  const baseEntry = runGit(["show", `${base}:${rel}/${SKILL_ENTRY}`], repoRoot)
  const baseVersion = baseEntry.status === 0 ? readFrontmatterVersionFromContent(baseEntry.stdout) : ""
  if (!baseVersion || !parseSkillVersion(baseVersion)) {
    pushIssue(issues, join(target.dir, SKILL_ENTRY), "error", "base-version-missing", `相对基准 ${base} 有内容变更，但基准版本缺失或非法，无法校验递增`)
    return
  }
  const version = readFrontmatterVersionFromContent(contentOf(join(target.dir, SKILL_ENTRY), overrides))
  if (!STRICT_VERSION_PATTERN.test(version)) return
  if (!versionGt(version, baseVersion)) {
    pushIssue(
      issues,
      join(target.dir, SKILL_ENTRY),
      "error",
      "version-not-bumped",
      `相对基准 ${base} 有内容变更，版本须高于 ${baseVersion}（当前 ${version}）；用 toolkit skill bump ${target.name} patch 递增`,
    )
  }
}

// 单个技能的结构与规范检查
interface LintRules {
  warnLines: number
  maxLines: number
  budget: number
  warnChars: number
  prefix: string
}

function lintSkill(target: SkillTarget, options: LintRules, issues: SkillLintIssue[], overrides: ContentOverrides, namespace?: NamespaceTable): SkillFile[] {
  const entry = join(target.dir, SKILL_ENTRY)
  const files = walkSkillFiles(target, issues)
  const content = normalizeText(contentOf(entry, overrides))
  // 目录命名：小写 kebab 且带约定前缀
  if (!DIR_NAME_PATTERN.test(target.name) || !target.name.startsWith(options.prefix)) {
    pushIssue(issues, entry, "error", "dir-name", `技能目录名须为小写 kebab 且以 ${options.prefix || "（空前缀）"} 开头：${target.name}`)
  }
  // 命名族与元数据：仅检查根存在族表时启用（外部技能目录不强制）
  if (namespace) checkNamespace(target, content, namespace, issues)
  // frontmatter：整块存在性与必填字段
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(content)) {
    pushIssue(issues, entry, "error", "frontmatter-missing", "缺少 frontmatter 块")
  }
  for (const field of REQUIRED_FIELDS) {
    if (!readSkillFrontmatterValueFromContent(content, field)) pushIssue(issues, entry, "error", "field-missing", `frontmatter 缺少必填字段：${field}`)
  }
  const name = readSkillFrontmatterValueFromContent(content, "name")
  if (name && name !== target.name) pushIssue(issues, entry, "error", "name-mismatch", `frontmatter name 与目录名不一致：${name} ≠ ${target.name}`)
  const tier = readSkillFrontmatterValueFromContent(content, "tier")
  if (tier && !TIERS.includes(tier)) pushIssue(issues, entry, "error", "tier-invalid", `metadata.tier 仅支持 ${TIERS.join(" / ")}：${tier}`)
  // 版本：严格三段式 + 正文双写一致
  const version = readFrontmatterVersionFromContent(content)
  if (version && !STRICT_VERSION_PATTERN.test(version)) pushIssue(issues, entry, "error", "version-format", `metadata.version 须为严格 x.y.z：${version}`)
  const bodyVersion = readBodyVersionFromContent(content)
  if (!bodyVersion) pushIssue(issues, entry, "error", "body-version-missing", "正文缺少「本技能版本」声明")
  else if (version && bodyVersion !== version) {
    pushIssue(issues, entry, "error", "version-mismatch", `版本双写位不一致：frontmatter ${version} / 正文 ${bodyVersion}（运行 toolkit skill bump ${target.name} patch 同步）`)
  }
  checkBudget(entry, issues, options, overrides)
  checkReferences(target, files, issues, overrides)
  checkUnusedReferences(target, files, issues, overrides)
  checkSensitive(target, files, issues, overrides)
  return files
}

// 技能规范校验入口：返回结构化报告，命令层据此决定输出与退出码
export function lintSkills(options: SkillLintOptions = {}): SkillLintReport {
  const issues: SkillLintIssue[] = []
  const prefix = options.prefix ?? DEFAULT_PREFIX
  const warnLines = options.warnLines ?? DEFAULT_WARN_LINES
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES
  const maxChars = options.budget ?? DEFAULT_MAX_CHARS
  // 未显式给 --budget 时直接用默认常量，显式给值时按同比例缩放
  const warnChars = options.budget === undefined ? DEFAULT_WARN_CHARS : Math.floor(maxChars * WARN_CHARS_RATIO)
  const dirs = options.dirs && options.dirs.length > 0 ? options.dirs : [skillsSourceDir()]
  const ignores = options.ignore ?? []
  const { targets, ignored } = collectTargets(dirs, ignores, issues)
  // 内存覆盖键归一：Windows 路径分隔符与大小写差异不影响命中
  const overrides: ContentOverrides = new Map([...(options.contents ?? [])].map(([file, content]) => [file.replace(/\\/g, "/").toLowerCase(), content]))

  // 同名技能会互相覆盖安装产物，跨检查根同样拒绝
  const byName = new Map<string, SkillTarget>()
  for (const target of targets) {
    const seen = byName.get(target.name)
    if (!seen) {
      byName.set(target.name, target)
      continue
    }
    pushIssue(issues, join(target.dir, SKILL_ENTRY), "error", "duplicate-name", `技能名重复：${target.name}（另见 ${displayPath(join(seen.dir, SKILL_ENTRY))}）`)
  }

  // 定向校验：bump 只关心本次递增的技能
  const wanted = options.skills && options.skills.length > 0 ? new Set(options.skills) : null
  const selected = wanted ? targets.filter((target) => wanted.has(target.name)) : targets

  // 命名族表按检查根加载：表非法上报一次，族内归属按全部技能核对（定向校验不缩窄归属面）
  const namespaceCache = new Map<string, NamespaceLoad>()
  const namespaceOf = (root: string): NamespaceTable | undefined => {
    const cached = namespaceCache.get(root)
    if (cached) return cached.table
    const loaded = loadNamespaces(root)
    namespaceCache.set(root, loaded)
    if (loaded.error) pushIssue(issues, join(root, NAMESPACES_FILE), "error", "namespace-table", loaded.error)
    return loaded.table
  }
  for (const root of new Set(targets.map((target) => target.root))) {
    const table = namespaceOf(root)
    if (!table) continue
    checkNamespaceTable(root, targets.filter((target) => target.root === root), table, ignores, issues)
  }

  const base = options.base ?? null
  const repoCache = new Map<string, BaseRepoInfo>()
  let baseSkipped: string | null = null
  const files: string[] = []
  for (const target of selected) {
    files.push(displayPath(join(target.dir, SKILL_ENTRY)))
    const namespace = namespaceCache.get(target.root)?.table
    const skillFiles = lintSkill(target, { warnLines, maxLines, budget: maxChars, warnChars, prefix }, issues, overrides, namespace)
    if (!base) continue
    const repo = resolveBaseRepo(target, base, repoCache)
    if (repo.skip) {
      if (!baseSkipped) baseSkipped = repo.skip
      continue
    }
    checkVersionBump(target, skillFiles, base, repo, issues, overrides)
  }

  const sorted = issues.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.code.localeCompare(b.code))
  const errors = sorted.filter((issue) => issue.level === "error").length
  return {
    files: files.sort(),
    issues: sorted,
    summary: {
      skills: selected.length,
      errors,
      warnings: sorted.length - errors,
      ignored,
      base,
      baseSkipped,
    },
  }
}
