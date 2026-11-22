// 生成块标记工具：统一 start/end 包裹与区间替换，供各生成器共用
// 约定：start 与 end 各占一行，body 为标记之间的正文（不含标记本身）

/**
 * 用标记包裹生成内容。
 * @param {string} start 起始标记
 * @param {string} end 结束标记
 * @param {string} body 生成正文
 * @return {string} 带标记的生成块
 */
export function renderBlock(start, end, body) {
  return `${start}\n${body}\n${end}`
}

/**
 * 用生成内容替换文本中的标记区间；标记缺失或顺序颠倒时返回 null。
 * @param {string} text 原文
 * @param {string} start 起始标记
 * @param {string} end 结束标记
 * @param {string} body 生成正文
 * @return {string|null} 替换后的文本
 */
export function applyBlock(text, start, end, body) {
  const from = text.indexOf(start)
  const to = text.indexOf(end)
  if (from < 0 || to < 0 || to < from) return null
  return text.slice(0, from) + renderBlock(start, end, body) + text.slice(to + end.length)
}
