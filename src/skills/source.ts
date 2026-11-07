// 技能真源与现场：包根定位、技能清单与元数据读取、目标目录解析、现场产物判型与写入
// 链接创建失败自动降级为副本；所有路径比较先取磁盘真实形态再归一，避免同一目录多种写法被判成两处
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync } from "node:fs"
import type { Dirent } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { getHomeDir } from "../config"
import { resolveCacheEntry } from "../cache"
import { normalizePathForCompare } from "../git-ignore"
import { PROJECT_SKILL_DIRS, resolveProjectSkillDirs } from "../conventions/entry"
import { readTextFile } from "../read-text"
import {
  AGENT_SKILL_DIRS,
  BUILTIN_SOURCE,
  CANONICAL_DIR,
  CANONICAL_LABEL,
  CANONICAL_TARGET_NAME,
  LEGACY_SKILL_DIRS,
  PKG_NAME,
  PROJECT_SOURCE_DIR,
  SKILL_ENTRY,
  type AgentEntry,
  type ArtifactMode,
  type PackageSkill,
  type ProjectTargets,
  type SkillItem,
  type SkillScope,
  type SkillTarget,
  type SkillTier,
  type SkillVersionMismatch,
  type TargetKind,
} from "./types"

// 包根定位结果缓存（一次进程内不变）
let cachedRoot: string | undefined
// 链接锚点缓存：与包根同批解析，一次进程内不变
let cachedLinkRoot: string | undefined
// 包版本缓存：状态文件里记录内置来源版本
let cachedVersion: string | undefined

// 从当前模块位置逐级向上找 name 为 @fxri/toolkit 的 package.json，得到包根绝对路径
function resolvePackageRoot(): string {
  if (cachedRoot) return cachedRoot
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const pkgFile = join(dir, "package.json")
    if (existsSync(pkgFile)) {
      try {
        const data = JSON.parse(readTextFile(pkgFile)) as { name?: unknown }
        if (data.name === PKG_NAME) {
          cachedRoot = dir
          return dir
        }
      } catch {
        // 非法 JSON 视为非目标包，继续向上
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`未能从模块位置向上定位 ${PKG_NAME} 的包根目录`)
}

// 重置包根、链接锚点与版本缓存（测试用：不改变结果，仅保证跨用例干净）
export function resetSkillsRootCache(): void {
  cachedRoot = undefined
  cachedLinkRoot = undefined
  cachedVersion = undefined
}

// 仅测试用：注入包根，使真源与链接锚点解析落在临时目录上
export function setPackageRootForTest(dir: string): void {
  cachedRoot = dir
  cachedLinkRoot = undefined
  cachedVersion = undefined
}

// 真源目录：包内 skills/
export function skillsSourceDir(): string {
  return join(resolvePackageRoot(), "skills")
}

// 包根目录（供 skills path 输出，便于委托上游安装器：pnpm dlx skills add "$(toolkit skills path)" -g）
export function skillsPackageDir(): string {
  return resolvePackageRoot()
}

// 包版本：状态文件记录来源版本，供后续判断来源是否升级
export function packageVersion(): string {
  if (cachedVersion) return cachedVersion
  try {
    const data = JSON.parse(readTextFile(join(resolvePackageRoot(), "package.json"))) as { version?: unknown }
    cachedVersion = typeof data.version === "string" ? data.version : ""
  } catch {
    cachedVersion = ""
  }
  return cachedVersion
}

// pnpm 稳定入口：从包根推出不随版本段漂移的入口目录
// pnpm 把包实体放在 <模块目录>/.pnpm/<包目录>/node_modules/<包名>，并在 <模块目录>/<包名> 建指向它的入口，
// 升级时只重写该入口；软链锚在入口上即跨版本存活。非 pnpm 布局（包实体即真实目录）返回空串
// 模块目录（.pnpm 所在层）随安装方式变化：项目内即 <项目>/node_modules，全局安装为 <pnpm 全局>/<global 段>（.pnpm 与 node_modules 并列），故按目录名判定并补 node_modules 层
export function pnpmStableEntry(pkgRoot: string): string {
  let dir = resolve(pkgRoot)
  for (;;) {
    const parent = dirname(dir)
    if (parent === dir) return ""
    if (basename(parent) === ".pnpm") {
      const container = dirname(parent)
      const moduleDir = basename(container) === "node_modules" ? container : join(container, "node_modules")
      return join(moduleDir, PKG_NAME)
    }
    dir = parent
  }
}

// 链接锚点：优先 pnpm 稳定入口，不可用则回落包根真源
// 必须校验候选的真实路径与包根一致——锚到别的版本或别的包上不会当场报错，只会在升级后断链
function resolveLinkRoot(): string {
  if (cachedLinkRoot) return cachedLinkRoot
  const root = resolvePackageRoot()
  let anchor = ""
  try {
    const candidate = pnpmStableEntry(root)
    if (candidate && existsSync(candidate) && pathKey(realpathSync(candidate)) === pathKey(realpathSync(root))) anchor = candidate
  } catch {
    // 探活失败（权限、竞态删除等）不作为锚点，静默回落真源
  }
  cachedLinkRoot = anchor || root
  return cachedLinkRoot
}

// 链接锚点目录：期望写进软链的目标（pnpm 布局下为稳定入口的 skills/，其余布局下即真源）
export function skillsLinkDir(): string {
  return join(resolveLinkRoot(), "skills")
}

// 读取技能真源版本：SKILL.md frontmatter 内 metadata.version（缩进键）；文件缺失、无 frontmatter 或未声明版本一律返回空串，不抛错
export function readSkillVersion(dir: string): string {
  return readFrontmatterIndented(dir, "version")
}

// 读取技能分层：frontmatter metadata.tier，仅认 core / optional，缺省或非法按 optional
export function readSkillTier(dir: string): SkillTier {
  return readFrontmatterIndented(dir, "tier") === "core" ? "core" : "optional"
}

// 读取依赖声明：frontmatter metadata.requires，支持 [a, b] 行内数组与单值
// 行内数组含引号，不能复用只认无引号值的 readFrontmatterIndented
export function readSkillRequires(dir: string): string[] {
  try {
    const content = readTextFile(join(dir, SKILL_ENTRY))
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!frontmatter) return []
    const matched = (frontmatter[1] ?? "").match(/^[ \t]+requires:[ \t]*(.+)$/m)
    if (!matched) return []
    const raw = (matched[1] ?? "").trim()
    const inner = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw
    return inner
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
  } catch {
    return []
  }
}

