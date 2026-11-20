// 内容闸门接管判定：开关归一 + 技能名模式匹配（复用语法层，不做路径归一）
import { matchPattern } from "../scope/pattern"
import type { GateRules } from "./types"

// 缺省接管规则：全部技能
export const DEFAULT_GATE_INCLUDE = ["*"]

export interface GateSetting {
  enabled: boolean
  rules: GateRules
}

// 把配置取值归一为「是否开启 + 规则」：true / 对象视为开启，false / 缺省视为关闭
export function resolveGateSetting(value: boolean | GateRules | undefined): GateSetting {
  if (value === true) return { enabled: true, rules: { include: [...DEFAULT_GATE_INCLUDE], exclude: [] } }
  if (value === false || value === undefined) return { enabled: false, rules: { include: [...DEFAULT_GATE_INCLUDE], exclude: [] } }
  return { enabled: true, rules: value }
}

// 技能是否被接管：技能可声明 metadata.gate: false 单点退出；规则先看 include，再看 exclude
export function isSkillGated(name: string, optOut: boolean | undefined, rules: GateRules): boolean {
  if (optOut === false) return false
  if (!rules.include.some((pattern) => matchPattern(name, pattern))) return false
  return !rules.exclude.some((pattern) => matchPattern(name, pattern))
}

// 规则摘要：供 status / 帮助文案展示
export function gateRuleSummary(rules: GateRules): string {
  const include = rules.include.join("、") || "无"
  const exclude = rules.exclude.join("、")
  return exclude ? `接管 ${include}；排除 ${exclude}` : `接管 ${include}`
}
