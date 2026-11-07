// 过滤链：总开关 → Agent 开关 → 来源开关 → 技能模式；任一步不通过即不落盘
import { isSourceEnabled } from "./event"
import type { UsageConfig, UsageSkillMeta } from "./types"

// Agent 是否开启：未显式写入的 Agent 一律关闭
export function isAgentEnabled(config: UsageConfig, agent: string): boolean {
  return config.agents[agent] === true
}

// 技能是否在统计范围内：include 空列表等同 none
export function isSkillInScope(config: UsageConfig, skill: string): boolean {
  const { mode, include, exclude } = config.skills
  if (mode === "none") return false
  if (mode === "all") return true
  if (mode === "include") return include.includes(skill)
  return !exclude.includes(skill)
}

// 是否记录该事件：总开关、Agent、来源、技能四层全部通过才返回 true
export function shouldRecord(config: UsageConfig, agent: string, meta: UsageSkillMeta): boolean {
  if (!config.enabled) return false
  // manual 是用户显式补录、rule 是全局规则显式上报，都不受 Agent 开关限制；其余来源仍按开关过滤
  if (agent !== "manual" && agent !== "rule" && !isAgentEnabled(config, agent)) return false
  if (!isSourceEnabled(config, meta.source)) return false
  return isSkillInScope(config, meta.name)
}
