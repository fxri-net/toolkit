// 规则上报：只把一批技能调用写入队列并派发后台 worker，入队即返回
// 「一批」的技能数组保留重复与顺序，按出现次数计数；明细字段由 worker 反查补齐
import { randomBytes } from "node:crypto"
import { loadUsageConfig, resolveUsageDir } from "./config"
import { spawnFlushWorker } from "./flush"
import { enqueueRecord, type UsageQueueEntry } from "./queue"
import { detectAgent } from "./sessions"
import { usagePaths } from "./store"
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

// 上报入参：技能名可重复出现，重复次数即调用次数
export interface RecordOptions {
  skills: string[]
  session?: string
  dir?: string
}

// 上报结果：仅用于测试与诊断，CLI 不打印
export interface RecordResult {
  queued: number
  channel: string
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

// 批次 ID：时间戳前缀便于排序，随机段避免并发撞名
export function createBatchId(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${stamp}-${randomBytes(4).toString("hex")}`
}

// 上报一批技能：守门通过才入队，随后尽力派发 worker；入队失败由命令层兜住
export function recordSkills(options: RecordOptions): RecordResult {
  const config = loadUsageConfig()
  // 只有规则通道才入队；hook 通道下静默跳过，避免同一调用被两条通道各记一次
  if (config.channel !== "rule" || !config.enabled) return { queued: 0, channel: config.channel }
  const skills = options.skills.map((name) => name.trim()).filter(Boolean)
  if (skills.length === 0) return { queued: 0, channel: "rule" }
  const paths = usagePaths(resolveUsageDir(options.dir, config))
  const entry: UsageQueueEntry = {
    schemaVersion: 1,
    batchId: createBatchId(),
    sessionId: resolveRecordSession(options.session),
    agentHint: detectAgent(),
    cwd: process.cwd(),
    occurredAt: new Date().toISOString(),
    skills,
  }
  enqueueRecord(paths, entry)
  spawnFlushWorker()
  return { queued: skills.length, channel: "rule" }
}

// 配置是否会统计任何技能：false 时规则必然空转，供 rule 命令提示
export function hasRecordableSkills(config: UsageConfig): boolean {
  if (!config.enabled) return false
  if (config.skills.mode === "none") return false
  if (config.skills.mode === "include") return config.skills.include.length > 0
  if (!config.sources.firstParty && !config.sources.thirdParty) return false
  return true
}
