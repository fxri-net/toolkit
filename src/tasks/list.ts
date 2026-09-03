import { readFileSync } from "node:fs"
import { join, basename } from "node:path"
import { parseFrontmatter, stripFrontmatter } from "./parse"
import { listTaskFiles, dateFromFileName } from "./scan"
import { redactText } from "../privacy/redact"
import { STATUS_ORDER, queryTasks, displayDate } from "./query"
import type { Task, TaskRow, TaskView, TaskFilter, TaskSummary } from "./types"

// 读取 active 目录下的任务列表
export function listTasks(tasksDir = ".tasks"): Task[] {
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
      file,
      name: basename(file, ".md"),
      date: dateFromFileName(file),
      title,
      frontmatter: fm as Task["frontmatter"],
      body: stripFrontmatter(content).trim(),
    }
  })
}

// 输出任务总览（active）：复用 board 渲染，保证分组顺序/日期口径/文案与 CLI 一致
export function printTasks(tasksDir = ".tasks", redact = true): void {
  printTaskBoard(tasksDir, "active", {}, redact)
}

// 按视图打印任务（分组展示 + 汇总）；视图过滤结果为空时区分「有过滤」与「视图本身为空」
export function printTaskBoard(tasksDir = ".tasks", view: TaskView = "active", filter: TaskFilter = {}, redact = true): void {
  const { rows, summary } = queryTasks(tasksDir, view, filter)
  const viewName = view === "active" ? "待完成" : view === "archived" ? "已归档" : "待完成 + 已归档"
  console.log(`任务总览（${viewName}）：\n`)
  if (rows.length === 0) {
    const hasFilter = Object.values(filter).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)))
    if (hasFilter) console.log("无匹配任务")
    else if (view === "archived") console.log("当前无已归档任务")
    else if (view === "all") console.log("当前无任务")
    else console.log("当前无待完成任务")
    return
  }
  const grouped: Record<string, TaskRow[]> = {}
  for (const r of rows) (grouped[r.status] ||= []).push(r)
  // 已知状态按 STATUS_ORDER 顺序展示，未知状态（如笔误）按字典序兜底分组，避免静默丢弃
  const extras = Object.keys(grouped).filter((s) => !STATUS_ORDER.includes(s)).sort()
  for (const status of [...STATUS_ORDER, ...extras]) {
    const list = grouped[status] || []
    if (list.length === 0) continue
    console.log(`【${status}】${list.length} 项`)
    for (const r of list) {
      const tag = view === "all" ? `${r.view} ` : ""
      console.log(`  ${displayDate(r)}  ${tag}${(r.owner || "未标注").padEnd(8)}  ${redactText(r.title, redact)}（${r.scope || "-"}）`)
    }
    console.log("")
  }
  printBoardSummary(summary)
}

// 打印汇总统计（终端末尾）
function printBoardSummary(summary: TaskSummary): void {
  const statuses = STATUS_ORDER.filter((s) => summary.byStatus[s])
  const extras = Object.keys(summary.byStatus).filter((s) => !STATUS_ORDER.includes(s))
  const owners = Object.keys(summary.byOwner).sort((a, b) => summary.byOwner[b] - summary.byOwner[a])
  console.log(`共 ${summary.total} 个任务`)
  if (statuses.length > 0 || extras.length > 0) {
    const parts = statuses.map((s) => `${s} ${summary.byStatus[s]}`)
    if (extras.length > 0) parts.push(`其他 ${extras.reduce((a, k) => a + summary.byStatus[k], 0)}`)
    console.log(`按状态：${parts.join("　")}`)
  }
  if (owners.length > 0) console.log(`按负责人：${owners.map((o) => `${o} ${summary.byOwner[o]}`).join("　")}`)
}