// 读取 frontmatter metadata 下的单个缩进键值
function readFrontmatterIndented(dir: string, key: string): string {
  try {
    const content = readTextFile(join(dir, SKILL_ENTRY))
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!frontmatter) return ""
    const matched = (frontmatter[1] ?? "").match(new RegExp(`^[ \\t]+${key}:[ \\t]*"?([^"\\r\\n]+?)"?[ \\t]*$`, "m"))
    return matched ? (matched[1] ?? "").trim() : ""
  } catch {
    return ""
  }
}

// 读取技能正文版本：正文首部 `> 本技能版本 x.y.z（…）` 声明值；文件缺失或未声明返回空串，不抛错
export function readSkillBodyVersion(dir: string): string {
  try {
    const content = readTextFile(join(dir, SKILL_ENTRY))
    const matched = content.match(/^>[ \t]*本技能版本[ \t]*([^ \t（(]+)/m)
    return matched ? (matched[1] ?? "").trim() : ""
  } catch {
    return ""
  }
}

// 读取技能描述：SKILL.md frontmatter 的 description 单行值；缺失返回空串（薄壳触发面由此派生，与真源一致）
export function readSkillDescription(dir: string): string {
  try {
    const content = readTextFile(join(dir, SKILL_ENTRY))
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!frontmatter) return ""
    const matched = (frontmatter[1] ?? "").match(/^description:[ \t]*"?([^"\r\n]+?)"?[ \t]*$/m)
    return matched ? (matched[1] ?? "").trim() : ""
  } catch {
    return ""
  }
}

// 版本双写位比对：frontmatter metadata.version 与正文「本技能版本」声明不一致的条目（含正文漏写，供软告警）
export function findSkillVersionMismatches(skills: PackageSkill[]): SkillVersionMismatch[] {
  const out: SkillVersionMismatch[] = []
  for (const skill of skills) {
    // 未声明 frontmatter 版本（兼容第三方技能）无从比对，跳过
    if (!skill.version) continue
    const body = readSkillBodyVersion(skill.dir)
    if (body !== skill.version) out.push({ name: skill.name, frontmatter: skill.version, body })
  }
  return out
}

// 列出包内技能（含 SKILL.md 的目录），按名称排序
export function listPackageSkills(): PackageSkill[] {
  const root = skillsSourceDir()
  if (!existsSync(root)) return []
  const out: PackageSkill[] = []
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name)
    try {
      if (!lstatSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    if (!existsSync(join(dir, SKILL_ENTRY))) continue
    out.push({ name, dir, version: readSkillVersion(dir), tier: readSkillTier(dir), requires: readSkillRequires(dir) })
  }
  return out
}

// 读取技能名：SKILL.md frontmatter 顶层 name；缺失返回空串
export function readSkillName(dir: string): string {
  try {
    const content = readTextFile(join(dir, SKILL_ENTRY))
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!frontmatter) return ""
    const matched = (frontmatter[1] ?? "").match(/^name:[ \t]*"?([^"\r\n]+?)"?[ \t]*$/m)
    return matched ? (matched[1] ?? "").trim() : ""
  } catch {
    return ""
  }
}

// 外部来源清单文件名与当前格式版本
export const SKILLS_MANIFEST_FILE = "skills.json"
const MANIFEST_FORMAT_VERSION = 1

