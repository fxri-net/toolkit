// 队列消费：先写基础事件（技能名 + 次数），再尽力反查会话补齐明细；反查失败不影响计数
import { spawn } from "node:child_process"
import { loadUsageConfig, resolveUsageDir } from "./config"
import { buildEvent, resolveSkillMeta } from "./event"
import { shouldRecord } from "./filter"
import { listQueueFiles, readQueueEntry, removeQueueFile } from "./queue"
import { detectAgent, lookupSessionCalls } from "./sessions"
import type { SessionCall } from "./sessions/types"
import { appendEvent, usagePaths } from "./store"

// 消费参数：dir 供命令指定，lookup 供测试注入，maxBatches 限制单次处理量
export interface FlushOptions {
  dir?: string
  maxBatches?: number
  lookup?: (agent: string, sessionId: string) => SessionCall[] | null
}

// 消费结果：processed 为处理批次数，written 为写入事件数
export interface FlushResult {
  processed: number
  written: number
}

// 按技能分组调用记录，保持会话内出现顺序
function groupBySkill(calls: SessionCall[]): Map<string, SessionCall[]> {
  const grouped = new Map<string, SessionCall[]>()
  for (const call of calls) {
    const list = grouped.get(call.skill) ?? []
    list.push(call)
    grouped.set(call.skill, list)
  }
  return grouped
}

// 消费队列：按批先算好字段再写事件，任何环节异常都退回基础事件
export function flushQueue(options: FlushOptions = {}): FlushResult {
  const config = loadUsageConfig()
  // 只有规则通道才有队列可消费；其它通道直接空转
  if (config.channel !== "rule" || !config.enabled) return { processed: 0, written: 0 }
  const paths = usagePaths(resolveUsageDir(options.dir, config))
  const files = listQueueFiles(paths).slice(0, options.maxBatches ?? 20)
  let processed = 0
  let written = 0
  for (const file of files) {
    const entry = readQueueEntry(file)
    if (!entry) {
      // 损坏条目直接丢弃，避免永久阻塞队列
      removeQueueFile(file)
      continue
    }
    // 反查是增强项：识别不出 Agent、读取失败、格式变化都只丢字段
    let calls: SessionCall[] = []
    try {
      const agent = entry.agentHint !== "unknown" ? entry.agentHint : detectAgent()
      calls = (options.lookup ? options.lookup(agent, entry.sessionId) : lookupSessionCalls(agent, entry.sessionId)?.calls) ?? []
    } catch {
      calls = []
    }
    const grouped = groupBySkill(calls)
    // 同技能多次按「会话内最后 N 次」匹配，N 为本批该技能出现次数
    const counts = new Map<string, number>()
    for (const skill of entry.skills) counts.set(skill, (counts.get(skill) ?? 0) + 1)
    const picked = new Map<string, SessionCall[]>()
    for (const [skill, count] of counts) {
      const pool = grouped.get(skill) ?? []
      picked.set(skill, pool.slice(Math.max(0, pool.length - count)))
    }
    const seen = new Map<string, number>()
    try {
      entry.skills.forEach((skill, index) => {
        const meta = resolveSkillMeta(skill)
        if (meta.managedBy !== "toolkit" || !shouldRecord(config, "rule", meta)) return
        const offset = seen.get(skill) ?? 0
        seen.set(skill, offset + 1)
        const call = picked.get(skill)?.[offset]
        // toolUseId 带批次内序号：同名多次各成一条，跨适配器去重也不会互相吞掉
        const event = buildEvent(
          {
            agent: "rule",
            sessionId: entry.sessionId,
            toolUseId: `rule:${entry.batchId}:${index}`,
            project: entry.cwd || undefined,
            skill,
            triggerPrompt: call?.prompt,
            skillArgs: call?.args,
            outcome: call?.outcome,
            durationMs: call?.durationMs,
            originAdapter: "rule",
            occurredAt: new Date(entry.occurredAt),
          },
          config,
        )
        if (appendEvent(paths, event, config).written) {
          written += 1
        }
      })
    } catch {
      // 写入失败保留队列文件，等下次重试；已写入的事件由 eventId 去重，重试不会重复计数
      continue
    }
    removeQueueFile(file)
    processed += 1
  }
  return { processed, written }
}

// 派发后台 worker：派生失败只返回 false，由下次命令的惰性兜底接管
export function spawnFlushWorker(): boolean {
  // 测试环境关闭派生：vitest 的 argv[1] 不是 CLI，误派生会拉起重跑测试
  if (process.env.TOOLKIT_USAGE_NO_WORKER === "1") return false
  try {
    const cli = process.argv[1]
    if (!cli) return false
    const child = spawn(process.execPath, [cli, "usage", "flush"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    })
    child.unref()
    return true
  } catch {
    return false
  }
}
