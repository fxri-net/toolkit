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

// 输出任务总览
export function printTasks(tasksDir = ".tasks", redact = true): void {
  const tasks = listTasks(tasksDir)
  if (tasks.length === 0) {
    console.log("当前无活跃任务")
    return
  }

  const order = ["进行中", "阻塞", "待办", "已完成", "已放弃", "未标注"]
  const grouped: Record<string, Task[]> = {}
  for (const t of tasks) {
    const key = order.includes(t.frontmatter.status) ? t.frontmatter.status : "未标注"
    ;(grouped[key] ||= []).push(t)
  }

  console.log("任务总览：\n")
  let total = 0
  for (const status of order) {
    const list = grouped[status] || []
    if (list.length === 0) continue
    total += list.length
    console.log(`【${status}】${list.length} 项`)
    for (const t of list) {
      console.log(`  ${t.date}  ${(t.frontmatter.owner || "未标注").padEnd(8)}  ${redactText(t.title, redact)}`)
    }
    console.log("")
  }
  console.log(`共 ${total} 个任务文件`)
}

// 按视图打印任务（分组展示 + 汇总）；视图过滤结果为空时提示
export function printTaskBoard(tasksDir = ".tasks", view: TaskView = "active", filter: TaskFilter = {}, redact = true): void {
  const { rows, summary } = queryTasks(tasksDir, view, filter)
  const viewName = view === "active" ? "待完成" : view === "archived" ? "已归档" : "待完成 + 已归档"
  console.log(`任务总览（${viewName}）：\n`)
  if (rows.length === 0) {
    console.log("无匹配任务")
    return
  }
  const grouped: Record<string, TaskRow[]> = {}
  for (const r of rows) (grouped[r.status] ||= []).push(r)
  for (const status of STATUS_ORDER) {
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
  const owners = Object.keys(summary.byOwner).sort((a, b) => summary.byOwner[b] - summary.byOwner[a])
  console.log(`共 ${summary.total} 个任务`)
  if (statuses.length > 0) console.log(`按状态：${statuses.map((s) => `${s} ${summary.byStatus[s]}`).join("　")}`)
  if (owners.length > 0) console.log(`按负责人：${owners.map((o) => `${o} ${summary.byOwner[o]}`).join("　")}`)
}
