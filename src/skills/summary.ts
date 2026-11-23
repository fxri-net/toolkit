// 技能简介摘要：首句 + 显示宽度截断，供选择列表与 list / status 复用同一口径
// 宽度与截断原语统一在 text-line，本模块只保留技能简介的组装口径
import { SUMMARY_WIDTH, firstSentence, stripMarkdownInline, truncateDisplay } from "../text-line"

export { SUMMARY_WIDTH, displayWidth, stripMarkdownInline } from "../text-line"

// 按显示宽度截断：超出补省略号；无简介时返回空串
export function skillSummary(description: string, width = SUMMARY_WIDTH): string {
  const text = firstSentence(stripMarkdownInline(description))
  if (!text) return ""
  return truncateDisplay(text, width)
}