// 清单条目：path 相对来源根；name 可覆盖目录名
interface ManifestEntry {
  name?: string
  path: string
}

interface SkillsManifest {
  formatVersion: number
  name?: string
  version?: string
  skills: ManifestEntry[]
}

// 解析后的技能来源：内置源与外部来源共用
export interface SkillSource {
  name: string
  kind: "builtin" | "local"
  // 来源根绝对路径（已归一为磁盘真实形态）；远程来源为本地缓存目录
  root: string
  // 远程来源地址与 ref；本地来源为空
  url?: string
  ref?: string
  version: string
  temporary: boolean
  skills: PackageSkill[]
}

// 读取 skills.json：文件不存在返回 null；存在但格式非法直接抛错，不静默回退到目录扫描
function readManifest(root: string): SkillsManifest | null {
  const file = join(root, SKILLS_MANIFEST_FILE)
  if (!existsSync(file)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(readTextFile(file)) as unknown
  } catch {
    throw new Error(`技能清单解析失败：${file}`)
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`技能清单顶层须为对象：${file}`)
  const data = parsed as Record<string, unknown>
  if (data.formatVersion !== MANIFEST_FORMAT_VERSION) {
    throw new Error(`技能清单 formatVersion 须为 ${MANIFEST_FORMAT_VERSION}（实际：${String(data.formatVersion)}）：${file}`)
  }
  if (!Array.isArray(data.skills) || data.skills.length === 0) throw new Error(`技能清单 skills 须为非空数组：${file}`)
  const skills: ManifestEntry[] = []
  for (const raw of data.skills) {
    if (typeof raw === "string") {
      skills.push({ path: raw })
      continue
    }
    if (typeof raw !== "object" || raw === null) throw new Error(`技能清单条目须为字符串或对象：${file}`)
    const entry = raw as Record<string, unknown>
    if (typeof entry.path !== "string" || entry.path.trim() === "") throw new Error(`技能清单条目缺少 path：${file}`)
    skills.push({
      path: entry.path,
      name: typeof entry.name === "string" && entry.name.trim() !== "" ? entry.name.trim() : undefined,
    })
  }
  return {
    formatVersion: MANIFEST_FORMAT_VERSION,
    name: typeof data.name === "string" ? data.name : undefined,
    version: typeof data.version === "string" ? data.version : undefined,
    skills,
  }
}

// 校验技能目录落在来源根之内：软链解析后越界即拒绝，避免把来源外内容纳入分发
function assertInsideSource(root: string, dir: string): string {
  const realRoot = realPath(root)
  const realDir = realPath(dir)
  if (realDir !== realRoot && !isInside(realDir, realRoot)) throw new Error(`技能目录越出来源根：${dir}`)
  if (!existsSync(join(realDir, SKILL_ENTRY))) throw new Error(`技能目录缺少 ${SKILL_ENTRY}：${realDir}`)
  return realDir
}

// 构造包内技能条目：名称优先取 frontmatter name，其次目录名
function packageSkill(dir: string, name?: string): PackageSkill {
  return {
    name: name || readSkillName(dir) || basename(dir),
    dir,
    version: readSkillVersion(dir),
    tier: readSkillTier(dir),
    requires: readSkillRequires(dir),
  }
}

// 解析外部本地来源：支持根 SKILL.md 单技能、skills/*/SKILL.md 多技能、skills.json 清单三种形态
export function resolveLocalSource(src: string, options: { name?: string; temporary?: boolean } = {}): SkillSource {
  const root = resolve(src)
  if (!existsSync(root)) throw new Error(`技能来源不存在：${root}`)
  let stat
  try {
    stat = lstatSync(root)
  } catch (e) {
    throw new Error(`技能来源不可读：${root}（${(e as Error).message}）`, { cause: e })
  }
  if (!stat.isDirectory()) throw new Error(`技能来源须为目录：${root}`)
  const realRoot = realPath(root)
  const manifest = readManifest(realRoot)
  const skills: PackageSkill[] = []
  if (manifest) {
    for (const entry of manifest.skills) skills.push(packageSkill(assertInsideSource(realRoot, resolve(realRoot, entry.path)), entry.name))
  } else if (existsSync(join(realRoot, SKILL_ENTRY))) {
    skills.push(packageSkill(realRoot))
  } else {
    const skillsDir = join(realRoot, "skills")
    if (!existsSync(skillsDir)) throw new Error(`未找到技能：${realRoot}（需根 ${SKILL_ENTRY}、skills/*/${SKILL_ENTRY} 或 ${SKILLS_MANIFEST_FILE}）`)
    for (const name of readdirSync(skillsDir).sort()) {
      const dir = join(skillsDir, name)
      if (!existsSync(join(dir, SKILL_ENTRY))) continue
      skills.push(packageSkill(assertInsideSource(realRoot, dir)))
    }
    if (skills.length === 0) throw new Error(`未找到技能：${skillsDir}`)
  }
  // 同一来源内重名会覆盖状态与产物，直接拒绝
  const seen = new Set<string>()
  for (const skill of skills) {
    if (seen.has(skill.name)) throw new Error(`来源 ${options.name || realRoot} 内技能名重复：${skill.name}`)
    seen.add(skill.name)
  }
  const derived = (options.name || manifest?.name || basename(realRoot)).trim()
  if (!derived) throw new Error(`无法确定来源名：${realRoot}`)
  return {
    name: derived,
    kind: "local",
    root: realRoot,
    version: manifest?.version ?? "",
    temporary: options.temporary !== false,
    skills,
  }
}

