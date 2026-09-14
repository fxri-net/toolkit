import type { TaskFrontmatter } from "./types"
import { stripBom } from "../read-text"

// frontmatter 探测与解析共用正则：parseFrontmatterRaw 解析与 validate 探测同源，避免语义漂移；
// stripFrontmatter 需连收尾换行一并吞掉，正则形态不同，故单独自持
export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/

// 解析文件顶部 frontmatter 的全部键值（未知自定义字段原样保留，键序与文件一致）；无 frontmatter 返回空对象
export function parseFrontmatterRaw(content: string): Record<string, string> {
  // 先剥 BOM：否则 frontmatter 正则会被前导字节序误判为「缺少 frontmatter」
  const match = stripBom(content).match(FRONTMATTER_RE)
  if (!match) return {}
  const fm: Record<string, string> = {}
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    // 去掉包裹的引号（兼容 completed: '2026-09-02 23:32' 这类写法）
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1)
    }
    if (key) fm[key] = value
  }
  return fm
}

// 解析为已知字段视图：自定义扩展字段仍随返回值透传（键值原样），类型上只暴露 TaskFrontmatter 的键
export function parseFrontmatter(content: string): Partial<TaskFrontmatter> {
  return parseFrontmatterRaw(content) as Partial<TaskFrontmatter>
}

// 去掉 frontmatter 后返回正文
export function stripFrontmatter(content: string): string {
  const body = stripBom(content)
  const match = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? body.slice(match[0].length) : body
}

// 提取首个 H1 标题文本（跳过 #! 指令行）；无标题返回空串（list / query 展示标题共用，避免实现漂移）
export function titleOf(content: string): string {
  return (
    content
      .split(/\r?\n/)
      .find((l) => l.startsWith("# ") && !l.startsWith("#!"))
      ?.replace(/^#\s*/, "") ?? ""
  )
}

// 去掉正文首个 H1 标题行（供正文未闭合待办扫描；无 H1 时原样返回）
export function bodyWithoutTitle(body: string): string {
  const lines = body.split(/\r?\n/)
  const idx = lines.findIndex((l) => /^# /.test(l))
  if (idx === -1) return body
  lines.splice(idx, 1)
  return lines.join("\n")
}
