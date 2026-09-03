// 任务查询层：读取待完成 / 已归档任务为统一行结构，支持过滤、排序、汇总
// 供 CLI 总览、导出（export.ts）与库 API 复用
import { readFileSync } from "node:fs"
import { join, basename, relative, sep } from "node:path"
import { listTaskFiles, dateFromFileName } from "./scan"
import { parseArchiveBlocks } from "./archive-block"
import { parseFrontmatter } from "./parse"
import type { TaskRow, TaskView, TaskFilter, TaskSummary } from "./types"

// 终端展示与导出的状态分组顺序
export const STATUS_ORDER = ["待办", "进行中", "阻塞", "已完成", "已放弃", "未标注"]

// 解析 frontmatter 的 depends_on 字段：可能为 JSON 数组文本（[]）或空，统一返回数组
function parseDepends(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== "string" || !value.trim()) return []
  const raw = value.trim()
  if (raw === "[]") return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // 兼容 ['a', 'b'] 之外的手写格式，走正则兜底
  }
  return [...raw.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2])
}

// 日期归一化为 YYYY-MM-DD（兼容 YYYYMMDD / YYYY-MM-DD / YYYY-M-D），无法解析返回空
export function toYmd(value: string): string {
  const m = value.trim().match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})/)
  if (!m) return ""
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
}

// 取相对 tasksDir 的展示路径（统一 / 分隔）
function relFile(tasksDir: string, file: string): string {
  return relative(tasksDir, file).split(sep).join("/")
}

// 读取待完成任务（active）为统一行
export function listActiveTasks(tasksDir = ".tasks"): TaskRow[] {
  const activeDir = join(tasksDir, "active")
  return listTaskFiles(activeDir).map((file) => {
    const content = readFileSync(file, "utf8")
    const fm = parseFrontmatter(content)
    const title =
      content
        .split(/\r?\n/)
        .find((l) => l.startsWith("# ") && !l.startsWith("#!"))
        ?.replace(/^#\s*/, "") || basename(file, ".md")
    return {
      view: "待完成",
      title,
      status: fm.status || "未标注",
      owner: fm.owner || "未标注",
      scope: fm.scope || "-",
      created: fm.created || dateFromFileName(file),
      updated: fm.updated || "",
      completed: fm.completed || "",
      depends: parseDepends(fm.depends_on),
      file: relFile(tasksDir, file),
    }
  })
}

// 从块元数据行提取 负责人/状态/范围（形如 `> 负责人：唐启云　状态：已完成　范围：全局`）
function parseMetaLine(metaLine: string | null): { owner: string; status: string; scope: string } {
  const out = { owner: "未标注", status: "已完成", scope: "-" }
  if (!metaLine) return out
  for (const seg of metaLine.replace(/^>\s*/, "").split(/\s*　\s*/)) {
    const [k, ...rest] = seg.split(/[：:]/)
    const v = rest.join("").trim()
    if (!v) continue
    if (k.includes("负责人")) out.owner = v
    else if (k.includes("状态")) out.status = v
    else if (k.includes("范围")) out.scope = v
  }
  return out
}

// 读取已归档任务（archive/**/*.md 的任务块）为统一行
export function listArchivedTasks(tasksDir = ".tasks"): TaskRow[] {
  const archiveDir = join(tasksDir, "archive")
  const rows: TaskRow[] = []
  for (const file of listTaskFiles(archiveDir)) {
    const content = readFileSync(file, "utf8")
    for (const b of parseArchiveBlocks(content).blocks) {
      const meta = parseMetaLine(b.metaLine)
      rows.push({
        view: "已归档",
        title: b.title,
        status: meta.status,
        owner: meta.owner,
        scope: meta.scope,
        created: "",
        updated: "",
        completed: b.completed,
        depends: [],
        file: relFile(tasksDir, file),
      })
    }
  }
  return rows
}

// 命中集合式过滤（owner/scope/status 支持多值）
function inMatch(v: string | string[] | undefined, target: string): boolean {
  if (v === undefined) return true
  return Array.isArray(v) ? v.includes(target) : v === target
}

// 单行是否命中过滤条件（owner/scope/status 精确匹配；时间：待完成看创建/更新，已归档看完成时间）
function matchRow(r: TaskRow, f: TaskFilter): boolean {
  if (!inMatch(f.owner, r.owner)) return false
  if (!inMatch(f.scope, r.scope)) return false
  if (!inMatch(f.status, r.status)) return false
  if (f.date || f.since || f.until) {
    const since = f.date ? toYmd(f.date) : toYmd(f.since || "")
    const until = f.date ? toYmd(f.date) : toYmd(f.until || "")
    if (!since && !until) return false
    const cands = r.view === "已归档" ? [toYmd(r.completed)] : [toYmd(r.created), toYmd(r.updated)].filter(Boolean)
    const hit = cands.some((d) => d && (!since || d >= since) && (!until || d <= until))
    if (!hit) return false
  }
  return true
}

// 行展示日期：已归档用完成时间，待完成用创建日（无则依次回退更新/完成）
export function displayDate(r: TaskRow): string {
  if (r.view === "已归档") return toYmd(r.completed)
  return toYmd(r.created || r.updated || r.completed)
}

// 行排序时间键：yyyymmddHHmm 数字串（无时间部分补 0000），用于组内倒序
function timeKey(r: TaskRow): string {
  const raw = r.view === "已归档" ? r.completed : r.completed || r.updated || r.created
  const date = toYmd(raw)
  if (!date) return ""
  const hm = raw.match(/(\d{1,2}):(\d{2})/)
  return date.replace(/-/g, "") + (hm ? `${hm[1].padStart(2, "0")}${hm[2]}` : "0000")
}

// 按状态分组顺序平铺（组内时间倒序），终端与导出统一使用该顺序
export function orderRows(rows: TaskRow[]): TaskRow[] {
  const order = new Map(STATUS_ORDER.map((s, i) => [s, i]))
  return [...rows].sort((a, b) => {
    const ai = order.get(a.status) ?? STATUS_ORDER.length
    const bi = order.get(b.status) ?? STATUS_ORDER.length
    if (ai !== bi) return ai - bi
    return timeKey(b).localeCompare(timeKey(a))
  })
}

// 汇总统计
export function buildSummary(rows: TaskRow[]): TaskSummary {
  const byStatus: Record<string, number> = {}
  const byOwner: Record<string, number> = {}
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1
    byOwner[r.owner] = (byOwner[r.owner] || 0) + 1
  }
  return { total: rows.length, byStatus, byOwner }
}

// 查询主入口：按视图读取 + 过滤 + 排序，返回行与汇总
export function queryTasks(tasksDir = ".tasks", view: TaskView = "active", filter: TaskFilter = {}): { rows: TaskRow[]; summary: TaskSummary } {
  let rows: TaskRow[] = []
  if (view === "active" || view === "all") rows.push(...listActiveTasks(tasksDir))
  if (view === "archived" || view === "all") rows.push(...listArchivedTasks(tasksDir))
  rows = rows.filter((r) => matchRow(r, filter))
  const ordered = orderRows(rows)
  return { rows: ordered, summary: buildSummary(ordered) }
}
