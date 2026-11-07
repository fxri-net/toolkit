// 统计聚合：从事件列表计算技能、Agent、来源、会话与触发词汇总，并支持 CSV / JSONL 导出
import { listPackageSkills } from "../skills"
import type {
  SessionUsageSummary,
  SkillUsageEvent,
  SkillUsageSummary,
  UsageQuery,
  UsageSummary,
  TriggerUsageSummary,
} from "./types"

// 解析 --since：支持 30d / 24h / 60m 与 YYYY-MM-DD；非法返回 null 由调用方报错
export function parseSince(value: string | undefined, now: Date = new Date()): Date | null | undefined {
  if (value === undefined) return undefined
  const relative = /^(\d+)([dhm])$/.exec(value.trim())
  if (relative) {
    const amount = Number(relative[1] ?? 0)
    const unit = relative[2]
    const multiplier = unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : 60_000
    return new Date(now.getTime() - amount * multiplier)
  }
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (date) {
    const parsed = new Date(Number(date[1] ?? 0), Number(date[2] ?? 1) - 1, Number(date[3] ?? 1))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

// 事件时间：无法解析时视为未知，不参与 since 过滤之外的比较
function eventTime(event: SkillUsageEvent): number {
  const time = new Date(event.occurredAt).getTime()
  return Number.isFinite(time) ? time : 0
}

// 过滤事件：按时间、Agent、来源、技能四类条件
export function filterEvents(events: SkillUsageEvent[], query: UsageQuery = {}): SkillUsageEvent[] {
  const since = query.since?.getTime()
  return events.filter((event) => {
    if (since !== undefined && eventTime(event) < since) return false
    if (query.agent && event.agent !== query.agent) return false
    if (query.source && event.skillSource !== query.source) return false
    if (query.skill && event.skill !== query.skill) return false
    return true
  })
}

// 汇总事件：输出按次数降序，次数相同按名称升序，保证结果稳定
export function summarize(events: SkillUsageEvent[]): UsageSummary {
  const skillMap = new Map<string, { count: number; sessions: Set<string>; version: string; source: SkillUsageEvent["skillSource"]; first: number; last: number }>()
  const agentMap = new Map<string, number>()
  const sourceMap = new Map<SkillUsageEvent["skillSource"], number>()
  const sessionMap = new Map<string, { agent: string; count: number; first: number; last: number; skills: Set<string> }>()
  const triggerMap = new Map<string, { count: number; skills: Set<string>; first: number; last: number }>()

  for (const event of events) {
    const time = eventTime(event)
    const skill = skillMap.get(event.skill) ?? {
      count: 0,
      sessions: new Set<string>(),
      version: event.skillVersion ?? "",
      source: event.skillSource,
      first: time,
      last: time,
    }
    skill.count += 1
    skill.sessions.add(event.sessionId)
    skill.first = Math.min(skill.first, time)
    skill.last = Math.max(skill.last, time)
    if (event.skillVersion) skill.version = event.skillVersion
    skillMap.set(event.skill, skill)

    agentMap.set(event.agent, (agentMap.get(event.agent) ?? 0) + 1)
    sourceMap.set(event.skillSource, (sourceMap.get(event.skillSource) ?? 0) + 1)

    const session = sessionMap.get(event.sessionId) ?? {
      agent: event.agent,
      count: 0,
      first: time,
      last: time,
      skills: new Set<string>(),
    }
    session.count += 1
    session.first = Math.min(session.first, time)
    session.last = Math.max(session.last, time)
    session.skills.add(event.skill)
    sessionMap.set(event.sessionId, session)

    if (event.triggerPrompt) {
      const trigger = triggerMap.get(event.triggerPrompt) ?? { count: 0, skills: new Set<string>(), first: time, last: time }
      trigger.count += 1
      trigger.first = Math.min(trigger.first, time)
      trigger.last = Math.max(trigger.last, time)
      trigger.skills.add(event.skill)
      triggerMap.set(event.triggerPrompt, trigger)
    }
  }

  const bySkill: SkillUsageSummary[] = [...skillMap.entries()]
    .map(([skill, item]) => ({
      skill,
      version: item.version,
      source: item.source,
      count: item.count,
      sessions: item.sessions.size,
      firstAt: new Date(item.first).toISOString(),
      lastAt: new Date(item.last).toISOString(),
    }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))

  const sessions: SessionUsageSummary[] = [...sessionMap.entries()]
    .map(([sessionId, item]) => ({
      sessionId,
      agent: item.agent,
      count: item.count,
      firstAt: new Date(item.first).toISOString(),
      lastAt: new Date(item.last).toISOString(),
      skills: [...item.skills].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.sessionId.localeCompare(b.sessionId))

  const triggers: TriggerUsageSummary[] = [...triggerMap.entries()]
    .map(([prompt, item]) => ({
      prompt,
      count: item.count,
      firstAt: new Date(item.first).toISOString(),
      lastAt: new Date(item.last).toISOString(),
      skills: [...item.skills].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.prompt.localeCompare(b.prompt))

  return {
    total: events.length,
    bySkill,
    byAgent: [...agentMap.entries()]
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count || a.agent.localeCompare(b.agent)),
    bySource: [...sourceMap.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    sessions,
    triggers,
  }
}

// 零使用技能：包内技能在事件中一次未出现的名单
export function unusedSkills(events: SkillUsageEvent[]): string[] {
  const used = new Set(events.map((event) => event.skill))
  try {
    return listPackageSkills()
      .map((skill) => skill.name)
      .filter((name) => !used.has(name))
      .sort()
  } catch {
    return []
  }
}

// CSV 转义：含逗号、引号或换行时加引号并双写引号
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

// 事件 CSV：字段固定，便于表格软件消费
export function eventsToCsv(events: SkillUsageEvent[]): string {
  const header = ["occurredAt", "agent", "sessionId", "toolUseId", "skill", "skillVersion", "skillSource", "triggerPrompt", "outcome"]
  const rows = events.map((event) =>
    [
      event.occurredAt,
      event.agent,
      event.sessionId,
      event.toolUseId ?? "",
      event.skill,
      event.skillVersion ?? "",
      event.skillSource,
      event.triggerPrompt ?? "",
      event.outcome ?? "",
    ].map(csvCell).join(","),
  )
  return `${[header.join(","), ...rows].join("\n")}\n`
}

// 事件 JSONL：每行一条，便于再次导入
export function eventsToJsonl(events: SkillUsageEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length > 0 ? "\n" : "")
}
