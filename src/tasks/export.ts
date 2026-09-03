// 任务导出：CSV(UTF-8 BOM 超集列) / XLSX(exceljs 多 sheet) / JSON 三种格式，由文件扩展名驱动
// 三种格式均为可回读结构：导入端（import.ts）内置对应解析与列映射
import { writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { toYmd } from "./query"
import { redactText } from "../privacy/redact"
import type { TaskRow, TaskSummary } from "./types"

const require = createRequire(import.meta.url)

// 超集列：统一展示/CSV/汇总明细使用（缺字段留空）
export const PUBLIC_COLUMNS: Array<{ label: string; value: (r: TaskRow) => string }> = [
  { label: "视图", value: (r) => (r.view === "已归档" ? "已归档" : "待完成") },
  { label: "任务名", value: (r) => r.title },
  { label: "状态", value: (r) => r.status },
  { label: "负责人", value: (r) => r.owner },
  { label: "范围", value: (r) => r.scope },
  { label: "创建日期", value: (r) => (r.created ? toYmd(r.created) : "") },
  { label: "更新日期", value: (r) => (r.updated ? toYmd(r.updated) : "") },
  { label: "完成时间", value: (r) => r.completed },
  { label: "依赖", value: (r) => r.depends.join(", ") },
  { label: "来源文件", value: (r) => r.file },
]

// 待完成 sheet 列
const ACTIVE_COLUMNS: Array<{ label: string; value: (r: TaskRow) => string }> = [
  { label: "任务名", value: (r) => r.title },
  { label: "状态", value: (r) => r.status },
  { label: "负责人", value: (r) => r.owner },
  { label: "范围", value: (r) => r.scope },
  { label: "创建日期", value: (r) => (r.created ? toYmd(r.created) : "") },
  { label: "更新日期", value: (r) => (r.updated ? toYmd(r.updated) : "") },
  { label: "完成时间", value: (r) => r.completed },
  { label: "依赖", value: (r) => r.depends.join(", ") },
  { label: "来源文件", value: (r) => r.file },
]

// 已归档 sheet 列
const ARCHIVED_COLUMNS: Array<{ label: string; value: (r: TaskRow) => string }> = [
  { label: "任务名", value: (r) => r.title },
  { label: "状态", value: (r) => r.status },
  { label: "负责人", value: (r) => r.owner },
  { label: "范围", value: (r) => r.scope },
  { label: "完成时间", value: (r) => r.completed },
  { label: "来源文件", value: (r) => r.file },
]

// CSV 字段转义：含分隔符/引号/换行的字段加引号并转义内部引号
function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// 生成 CSV 文本（含 UTF-8 BOM，超集列）
export function toCSV(rows: TaskRow[], redact = true): string {
  const header = PUBLIC_COLUMNS.map((c) => c.label).join(",")
  const body = rows
    .map((r) =>
      PUBLIC_COLUMNS.map((c) => {
        const v = c.label === "任务名" ? redactText(c.value(r), redact) : c.value(r)
        return csvCell(v)
      }).join(","),
    )
    .join("\r\n")
  return `\uFEFF${header}${body ? `\r\n${body}` : ""}`
}

// 生成 JSON 文本：{ summary, items }，items 为英文 key 完整字段（可回读）
export function toJSON(rows: TaskRow[], summary: TaskSummary, redact = true): string {
  const items = rows.map((r) => ({
    view: r.view === "已归档" ? "archived" : "active",
    title: redactText(r.title, redact),
    status: r.status,
    owner: r.owner,
    scope: r.scope,
    created: r.created,
    updated: r.updated,
    completed: r.completed,
    depends: r.depends,
    file: r.file,
  }))
  return JSON.stringify({ summary, items }, null, 2)
}

// 生成 xlsx 工作簿 Buffer：固定三 sheet（待完成 / 已归档 / 汇总）
async function toXLSXBuffer(rows: TaskRow[], summary: TaskSummary, redact = true): Promise<Buffer> {
  // exceljs 为 CJS 运行时依赖，延迟加载（仅导出 .xlsx 时触发）
  // exceljs 类型为 namespace 结构且无 Worksheet 顶层导出，此处显式 any 规避跨模块 interop 差异
  const ExcelJS: any = require("exceljs")
  const wb = new ExcelJS.Workbook()

  const active = rows.filter((r) => r.view === "待完成")
  const archived = rows.filter((r) => r.view === "已归档")

  const fillSheet = (
    ws: any,
    cols: typeof PUBLIC_COLUMNS,
    data: TaskRow[],
  ) => {
    ws.columns = cols.map((c) => ({ header: c.label, key: c.label, width: Math.max(c.label.length + 4, 14) }))
    ws.getRow(1).font = { bold: true }
    for (const r of data) {
      ws.addRow(cols.map((c) => (c.label === "任务名" ? redactText(c.value(r), redact) : c.value(r))))
    }
  }

  const wsActive = wb.addWorksheet("待完成")
  fillSheet(wsActive, ACTIVE_COLUMNS, active)
  const wsArchived = wb.addWorksheet("已归档")
  fillSheet(wsArchived, ARCHIVED_COLUMNS, archived)

  // 汇总 sheet：顶部统计区 + 空行 + 公共列明细
  const wsSummary = wb.addWorksheet("汇总")
  wsSummary.columns = [
    { header: "类别", key: "k", width: 10 },
    { header: "数值", key: "v", width: 12 },
  ]
  const pushStats = (title: string, map: Record<string, number>) => {
    wsSummary.addRow([title, ""]).font = { bold: true }
    for (const [k, v] of Object.entries(map).sort((a, b) => b[1] - a[1])) wsSummary.addRow([k, v])
  }
  wsSummary.addRow(["任务总数", summary.total]).font = { bold: true }
  pushStats("按状态", summary.byStatus)
  pushStats("按负责人", summary.byOwner)
  wsSummary.addRow([])
  // 公共列明细表（表头另起）
  const headRow = wsSummary.addRow(PUBLIC_COLUMNS.map((c) => c.label))
  headRow.font = { bold: true }
  for (const r of rows) {
    wsSummary.addRow(PUBLIC_COLUMNS.map((c) => (c.label === "任务名" ? redactText(c.value(r), redact) : c.value(r))))
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

// 导出入口：按扩展名写文件（.csv/.xlsx/.json），其余扩展名报错
export async function exportTasks(file: string, rows: TaskRow[], summary: TaskSummary, redact = true): Promise<void> {
  const ext = file.split(".").pop()?.toLowerCase()
  if (ext === "csv") {
    writeFileSync(file, toCSV(rows, redact), "utf8")
  } else if (ext === "json") {
    writeFileSync(file, toJSON(rows, summary, redact), "utf8")
  } else if (ext === "xlsx") {
    writeFileSync(file, await toXLSXBuffer(rows, summary, redact))
  } else {
    throw new Error(`不支持的导出格式「${ext || ""}」，仅支持 .csv / .xlsx / .json`)
  }
}
