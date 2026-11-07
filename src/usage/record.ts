// 规则上报：按全局规则把一批技能调用合并写入本地事件；静默执行，失败不阻断任务
import { loadUsageConfig, resolveUsageDir } from "./config"
import { buildEvent, resolveSkillMeta } from "./event"
import { shouldRecord } from "./filter"
import { appendEvent, usagePaths } from "./store"
import type { UsageConfig } from "./types"

// 已知会话变量：各家 Agent 暴露的会话标识不一，按顺序取第一个非空值
const SESSION_ENV_KEYS = [
  "TOOLKIT_USAGE_SESSION",
  "CLAUDE_SESSION_ID",
  "TRAE_SESSION_ID",
  "DSH_SESSION_ID",
  "CODEX_SESSION_ID",
  "COPILOT_SESSION_ID",
]

// 上报入参：技能名可重复出现，同批同名技能只记一条
export interface RecordOptions {
  skills: string[]
  session?: string
  dir?: string
}

// 上报结果：仅用于测试与诊断，CLI 不打印
export interface RecordResult {
  written: number
  skipped: number
}

// 解析会话标识：显式参数 > 已知环境变量 > 日期兜底
export function resolveRecordSession(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  if (explicit && explicit.trim() !== "") return explicit.trim()
  for (const key of SESSION_ENV_KEYS) {
    const value = env[key]
    if (typeof value === "string" && value.trim() !== "") return value.trim()
  }
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `rule-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// 上报一批技能：只统计 toolkit 管理的技能，其余按未命中配置静默忽略
export function recordSkills(options: RecordOptions): RecordResult {
  const config = loadUsageConfig()
  // 只有规则通道才写入；hook 通道下静默跳过，避免同一调用被两条通道各记一次
  if (config.channel !== "rule" || !config.enabled) return { written: 0, skipped: 0 }
  const names = [...new Set(options.skills.map((name) => name.trim()).filter(Boolean))]
  if (names.length === 0) return { written: 0, skipped: 0 }
  const paths = usagePaths(resolveUsageDir(options.dir, config))
  const sessionId = resolveRecordSession(options.session)
  let written = 0
  let skipped = 0
  for (const skill of names) {
    const meta = resolveSkillMeta(skill)
    // 未托管技能不在规则路径统计：可改走 Hook 或 usage log 补录
    if (meta.managedBy !== "toolkit" || !shouldRecord(config, "rule", meta)) {
      skipped += 1
      continue
    }
    // 规则只传技能名，触发词与参数不由规则转述；字段开关仍按 capture.* 生效
    const event = buildEvent({ agent: "rule", sessionId, skill, originAdapter: "rule" }, config)
    if (appendEvent(paths, event, config).written) written += 1
    else skipped += 1
  }
  return { written, skipped }
}

// 配置是否会统计任何技能：false 时规则必然空转，供 rule 命令提示
export function hasRecordableSkills(config: UsageConfig): boolean {
  if (!config.enabled) return false
  if (config.skills.mode === "none") return false
  if (config.skills.mode === "include") return config.skills.include.length > 0
  if (!config.sources.firstParty && !config.sources.thirdParty) return false
  return true
}
