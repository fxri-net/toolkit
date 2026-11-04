// 技能版本递增：只改 SKILL.md 的 frontmatter metadata.version 与正文首部「本技能版本」两处
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type BumpType = "patch" | "minor" | "major"

export interface BumpOptions {
  // 技能真源根目录（仓库内 skills/）
  skillsDir: string
  names?: string[]
  all?: boolean
  type?: BumpType
  // 直接设定版本，与 type 互斥
  set?: string
  dryRun?: boolean
}

export interface BumpResult {
  name: string
  from: string
  to: string
  file: string
}

const SKILL_ENTRY = "SKILL.md"
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

// 版本号三段解析：返回 [major, minor, patch]；不合法返回 null
function parseVersion(version: string): [number, number, number] | null {
  const matched = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(version.trim())
  if (!matched) return null
  return [Number(matched[1]), Number(matched[2]), Number(matched[3])]
}

// 按 bump 类型计算下一版本；预发布后缀在递增时丢弃
export function bumpVersion(version: string, type: BumpType): string | null {
  const parsed = parseVersion(version)
  if (!parsed) return null
  const [major, minor, patch] = parsed
  if (type === "major") return `${major + 1}.0.0`
  if (type === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

// 校验显式设定的版本号
export function isValidVersion(version: string): boolean {
  return VERSION_PATTERN.test(version.trim())
}

// 读取 frontmatter metadata.version：缩进键，缺失返回空串
function readFrontmatterVersion(content: string): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!frontmatter) return ""
  const matched = /^[ \t]+version:[ \t]*"?([^"\r\n]+?)"?[ \t]*$/m.exec(frontmatter[1] ?? "")
  return matched?.[1]?.trim() ?? ""
}

// 改写 frontmatter 版本行：保持引号与缩进，替换值本身
function writeFrontmatterVersion(content: string, next: string): string | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!frontmatter) return null
  const block = frontmatter[1] ?? ""
  const line = /^([ \t]+version:[ \t]*")([^"\r\n]*)(")/m
  if (!line.test(block)) return null
  const nextBlock = block.replace(line, (_all, head: string, _old: string, tail: string) => `${head}${next}${tail}`)
  const openLength = /^---\r?\n/.exec(content)?.[0].length ?? 4
  const start = openLength
  const end = start + block.length
  return content.slice(0, start) + nextBlock + content.slice(end)
}

// 改写正文首部版本声明；未声明时保持原样，由调用方提示
function writeBodyVersion(content: string, next: string): string {
  return content.replace(/^(> 本技能版本 )([^\s（(]+)/m, (_all, head: string) => `${head}${next}`)
}

// 列出可用技能目录名
function listSkillNames(skillsDir: string): string[] {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, SKILL_ENTRY)))
    .map((entry) => entry.name)
    .sort()
}

// 递增技能版本：逐项校验、可选预演；任一失败即抛错，不写半截
export function bumpSkillVersions(options: BumpOptions): BumpResult[] {
  const { skillsDir, dryRun } = options
  if (!existsSync(skillsDir)) throw new Error(`未找到技能目录：${skillsDir}`)
  const available = listSkillNames(skillsDir)
  if (available.length === 0) throw new Error(`技能目录下没有可递增的技能：${skillsDir}`)
  if (!options.all && (!options.names || options.names.length === 0)) throw new Error("请指定技能名，或使用 --all 批量递增")
  if (options.all && options.names && options.names.length > 0) throw new Error("--all 与显式技能名不能同时使用")
  const targets = options.all ? available : options.names!
  const missing = targets.filter((name) => !available.includes(name))
  if (missing.length > 0) throw new Error(`未找到技能：${missing.join("、")}`)

  const results: BumpResult[] = []
  // 先全部计算并校验，再统一写盘：避免中途失败留下部分已改文件
  const pending: Array<{ file: string; content: string }> = []
  for (const name of targets) {
    const file = join(skillsDir, name, SKILL_ENTRY)
    const content = readFileSync(file, "utf8")
    const from = readFrontmatterVersion(content)
    if (!from) throw new Error(`技能 ${name} 的 frontmatter 未声明 metadata.version，无法递增`)
    const to = options.set ? options.set.trim() : bumpVersion(from, options.type ?? "patch")
    if (!to) throw new Error(`技能 ${name} 的当前版本不合法：${from}`)
    const withFrontmatter = writeFrontmatterVersion(content, to)
    if (withFrontmatter === null) throw new Error(`技能 ${name} 未能定位 frontmatter 的 version 行`)
    pending.push({ file, content: writeBodyVersion(withFrontmatter, to) })
    results.push({ name, from, to, file })
  }
  if (!dryRun) for (const item of pending) writeFileSync(item.file, item.content, "utf8")
  return results
}
