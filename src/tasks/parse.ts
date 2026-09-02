import type { TaskFrontmatter } from "./types"

// 解析文件顶部 frontmatter，返回键值对象；无 frontmatter 返回空对象
export function parseFrontmatter(content: string): Partial<TaskFrontmatter> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const fm: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) fm[key] = value
  }
  return fm as Partial<TaskFrontmatter>
}

// 去掉 frontmatter 后返回正文
export function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? content.slice(match[0].length) : content
}