// 远程来源描述：规范化地址 + 可选 ref
export interface RemoteSpec {
  url: string
  ref?: string
}

// 判断输入是否为远程地址（本地盘符路径不在此列）
function isRemoteSpec(spec: string): boolean {
  return /^(?:https?:\/\/|ssh:\/\/|git@|github:|file:\/\/)/.test(spec.trim())
}

// 解析远程地址：github: 简写展开、#ref 拆分、常见写法归一
export function parseRemoteSpec(spec: string): RemoteSpec {
  const hash = spec.lastIndexOf("#")
  const rawUrl = hash > 0 ? spec.slice(0, hash) : spec
  const ref = hash > 0 ? spec.slice(hash + 1).trim() : ""
  let url = rawUrl.trim()
  if (url.startsWith("github:")) url = `https://github.com/${url.slice("github:".length)}`
  if (!/^(?:https?:\/\/|ssh:\/\/|git@|file:\/\/)/.test(url)) throw new Error(`无法识别的技能来源：${spec}`)
  // 常见写法归一为同一来源标识：去末尾斜杠与 .git 后缀（file:// 保留原路径形态）
  if (!url.startsWith("file://")) url = url.replace(/\/+$/, "").replace(/\.git$/, "")
  if (url.startsWith("http://")) console.warn(`⚠️ 远程来源使用明文 HTTP：${url}，建议改用 HTTPS`)
  return { url, ref: ref || undefined }
}

// 统一来源入口：本地路径优先，其余按远程地址克隆到缓存后再复用本地解析
export function resolveSource(spec: string, options: { name?: string; temporary?: boolean; dryRun?: boolean } = {}): SkillSource {
  if (isRemoteSpec(spec)) return resolveRemoteSource(spec, options)
  return resolveLocalSource(spec, options)
}

// 刷新远程来源缓存：未缓存则克隆，已缓存则 fetch + checkout；本地来源由调用方直接重读
export function refreshRemoteSource(spec: string): void {
  if (!isRemoteSpec(spec)) return
  const parsed = parseRemoteSpec(spec)
  const dest = remoteCacheDir(parsed)
  if (!existsSync(dest)) cloneRemote(parsed, dest)
  else refreshRemote(dest, parsed)
}

// 远程来源缓存目录：地址 + ref 派生稳定标识，统一落在用户级缓存 ~/.toolkit/cache/skill-sources
// 旧版 ~/.agents/.toolkit-sources 在首次访问时惰性迁移
function remoteCacheDir(spec: RemoteSpec): string {
  const key = createHash("sha256").update(`${spec.url}@${spec.ref ?? ""}`).digest("hex").slice(0, 16)
  return resolveCacheEntry(join("skill-sources", key), join(getHomeDir(), ".agents", ".toolkit-sources", key), "dir")
}

// 仓库名：地址最后一段去 .git 后缀，作为 manifest 未声明 name 时的来源名
function remoteRepoName(url: string): string {
  const cleaned = url.replace(/\/+$/, "").replace(/\.git$/, "")
  return cleaned.split(/[/:]/).filter(Boolean).pop() ?? "remote"
}

// git 命令执行：失败带上 stderr，git 缺失单独归因
function runGit(args: string[]): void {
  const result = spawnSync("git", args, { encoding: "utf8" })
  if (result.error) throw new Error(`git 不可用：${result.error.message}`)
  if (result.status !== 0) throw new Error(`git ${args[0]} 失败：${(result.stderr || result.stdout || "").trim()}`)
}

// 克隆远程来源：分支 / 标签走 clone --branch，提交 SHA 走 init + fetch
function cloneRemote(spec: RemoteSpec, dest: string): void {
  const tmp = `${dest}.tmp-${process.pid}-${Date.now().toString(36)}`
  mkdirSync(dirname(dest), { recursive: true, mode: 0o700 })
  try {
    if (spec.ref && /^[0-9a-f]{40}$/i.test(spec.ref)) {
      mkdirSync(tmp, { recursive: true })
      runGit(["init", "-q", tmp])
      runGit(["-C", tmp, "remote", "add", "origin", spec.url])
      runGit(["-C", tmp, "fetch", "--depth", "1", "origin", spec.ref])
      runGit(["-C", tmp, "checkout", "-q", "FETCH_HEAD"])
    } else {
      const args = ["clone", "--depth", "1"]
      if (spec.ref) args.push("--branch", spec.ref)
      args.push(spec.url, tmp)
      runGit(args)
    }
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    renameSync(tmp, dest)
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true })
    throw e
  }
}

