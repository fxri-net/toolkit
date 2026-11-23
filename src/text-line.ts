// 文本宽度与截断：显示宽度（CJK 2 列）、尾部省略、中段省略与行内 Markdown 归一
// 交互排版、列表行与摘要共用本模块，避免各面各写一套宽度口径

// 默认摘要宽度（列）
export const SUMMARY_WIDTH = 72

// 单字符显示宽度：CJK 与全角标点按 2 列
function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0
  return code >= 0x1100 && (
    code <= 0x115f ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  )
    ? 2
    : 1
}

// 文本显示宽度
export function displayWidth(text: string): number {
  let width = 0
  for (const char of text) width += charWidth(char)
  return width
}

// 尾部截断：超出预算补省略号；预算为 0 返回空串
export function truncateDisplay(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return ""
  if (displayWidth(text) <= maxWidth) return text
  if (maxWidth === 1) return "…"
  let out = ""
  let used = 0
  for (const char of text) {
    const next = used + charWidth(char)
    if (next > maxWidth - 1) return `${out}…`
    out += char
    used = next
  }
  return out
}

// 中段截断：保留首尾、中间补省略号；路径类用，末段目录名仍可辨
export function truncateMiddle(text: string, maxWidth: number): string {
  if (maxWidth <= 1) return "…"
  if (displayWidth(text) <= maxWidth) return text
  const chars = [...text]
  const budget = maxWidth - 1
  const leftBudget = Math.ceil(budget / 2)
  const rightBudget = budget - leftBudget
  let head = ""
  let used = 0
  for (const char of chars) {
    const next = used + charWidth(char)
    if (next > leftBudget) break
    head += char
    used = next
  }
  let tail = ""
  used = 0
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index]!
    const next = used + charWidth(char)
    if (next > rightBudget) break
    tail = char + tail
    used = next
  }
  return `${head}…${tail}`
}

// 去掉行内 Markdown：链接留文字、去强调与反引号，折叠空白
export function stripMarkdownInline(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// 首句：中文句号 / 叹号 / 问号直接截断；英文句点须后跟空格，避免切断版本号与域名
export function firstSentence(text: string): string {
  const matched = text.match(/^.*?[。！？!?]/)
  if (matched) return matched[0]
  const dot = text.indexOf(". ")
  return dot > 0 ? text.slice(0, dot + 1) : text
}
