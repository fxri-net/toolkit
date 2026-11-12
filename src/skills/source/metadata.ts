// 技能真源与现场（metadata）：自 source.ts 按职责拆分，逻辑逐字未改
import { existsSync, lstatSync, readdirSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { readTextFile } from "../../read-text"
import { SKILL_ENTRY, type PackageSkill, type SkillTier, type SkillVersionMismatch } from "../types"
import { skillsSourceDir } from "./package"
import { isInside, realPath } from "./paths"


export function readSkillVersion(dir: string): string {
  return readFrontmatterIndented(dir, "version")
}

// 读取技能分层：frontmatter metadata.tier，仅认 core / optional，缺省或非法按 optional
export function readSkillTier(dir: string): SkillTier {
  return readFrontmatterIndented(dir, "tier") === "core" ? "core" : "optional"
}

// 读取依赖声明：frontmatter metadata.requires，支持 [a, b] 行内数组与单值
export function readSkillRequires(dir: string): string[] {
  return readFrontmatterList(dir, "requires")
}

// 读取曾用名：frontmatter metadata.previousNames，语法同 requires
export function readSkillPreviousNames(dir: string): string[] {
  return readFrontmatterList(dir, "previousNames")
}

// 读取 frontmatter metadata 下的缩进行内数组键：兼容 [a, b] 与单值，去引号与空项
function readFrontmatterList(dir: string, key: string): string[] {
  try {
    const content = readTextFile(join(dir, SKILL_ENTRY))
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!frontmatter) return []
    const matched = (frontmatter[1] ?? "").match(new RegExp(`^[ \\t]+${key}:[ \\t]*(.+)$`, "m"))
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
    out.push({
      name,
      dir,
      version: readSkillVersion(dir),
      tier: readSkillTier(dir),
      requires: readSkillRequires(dir),
      previousNames: readSkillPreviousNames(dir),
    })
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

// 清单条目：path 相对来源根；name 可覆盖目录名；previousNames 声明曾用名
interface ManifestEntry {
  name?: string
  path: string
  previousNames?: string[]
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
      previousNames: readManifestPreviousNames(entry.previousNames, file),
    })
  }
  return {
    formatVersion: MANIFEST_FORMAT_VERSION,
    name: typeof data.name === "string" ? data.name : undefined,
    version: typeof data.version === "string" ? data.version : undefined,
    skills,
  }
}

// 清单曾用名解析：缺省为空；声明了但不是字符串数组直接报错，不静默丢弃
function readManifestPreviousNames(value: unknown, file: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`技能清单条目 previousNames 须为字符串数组：${file}`)
  const names = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
  if (names.length !== value.length) throw new Error(`技能清单条目 previousNames 含非字符串或空串条目：${file}`)
  return [...new Set(names)]
}

// 校验技能目录落在来源根之内：软链解析后越界即拒绝，避免把来源外内容纳入分发
function assertInsideSource(root: string, dir: string): string {
  const realRoot = realPath(root)
  const realDir = realPath(dir)
  if (realDir !== realRoot && !isInside(realDir, realRoot)) throw new Error(`技能目录越出来源根：${dir}`)
  if (!existsSync(join(realDir, SKILL_ENTRY))) throw new Error(`技能目录缺少 ${SKILL_ENTRY}：${realDir}`)
  return realDir
}

// 构造包内技能条目：名称优先取 frontmatter name，其次目录名；清单声明的曾用名优先于 frontmatter
function packageSkill(dir: string, name?: string, previousNames?: string[]): PackageSkill {
  const resolved = name || readSkillName(dir) || basename(dir)
  return {
    name: resolved,
    dir,
    version: readSkillVersion(dir),
    tier: readSkillTier(dir),
    requires: readSkillRequires(dir),
    previousNames: [...new Set((previousNames ?? readSkillPreviousNames(dir)).filter((item) => item !== resolved))],
  }
}

// 曾用名校验：别名不得与来源内任何现用名或另一条别名重复，否则改名迁移会产生歧义
export function assertSkillAliases(sourceName: string, skills: PackageSkill[]): void {
  const names = new Set(skills.map((skill) => skill.name))
  const owners = new Map<string, string>()
  for (const skill of skills) {
    for (const old of skill.previousNames) {
      // 单段名字约束：含路径分隔符或点段会在安装清理阶段越出目标目录
      if (old === "." || old === ".." || /[\\/]/.test(old)) throw new Error(`来源 ${sourceName} 内技能曾用名非法（须为单段名字）：${old}`)
      if (names.has(old)) throw new Error(`来源 ${sourceName} 内技能曾用名与现用名重复：${old}`)
      const previous = owners.get(old)
      if (previous !== undefined) throw new Error(`来源 ${sourceName} 内技能曾用名重复：${old}（${previous} / ${skill.name}）`)
      owners.set(old, skill.name)
    }
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
    for (const entry of manifest.skills) {
      skills.push(packageSkill(assertInsideSource(realRoot, resolve(realRoot, entry.path)), entry.name, entry.previousNames))
    }
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
  assertSkillAliases(derived, skills)
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