// 缓存刷新：失败保留旧缓存并告警，不阻断安装
function refreshRemote(cacheDir: string, spec: RemoteSpec): void {
  const ref = spec.ref ?? "HEAD"
  const fetched = spawnSync("git", ["-C", cacheDir, "fetch", "--depth", "1", "origin", ref], { encoding: "utf8" })
  if (fetched.status !== 0) {
    console.warn(`⚠️ 远程来源刷新失败，使用本地缓存：${spec.url}`)
    return
  }
  const checked = spawnSync("git", ["-C", cacheDir, "checkout", "-q", "FETCH_HEAD"], { encoding: "utf8" })
  if (checked.status !== 0) console.warn(`⚠️ 远程来源检出失败，使用本地缓存：${spec.url}`)
}

// 解析远程来源：缓存命中直接复用；dry-run 不写持久缓存
export function resolveRemoteSource(spec: string, options: { name?: string; temporary?: boolean; dryRun?: boolean } = {}): SkillSource {
  const remote = parseRemoteSpec(spec)
  const cacheDir = remoteCacheDir(remote)
  let root: string
  if (existsSync(cacheDir)) {
    refreshRemote(cacheDir, remote)
    root = cacheDir
  } else if (options.dryRun) {
    root = mkdtempSync(join(tmpdir(), "toolkit-src-"))
    process.once("exit", () => rmSync(root, { recursive: true, force: true }))
    cloneRemote(remote, root)
  } else {
    cloneRemote(remote, cacheDir)
    root = cacheDir
  }
  const local = resolveLocalSource(root, { name: options.name, temporary: options.temporary })
  const name = options.name || (local.name === basename(root) ? remoteRepoName(remote.url) : local.name)
  return { ...local, name, url: remote.url, ref: remote.ref }
}

// 内置来源：包内 skills/
export function resolveBuiltinSource(): SkillSource {
  return {
    name: BUILTIN_SOURCE,
    kind: "builtin",
    root: skillsPackageDir(),
    version: packageVersion(),
    temporary: false,
    skills: listPackageSkills(),
  }
}

// 来源 → 统一技能条目：内置源链接锚在 pnpm 稳定入口，外部来源直指技能真源目录
export function sourceSkillItems(source: SkillSource): SkillItem[] {
  return source.skills.map((skill) => ({
    ...skill,
    source: source.name,
    sourceKind: source.kind,
    sourceRoot: source.root,
    sourceUrl: source.url,
    sourceRef: source.ref,
    temporary: source.temporary,
    linkTarget: source.kind === "builtin" ? join(skillsLinkDir(), skill.name) : skill.dir,
  }))
}

// 跨来源同名检查：同名技能会共用落点与状态条目，直接报错而非静默覆盖
export function assertUniqueSkillNames(items: SkillItem[]): void {
  const seen = new Map<string, string>()
  for (const item of items) {
    const previous = seen.get(item.name)
    if (previous !== undefined) throw new Error(`技能名冲突：${item.name}（来源 ${previous} / ${item.source}）`)
    seen.set(item.name, item.source)
  }
}

// 依赖展开：按 requires 递归补全技能名；缺失依赖单独回报，由调用方告警
export function expandSkillRequires(items: SkillItem[], names: string[]): { names: string[]; missing: string[] } {
  const byName = new Map(items.map((item) => [item.name, item]))
  const result = new Set(names)
  const missing = new Set<string>()
  const visit = (name: string): void => {
    const item = byName.get(name)
    if (!item) return
    for (const dep of item.requires) {
      if (!byName.has(dep)) {
        missing.add(dep)
        continue
      }
      if (result.has(dep)) continue
      result.add(dep)
      visit(dep)
    }
  }
  for (const name of names) visit(name)
  return { names: [...result], missing: [...missing] }
}

// 路径比较键：先解析为绝对路径，再走统一比较口径（分隔符正斜杠 + 去尾斜杠 + 大小写折叠）
export function pathKey(p: string): string {
  return normalizePathForCompare(resolve(p))
}

// 剥离尾部分隔符：Windows junction 的 readlink 结果形如 C:\x\target\，直接比较会因尾部分隔符导致路径判定失配
export function stripTailSep(p: string): string {
  const n = normalize(p)
  if (/^[a-zA-Z]:[\\/]$/.test(n)) return n
  return n.replace(/[\\/]+$/, "") || n
}

// 分类现场产物：不存在 / 链接且指向真源或同内容目录 / 链接但指向其他版本 / 悬空链接 / 实体目录 / 普通文件
export type ExistingKind = "absent" | "link-ok" | "wrong" | "dangling" | "dir" | "file"

// 条目判型所需的最小结构：Dirent（readdirSync withFileTypes）与 Stats（lstatSync）均满足
export interface EntryType {
  isSymbolicLink(): boolean
  isDirectory(): boolean
}

