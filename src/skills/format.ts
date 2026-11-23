// 技能行格式：名称 + 简介的统一拼装，供选择列表与 list / status 复用
import { formatChoiceLine } from "../prompt-line"
import { displayWidth, skillSummary } from "./summary"

// 技能选择项文案：名称后跟单行暗色简介，预算按终端列数与前后缀占用计算
export function formatSkillChoice(name: string, description: string, options: { reserved?: number; columns?: number } = {}): string {
  return formatChoiceLine({ name, description, ...options })
}

// 列表行：名称 · 简介 · 版本 · 形态（缺省字段自动省略；目标目录数只走 JSON，不进文本行）
export function formatSkillLine(parts: {
  name: string
  summary?: string
  version?: string
  form?: string
  maxWidth?: number
}): string {
  const segments = [parts.name]
  if (parts.summary) segments.push(parts.summary)
  if (parts.version) segments.push(`v${parts.version}`)
  if (parts.form) segments.push(parts.form)
  const line = segments.join(" · ")
  const limit = parts.maxWidth ?? 0
  if (limit <= 0 || displayWidth(line) <= limit) return line
  // 超宽时优先截简介：保留名称与状态，简介按剩余宽度收缩
  if (!parts.summary) return line
  const fixed = [parts.name, parts.version ? `v${parts.version}` : "", parts.form ?? ""].filter(Boolean).join(" · ")
  const rest = limit - displayWidth(fixed) - 3
  const summary = skillSummary(parts.summary, Math.max(8, rest))
  return summary ? [parts.name, summary, ...segments.slice(2)].join(" · ") : fixed
}
