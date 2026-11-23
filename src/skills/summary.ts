// 技能简介摘要：首句 + 显示宽度截断，供选择列表与 list / status 复用同一口径
// 显示宽度按中文 2 列、其余 1 列计算，避免中文技能把列表撑歪

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

// 去掉行内 Markdown：链接留文字、去强调与反引号，折叠空白
export function stripMarkdownInline(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// 首句：中文句号 / 叹号 / 问号直接截断；英文句点须后跟空格，避免切断版本号与域名
function firstSentence(text: string): string {
  const matched = text.match(/^.*?[。！？!?]/)
  if (matched) return matched[0]
  const dot = text.indexOf(". ")
  return dot > 0 ? text.slice(0, dot + 1) : text
}

// 按显示宽度截断：超出补省略号；无简介时返回空串
export function skillSummary(description: string, width = SUMMARY_WIDTH): string {
  const text = firstSentence(stripMarkdownInline(description))
  if (!text) return ""
  let out = ""
  let used = 0
  for (const char of text) {
    const next = used + charWidth(char)
    if (next > width - 1) return `${out}…`
    out += char
    used = next
  }
  return out
}