// entry：调用方已列出的目录条目，省略则此处现查一次（查不到即视为不存在）
// altSource：可接受的另一指向——升级迁移期链接可能指向稳定锚点或真源，两种都算正常
export function classifyExisting(dest: string, source: string, entry?: EntryType, altSource = ""): ExistingKind {
  let dirent: EntryType
  if (entry) {
    dirent = entry
  } else {
    try {
      dirent = lstatSync(dest)
    } catch {
      return "absent"
    }
  }
  if (dirent.isSymbolicLink()) {
    let target = ""
    try {
      target = readlinkSync(dest)
    } catch {
      return "dangling"
    }
    const absTarget = stripTailSep(isAbsolute(target) ? target : resolve(dirname(dest), target))
    // 悬空优先判定：链接指向已不存在的位置时，无论指向何处都算悬空
    if (!existsSync(absTarget)) return "dangling"
    const targetKey = pathKey(absTarget)
    if (targetKey !== pathKey(source) && !(altSource && targetKey === pathKey(altSource))) {
      // 路径不同不等于内容不同：链接锚在别的安装时路径天然不相等，只要内容与真源逐字一致即视为正常
      const sameAsSource = sameDirContent(source, absTarget)
      const sameAsAlt = altSource !== "" && sameDirContent(altSource, absTarget)
      if (!sameAsSource && !sameAsAlt) return "wrong"
    }
    return "link-ok"
  }
  return dirent.isDirectory() ? "dir" : "file"
}

// 目录是否存在且为空（不存在 / 不可读按「非空」处理，避免误删有内容的目录）
export function isEmptyDir(dir: string): boolean {
  try {
    return readdirSync(dir).length === 0
  } catch {
    return false
  }
}

// 两目录内容是否逐字一致（任一侧缺失即按不一致处理）
export function sameDirContent(a: string, b: string): boolean {
  return existsSync(a) && existsSync(b) && dirsEqual(a, b)
}

// 递归比对两个目录内容是否一致（用于副本幂等判断与漂移检测），任何读取失败按「不一致」处理
export function dirsEqual(a: string, b: string): boolean {
  let aNames: string[]
  let bNames: string[]
  try {
    aNames = readdirSync(a).sort()
    bNames = readdirSync(b).sort()
  } catch {
    return false
  }
  if (aNames.length !== bNames.length || aNames.some((n, i) => n !== bNames[i])) return false
  for (const name of aNames) {
    const pa = join(a, name)
    const pb = join(b, name)
    let sa
    let sb
    try {
      sa = statSync(pa)
      sb = statSync(pb)
    } catch {
      return false
    }
    if (sa.isDirectory() !== sb.isDirectory()) return false
    if (sa.isDirectory()) {
      if (!dirsEqual(pa, pb)) return false
    } else {
      try {
        if (!readFileSync(pa).equals(readFileSync(pb))) return false
      } catch {
        return false
      }
    }
  }
  return true
}

// 读取环境变量目录：空值、纯空白与非绝对路径（XDG 规范要求绝对路径）一律视为未设置，回落默认路径
function envAbsoluteDir(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value && isAbsolute(value) ? value : undefined
}

// 解析 agent 全局技能目录：dirEnv 命中时用其值替换 dir 首段（如 XDG_CONFIG_HOME 替换 .config）
function resolveAgentDir(agent: AgentEntry): string {
  const override = agent.dirEnv ? envAbsoluteDir(agent.dirEnv) : undefined
  if (!override) return join(getHomeDir(), agent.dir)
  return join(override, ...agent.dir.split("/").slice(1))
}

// 解析 agent 探测路径：detect 中与 dir 同首段的相对路径随 dirEnv 迁移；detectEnv 把变量值（可加后缀）作为绝对路径补齐
function resolveAgentDetectPaths(agent: AgentEntry): string[] {
  const home = getHomeDir()
  const override = agent.dirEnv ? envAbsoluteDir(agent.dirEnv) : undefined
  const base = agent.dir.split("/")[0] ?? ""
  const paths: string[] = []
  for (const d of agent.detect ?? []) {
    if (override && (d === base || d.startsWith(`${base}/`))) paths.push(join(override, d.slice(base.length)))
    else paths.push(isAbsolute(d) ? d : join(home, d))
  }
  for (const [name, suffix] of Object.entries(agent.detectEnv ?? {})) {
    const value = envAbsoluteDir(name)
    if (value) paths.push(suffix ? join(value, suffix) : value)
  }
  return paths
}

