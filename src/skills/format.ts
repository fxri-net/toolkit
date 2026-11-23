// 技能行格式：名称 + 简介的统一拼装，供选择列表与 list / status 复用
import { displayWidth, skillSummary } from "./summary"

// 技能选择项文案：名称后跟简介，按可用宽度截断，避免在终端里换行
export function formatSkillChoice(name: string, description: string, maxWidth = 0): string {
  const limit = maxWidth > 0 ? maxWidth : 100
  const budget = limit - displayWidth(name) - 2
  const summary = skillSummary(description, Math.max(12, budget))
  return summary ? `${name}  ${summary}` : name
}

// 列表行：名称 · 简介 · 版本 · 形态 · 目标数（缺省字段自动省略）
export function formatSkillLine(parts: {
  name: string
  summary?: string
  version?: string
  form?: string
  targets?: number
  maxWidth?: number
}): string {
  const segments = [parts.name]
  if (parts.summary) segments.push(parts.summary)
  if (parts.version) segments.push(`v${parts.version}`)
  if (parts.form) segments.push(parts.form)
  if (parts.targets !== undefined) segments.push(`${parts.targets} 个目标`)
  const line = segments.join(" · ")
  const limit = parts.maxWidth ?? 0
  if (limit <= 0 || displayWidth(line) <= limit) return line
  // 超宽时优先截简介：保留名称与状态，简介按剩余宽度收缩
  if (!parts.summary) return line
  const fixed = [parts.name, parts.version ? `v${parts.version}` : "", parts.form ?? "", parts.targets !== undefined ? `${parts.targets} 个目标` : ""]
    .filter(Boolean)
    .join(" · ")
  const rest = limit - displayWidth(fixed) - 3
  const summary = skillSummary(parts.summary, Math.max(8, rest))
  return summary ? [parts.name, summary, ...segments.slice(2)].join(" · ") : fixed
}
