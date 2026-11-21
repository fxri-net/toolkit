// 技能版本口径：版本解析 / 递增与两处版本声明的文本级读取，lint 与 bump 共用同一实现
export type BumpType = "patch" | "minor" | "major"

// 技能版本严格三段式：技能版本独立于产品包版本，不接受预发布后缀
export const STRICT_SKILL_VERSION = /^\d+\.\d+\.\d+$/
// 递增命令接受的版本形态：允许预发布后缀，递增时丢弃
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

// 版本号三段解析：返回 [major, minor, patch]；不合法返回 null
export function parseSkillVersion(version: string): [number, number, number] | null {
  const matched = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(version.trim())
  if (!matched) return null
  return [Number(matched[1]), Number(matched[2]), Number(matched[3])]
}

// 按 bump 类型计算下一版本；预发布后缀在递增时丢弃
export function bumpVersion(version: string, type: BumpType): string | null {
  const parsed = parseSkillVersion(version)
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

// 读取 frontmatter version：缩进键，缺失返回空串
export function readFrontmatterVersionFromContent(content: string): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!frontmatter) return ""
  const matched = /^[ \t]+version:[ \t]*"?([^"\r\n]+?)"?[ \t]*$/m.exec(frontmatter[1] ?? "")
  return matched?.[1]?.trim() ?? ""
}

// 读取正文首部版本声明：`> 本技能版本 x.y.z（…）`；缺失返回空串
export function readBodyVersionFromContent(content: string): string {
  const matched = content.match(/^>[ \t]*本技能版本[ \t]*([^ \t（(]+)/m)
  return matched ? (matched[1] ?? "").trim() : ""
}
