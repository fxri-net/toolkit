// 任务周期统计（1.7.0）：基于 query 层行数据零字段推导，不改任务结构
// 口径（与作者确认）：完成周期 = 完成日 − 创建日（天），仅统计「已完成」；
// 已归档任务的创建日期从块标题恢复（YYYYMMDD-负责人-简述），缺失者跳过并计数；
// 活跃任务只统计滞留时长（统计日 − 创建日，不含已完结状态）。
import { toYmd, todayDash } from "../date"
import { DONE_STATUSES } from "./types"
import type { TaskRow, TaskFilter } from "./types"
import { queryTasks } from "./query"

// 单条周期样本（天）
interface DurationSample {
  days: number
  owner: string
  scope: string
  // 完成日 YYYY-MM-DD（用于按月吞吐）
  doneDate: string
}

// 周期分布分段：≤1 天 / 2-3 天 / 4-7 天 / 8-14 天 / 15-30 天 / 30 天以上
const DURATION_BUCKETS: Array<{ label: string; max: number }> = [
  { label: "≤1 天", max: 1 },
  { label: "2-3 天", max: 3 },
  { label: "4-7 天", max: 7 },
  { label: "8-14 天", max: 14 },
  { label: "15-30 天", max: 30 },
  { label: ">30 天", max: Number.POSITIVE_INFINITY },
]

// 周期（天）落入分布分段
function bucketOf(days: number): string {
  const hit = DURATION_BUCKETS.find((b) => days <= b.max)
  return (hit ?? DURATION_BUCKETS[DURATION_BUCKETS.length - 1])?.label ?? ""
}

// 组内计数小工具：向 map 累加 1
function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] || 0) + 1
}

// 天数差（本地时区整日计算，round 抵消夏令时 23/25 小时）
function diffDays(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000)
}

// 统计结果结构（JSON 导出/展示共用）
export interface TaskStats {
  // 跳过样本数：已完成但缺创建日期或日期异常（created 晚于 completed）
  skipped: number
  // 周期指标（仅已完成）
  duration: {
    avg: number
    max: number
    count: number
    buckets: Record<string, number>
  }
  // 活跃滞留指标（不含已完结状态）
  active: {
    count: number
    avgStay: number
    maxStay: number
  }
  // 吞吐：按完成月（YYYY-MM）/ 负责人 / 范围汇总（仅已完成）
  byMonth: Record<string, number>
  byOwner: Record<string, number>
  byScope: Record<string, number>
}

// 单行周期天数：创建日期或完成时间缺失返回 null（含 created 晚于 completed 的数据异常行）
function durationDays(r: TaskRow): number | null {
  const created = toYmd(r.created)
  const completed = toYmd(r.completed)
  if (!created || !completed) return null
  const days = diffDays(created, completed)
  return days < 0 ? null : days
}

// 统计主入口：复用 query 层（全量视图 + 过滤），推导周期 / 滞留 / 吞吐三类指标
export function computeStats(tasksDir: string, filter: TaskFilter = {}): TaskStats {
  const { rows } = queryTasks(tasksDir, "all", filter)
  const today = todayDash()
  const done = rows.filter((r) => r.status === "已完成")
  const open = rows.filter((r) => r.view === "待完成" && !(DONE_STATUSES as readonly string[]).includes(r.status))

  // 周期样本收集（已完成；缺创建日期/完成时间/日期异常的行跳过并计数）
  let skipped = 0
  const samples: DurationSample[] = []
  for (const r of done) {
    const days = durationDays(r)
    if (days === null) {
      skipped++
      continue
    }
    samples.push({ days, owner: r.owner, scope: r.scope, doneDate: toYmd(r.completed) })
  }

  // 周期分布（分段先行初始化，保证空样本时分布键齐全）
  const buckets: Record<string, number> = {}
  for (const b of DURATION_BUCKETS) buckets[b.label] = 0
  for (const s of samples) bump(buckets, bucketOf(s.days))

  // 吞吐汇总（按完成月 YYYY-MM / 负责人 / 范围）
  const byMonth: Record<string, number> = {}
  const byOwner: Record<string, number> = {}
  const byScope: Record<string, number> = {}
  for (const s of samples) {
    bump(byMonth, s.doneDate.slice(0, 7))
    bump(byOwner, s.owner)
    bump(byScope, s.scope)
  }

  // 活跃滞留：统计日 − 创建日（缺创建日期的行跳过）
  const stays: number[] = []
  for (const r of open) {
    const created = toYmd(r.created)
    if (!created) continue
    stays.push(Math.max(0, diffDays(created, today)))
  }

  return {
    skipped,
    duration: {
      count: samples.length,
      avg: samples.length > 0 ? Math.round((samples.reduce((a, b) => a + b.days, 0) / samples.length) * 10) / 10 : 0,
      max: samples.length > 0 ? Math.max(...samples.map((s) => s.days)) : 0,
      buckets,
    },
    active: {
      count: open.length,
      avgStay: stays.length > 0 ? Math.round((stays.reduce((a, b) => a + b, 0) / stays.length) * 10) / 10 : 0,
      maxStay: stays.length > 0 ? Math.max(...stays) : 0,
    },
    byMonth,
    byOwner,
    byScope,
  }
}

// 渲染终端报表（分组文本，与 CLI 其他输出风格一致）
export function renderStats(s: TaskStats): string[] {
  const lines: string[] = []
  lines.push("任务统计（周期口径：完成日 − 创建日，仅含已完成）")
  lines.push("")
  lines.push(`已完成样本：${s.duration.count} 个${s.skipped > 0 ? `（另跳过 ${s.skipped} 个缺创建日期或日期异常的行）` : ""}`)
  lines.push(`平均周期：${s.duration.avg} 天　最长周期：${s.duration.max} 天`)
  lines.push("周期分布：")
  for (const [label, n] of Object.entries(s.duration.buckets)) lines.push(`  ${label}　${n} 个`)
  lines.push("")
  lines.push(`未完成任务：${s.active.count} 个　平均滞留 ${s.active.avgStay} 天　最长滞留 ${s.active.maxStay} 天`)
  lines.push("")
  // 按完成月升序展示，体现吞吐时间线；负责人/范围按完成数降序
  const byMonth = Object.entries(s.byMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k} ${v}`)
    .join("　")
  const desc = (m: Record<string, number>) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join("　")
  if (byMonth) lines.push(`按完成月：${byMonth}`)
  if (s.byOwner && Object.keys(s.byOwner).length > 0) lines.push(`按负责人：${desc(s.byOwner)}`)
  if (s.byScope && Object.keys(s.byScope).length > 0) lines.push(`按范围：${desc(s.byScope)}`)
  return lines
}