// 解析目标三层：主目标 canonical → 快照表中「已安装」的 agent 全局技能目录 → --dir 兜底；同路径去重
export function resolveSkillTargets(extraDirs: string[] = []): SkillTarget[] {
  const out: SkillTarget[] = []
  const seen = new Set<string>()
  const push = (name: string, dir: string, label: string, kind: TargetKind, available: boolean) => {
    const abs = resolve(dir)
    const key = pathKey(abs)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name, dir: abs, label, kind, available, dirExists: existsSync(abs) })
  }
  push(CANONICAL_TARGET_NAME, join(getHomeDir(), CANONICAL_DIR), CANONICAL_LABEL, "primary", true)
  for (const agent of AGENT_SKILL_DIRS) {
    // 判据：技能目录的父目录（即 agent 配置目录）存在，或任一探测路径存在
    const dir = resolveAgentDir(agent)
    const available = existsSync(dirname(dir)) || resolveAgentDetectPaths(agent).some((p) => existsSync(p))
    push(agent.name, dir, agent.label, "agent", available)
  }
  for (const dir of extraDirs) push("", dir, "自定义 --dir", "custom", true)
  return out
}

// 目标选择解析结果：invalid 为未知目标名，unavailable 为已知但本机未检测到的 agent
export interface ResolvedTargets {
  targets: SkillTarget[]
  invalid: string[]
  unavailable: string[]
}

// 按名字解析本次写入目标：names 省略或为空数组时沿用全部可用目标（主目标 + 已检测 agent + --dir）
// 显式指定时只写选中项；本机未检测到的 agent 不凭空造目录，单列为 unavailable 由调用方告警
export function resolveTargetsByName(names: string[] | undefined, extraDirs: string[] = []): ResolvedTargets {
  const all = resolveSkillTargets(extraDirs)
  const custom = all.filter((target) => target.kind === "custom")
  if (!names || names.length === 0) {
    return { targets: all.filter((target) => target.available || target.kind === "custom"), invalid: [], unavailable: [] }
  }
  const byName = new Map(all.filter((target) => target.name).map((target) => [target.name, target]))
  const targets: SkillTarget[] = []
  const invalid: string[] = []
  const unavailable: string[] = []
  for (const name of names) {
    const target = byName.get(name)
    if (!target) {
      invalid.push(name)
      continue
    }
    if (!target.available) {
      unavailable.push(name)
      continue
    }
    targets.push(target)
  }
  // --dir 始终一次性写入，不参与长期选择
  targets.push(...custom)
  // 同路径去重（显式名字与 --dir 可能指向同一目录）
  const seen = new Set<string>()
  return {
    targets: targets.filter((target) => {
      const key = pathKey(target.dir)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
    invalid,
    unavailable,
  }
}

// 全部可选目标名：主目标 canonical + 已检测 agent（用于 --all-agents 与目标选择默认值）
export function availableTargetNames(): string[] {
  return resolveSkillTargets()
    .filter((target) => target.name && target.available)
    .map((target) => target.name)
}

// 解析本机已安装的 canonical 共读 agent：只按 detect 判定
// 不能复用 available：canonical 条目的配置目录是 ~/.agents，该目录恒存在，会把全部共读 agent 误报为已安装
export function resolveCanonicalReaders(): Array<{ name: string; label: string }> {
  return AGENT_SKILL_DIRS.filter(
    (agent) => agent.viaCanonical && resolveAgentDetectPaths(agent).some((p) => existsSync(p)),
  ).map((agent) => ({ name: agent.name, label: agent.label }))
}

// 真实形态归一：解析软链 / junction 后取真实路径，失败时退回 resolve 结果
export function realPath(p: string): string {
  try {
    return realpathSync.native(p)
  } catch {
    return resolve(p)
  }
}

// 判 sub 是否落在 root 之内（不含 root 自身）：比较时补正斜杠，避免 /a/bc 被误判为 /a/b 之下
export function isInside(sub: string, root: string): boolean {
  const sk = pathKey(stripTailSep(sub))
  const rk = pathKey(stripTailSep(root))
  return sk !== rk && sk.startsWith(`${rk}/`)
}

// 作用域判定：自 cwd 逐级向上，任一层含 package.json 且 CLI 包根落在其下 → 项目面（兼容 monorepo 子目录内执行）
// 源仓库（包根即项目根）恒走全局面：维护者靠全局技能自举，不把自身 skills/ 复制进自身仓库
export function detectSkillScope(cwd = process.cwd()): SkillScope {
  let pkgRoot: string
  try {
    pkgRoot = realPath(resolvePackageRoot())
  } catch {
    return "global"
  }
  let dir = resolve(cwd)
  for (;;) {
    if (existsSync(join(dir, "package.json"))) {
      const root = realPath(dir)
      if (pathKey(root) === pathKey(pkgRoot)) return "global"
      if (isInside(pkgRoot, root)) return "project"
    }
    const parent = dirname(dir)
    if (parent === dir) return "global"
    dir = parent
  }
}

// 解析项目侧目标：复用项目级候选目录解析（只写已存在目录，不凭空造），真源本身不放薄壳
export function resolveProjectTargets(cwd = process.cwd()): ProjectTargets {
  const root = resolve(cwd)
  const shellDirs = resolveProjectSkillDirs(root).filter((rel) => rel !== PROJECT_SOURCE_DIR)
  const missingDirs = PROJECT_SKILL_DIRS.filter((rel) => rel !== PROJECT_SOURCE_DIR && !shellDirs.includes(rel))
  return { root, sourceDir: PROJECT_SOURCE_DIR, shellDirs, missingDirs }
}

// 反查目标显示名：canonical 优先（多家 agent 共读，须先于 agent 循环判定），其次内置快照表；表外目标（自定义 --dir）返回 null
export function skillTargetLabel(dir: string): string | null {
  const key = pathKey(resolve(dir))
  if (key === pathKey(join(getHomeDir(), CANONICAL_DIR))) return CANONICAL_LABEL
  const agent = AGENT_SKILL_DIRS.find((a) => pathKey(resolveAgentDir(a)) === key)
  return agent?.label ?? null
}

// 反查历史落点显示名：非历史落点返回 null
export function legacySkillDirLabel(dir: string): string | null {
  const key = pathKey(resolve(dir))
  const legacy = LEGACY_SKILL_DIRS.find((l) => pathKey(resolve(join(getHomeDir(), l.dir))) === key)
  return legacy?.label ?? null
}

// 状态文件里的目标类型：主目标 / 表内 agent / 表外自定义
export function classifyTargetKind(dir: string): TargetKind {
  const key = pathKey(resolve(dir))
  if (key === pathKey(join(getHomeDir(), CANONICAL_DIR))) return "primary"
  return AGENT_SKILL_DIRS.some((a) => pathKey(resolveAgentDir(a)) === key) ? "agent" : "custom"
}

// 目标稳定标识：主目标固定 primary，其余按类型 + 绝对路径派生
export function targetId(dir: string, kind: TargetKind): string {
  return kind === "primary" ? "primary" : `${kind}:${resolve(dir)}`
}

// 删除现场产物：链接只摘链（不碰真源）、副本整目录删除
export function removeArtifact(dest: string): void {
  rmSync(dest, { recursive: true, force: true })
}

// 以副本形式写入（调用前需确保 dest 不存在，否则会复制到 dest 内部）
export function copyArtifact(source: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(source, dest, { recursive: true })
}

// 写入产物：默认软链（Windows 用 junction，免管理员、免开发者模式）；链接失败降级副本并回传原因
// linkTarget 为软链指向（稳定锚点），copySource 为副本内容来源（真源）——pnpm 布局下二者不是同一路径
export function writeArtifact(linkTarget: string, copySource: string, dest: string, forceCopy: boolean): { mode: ArtifactMode; reason?: string } {
  if (forceCopy) {
    copyArtifact(copySource, dest)
    return { mode: "copy" }
  }
  try {
    mkdirSync(dirname(dest), { recursive: true })
    symlinkSync(linkTarget, dest, process.platform === "win32" ? "junction" : "dir")
    return { mode: "link" }
  } catch (e) {
    copyArtifact(copySource, dest)
    return { mode: "copy", reason: (e as Error).message }
  }
}

// 薄壳标记与版本：供版本分流（落后重写 / 同版跳过 / 超前不降级）与安全识别
const SKILL_SHELL_MARKER = "toolkit-skill-shell"
const SKILL_SHELL_VERSION = 1
const SKILL_SHELL_MARKER_RE = new RegExp(`<!--\\s*${SKILL_SHELL_MARKER}:\\s*v(\\d+)\\s*-->`)

// 仓库相对路径归一为 posix：写进归属账与报告，跨机器（Windows / POSIX）稳定
export function toRepoRel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/")
}

// 读取薄壳标记版本：无标记返回 null
export function readSkillShellVersion(content: string): number | null {
  const matched = content.match(SKILL_SHELL_MARKER_RE)
  return matched ? Number(matched[1]) : null
}

// 薄壳内容：frontmatter 的 name 与父目录同名（Agent Skills 标准要求），description 派生自真源以保持触发面一致
// 正文不承载技能内容，只指向真源路径；内容变化（含真源描述变更）由字符串全等比对触发重写
export function buildSkillShell(name: string, sourceRel: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description || `本项目内技能 ${name} 的入口壳。`}`,
    "---",
    "",
    `<!-- ${SKILL_SHELL_MARKER}: v${SKILL_SHELL_VERSION} -->`,
    "<!-- 由 toolkit 生成，可安全删除；需要时重跑 toolkit init 或 pnpm install（prepare 钩子）即可补齐 -->",
    `本技能只是入口壳，不承载技能内容：内容以项目仓库根下 \`${sourceRel}/${name}/SKILL.md\` 为唯一真源，同目录的 \`references/\`、\`assets/\` 按需读取。`,
    "",
  ].join("\n")
}

// 薄壳内容版本：供安装时判断标记是否超前（不降级覆盖）
export function currentSkillShellVersion(): number {
  return SKILL_SHELL_VERSION
}

// 目录条目列表：供自愈与状态判定复用
export function listDirEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}
