// 任务导入：读取 CSV / XLSX / JSON（兼容本工具三种导出与常见外部列名），生成任务文件
// 列映射：内置别名表 + .toolkitrc.json 的 tasks.importColumns 自定义（配置优先）
// 目标：active（默认，生成待完成任务文件）或 archive（直接写归档块）
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
import { normalizeCompleted, parseArchiveBlocks } from "./archive-block"
import type { ArchiveBlockInfo } from "./archive-block"
import { toYmd } from "./query"
import { DONE_STATUSES } from "./types"
import type { ImportOptions, ImportResult } from "./types"

const require = createRequire(import.meta.url)

// 内置列别名表：列名（小写后匹配）→ 标准字段；空字符串 = 元信息列（忽略）
const COLUMN_ALIASES: Record<string, string> = {
  // 任务名
  "任务名": "title", "标题": "title", "事项": "title", "任务": "title", "任务标题": "title", "事项名称": "title",
  title: "title", name: "title", task: "title", subject: "title", summary: "title",
  // 状态
  "状态": "status", status: "status", state: "status",
  // 负责人
  "负责人": "owner", "经办人": "owner", "处理人": "owner", "执行人": "owner", "指派给": "owner",
  owner: "owner", assignee: "owner", handler: "owner",
  // 范围
  "范围": "scope", "项目": "scope", "模块": "scope", scope: "scope", project: "scope",
  // 创建
  "创建日期": "created", "创建时间": "created", created: "created", created_at: "created", createdat: "created",
  // 更新
  "更新日期": "updated", "更新时间": "updated", updated: "updated", updated_at: "updated", updatedat: "updated",
  // 完成 / 截止
  "完成时间": "completed", "完成日期": "completed", "截止时间": "completed", "截止日期": "completed", "结束时间": "completed",
  completed: "completed", done: "completed", finished: "completed", completedat: "completed", due: "completed",
  // 依赖
  "依赖": "depends", "依赖任务": "depends", depends: "depends", depends_on: "depends", dependency: "depends", dependencies: "depends",
  // 描述（写入正文）
  "备注": "body", "描述": "body", "正文": "body", "说明": "body", description: "body", body: "body", note: "body", notes: "body",
  // 元信息列：忽略
  "视图": "", "来源文件": "", "文件": "", view: "", file: "", path: "",
}

// 标准状态枚举（非法值导入时归为待办）
const VALID_STATUS = ["待办", "进行中", "阻塞", "已完成", "已放弃"]

// 表头 → 标准字段映射（自定义配置优先于内置别名）
function mapHeaders(headers: string[], custom: Record<string, string> = {}): Map<string, number> {
  const map = new Map<string, number>()
  headers.forEach((raw, idx) => {
    const key = String(raw ?? "").trim().toLowerCase()
    if (!key) return
    let field: string | undefined
    if (custom[key] !== undefined) field = custom[key]
    if (field === undefined) field = COLUMN_ALIASES[key]
    if (field === "") return
    if (field && !map.has(field)) map.set(field, idx)
  })
  return map
}

// 简易 CSV 解析（支持引号 / 转义引号 / 逗号 / 换行，自动剥离 BOM）
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  const s = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  let row: string[] = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ",") {
      row.push(cur)
      cur = ""
    } else if (ch === "\n") {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ""
    } else cur += ch
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || (r[0] || "").trim() !== "")
}

// CSV 行 → 标准记录数组
function readRowsCSV(content: string, custom: Record<string, string>): Record<string, string>[] {
  const rows = parseCsv(content)
  if (rows.length === 0) return []
  const map = mapHeaders(rows[0], custom)
  const out: Record<string, string>[] = []
  for (let i = 1; i < rows.length; i++) {
    const rec: Record<string, string> = {}
    for (const [field, idx] of map) rec[field] = (rows[i][idx] ?? "").trim()
    if (rec.title || Object.keys(rec).length > 0) out.push(rec)
  }
  return out
}

// 文本表读取：定位含「任务名」映射列的表头行（兼容表头不在首行），返回其下记录
function readRowsWorksheet(ws: any, custom: Record<string, string>): Record<string, string>[] {
  const found: Record<string, string>[] = []
  for (let r = 1; r <= (ws.rowCount || 0); r++) {
    const row = ws.getRow(r)
    const cells: string[] = []
    for (let c = 1; c <= (row.cellCount || 0); c++) cells.push(row.getCell(c).text ?? "")
    if (cells.every((v) => v.trim() === "")) continue
    const map = mapHeaders(cells, custom)
    if (!map.has("title")) continue // 非任务表行，跳过
    // 数据行从表头下一行读到末尾
    for (let r2 = r + 1; r2 <= ws.rowCount; r2++) {
      const row2 = ws.getRow(r2)
      const rec: Record<string, string> = {}
      let empty = true
      for (const [field, idx] of map) {
        const v = (row2.getCell(idx + 1).text ?? "").trim()
        if (v) empty = false
        rec[field] = v
      }
      if (!empty && (rec.title || Object.keys(rec).length > 0)) found.push(rec)
    }
    break
  }
  return found
}

// XLSX 读取：遍历数据 sheet（跳过汇总），各自定位表头合并记录
async function readRowsXLSX(file: string, custom: Record<string, string>): Promise<Record<string, string>[]> {
  // exceljs 为 CJS 运行时依赖，类型与模块 namespace 有差异，显式 any 规避
  const ExcelJS: any = require("exceljs")
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const out: Record<string, string>[] = []
  for (const ws of wb.worksheets) {
    if (ws.name.includes("汇总")) continue
    out.push(...readRowsWorksheet(ws, custom))
  }
  return out
}

// JSON 读取：兼容 { summary, items } 与裸数组，字段英文 key + 中文别名（小写）
function readRowsJSON(content: string, custom: Record<string, string>): Record<string, string>[] {
  const data = JSON.parse(content) as { items?: unknown } | unknown[]
  const items = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : []
  const out: Record<string, string>[] = []
  for (const it of items) {
    if (!it || typeof it !== "object") continue
    const rec: Record<string, string> = {}
    for (const [key, val] of Object.entries(it as Record<string, unknown>)) {
      const k = key.trim().toLowerCase()
      let field: string | undefined
      if (custom[k] !== undefined) field = custom[k]
      if (field === undefined) field = COLUMN_ALIASES[k]
      if (!field) continue
      if (Array.isArray(val)) rec[field] = val.join(",")
      else if (val !== null && val !== undefined) rec[field] = String(val)
    }
    out.push(rec)
  }
  return out
}

// YYYY-MM-DD → YYYYMMDD（已有 YYYYMMDD 原样）
function toYmdRaw(v: string): string {
  const m = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  return m ? `${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}` : v.trim().replace(/[-/]/g, "")
}

// 文件名简述：去文件系统非法字符，压缩空白，限长 24
function slugify(title: string): string {
  const brief = title.trim().replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").slice(0, 24).trim()
  return brief.replace(/\s+/g, "-") || "任务"
}

// 规范化一条导入记录：返回可写任务字段，非法/缺失项进入 warnings
function normalizeRecord(rec: Record<string, string>, opts: ImportOptions, warnings: string[]): { ok: true; t: TaskWrite } | { ok: false } {
  const title = (rec.title || "").trim()
  if (!title) {
    warnings.push(`跳过一行：缺少任务名（${Object.entries(rec).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(" ")}）`)
    return { ok: false }
  }
  let status = (rec.status || "").trim() || "待办"
  if (!VALID_STATUS.includes(status)) {
    warnings.push(`任务「${title}」状态「${status}」非法，已归为待办`)
    status = "待办"
  }
  const completed = rec.completed?.trim() ? normalizeCompleted(rec.completed.trim()) : ""
  if (completed && !DONE_STATUSES.includes(status as never)) {
    warnings.push(`任务「${title}」带完成时间但状态为「${status}」，已置为已完成`)
    status = "已完成"
  }
  let owner = (rec.owner || "").trim() || opts.owner || ""
  owner = owner.replace(/\s+/g, "")
  const scope = (rec.scope || "").trim() || opts.scope || "-"
  const depends = (rec.depends || "").split(/[,，;；]/).map((s) => s.trim()).filter(Boolean)
  return {
    ok: true,
    t: { title, status, owner: owner || "未标注", scope, created: toYmdRaw(rec.created || ""), completed, depends, body: rec.body?.trim() || "" },
  }
}

// 可写任务结构（active 与 archive 通用）
interface TaskWrite {
  title: string
  status: string
  owner: string
  scope: string
  created: string
  completed: string
  depends: string[]
  body: string
}

// 当前本地日期
function today(): string {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
}

// 生成 active 任务文件（冲突自动追加序号，不覆盖）
function writeActiveTask(tasksDir: string, t: TaskWrite, dryRun: boolean): string {
  const created = t.created || today()
  const monthDir = join(tasksDir, "active", created.slice(0, 6))
  const base = `${created}-${t.owner}-${slugify(t.title)}`
  let file = join(monthDir, `${base}.md`)
  let seq = 2
  while (existsSync(file)) file = join(monthDir, `${base}-${seq++}.md`)
  const content = [
    "---",
    `owner: ${t.owner}`,
    `status: ${t.status}`,
    `created: ${created}`,
    `updated: ${today()}`,
    `completed: ${t.completed ? `'${t.completed}'` : "''"}`,
    `depends_on: ${JSON.stringify(t.depends)}`,
    `scope: ${t.scope}`,
    "---",
    "",
    `# ${t.title}`,
  ].join("\n")
  const full = content + (t.body ? `\n\n${t.body}\n` : "\n")
  if (!dryRun) {
    mkdirSync(monthDir, { recursive: true })
    writeFileSync(file, full, "utf8")
  }
  return file
}

// 写入归档（按完成时间落到对应日期文件，与旧块合并排序）
function writeArchiveTask(tasksDir: string, t: TaskWrite, dryRun: boolean, warnings: string[]): string | null {
  const completed = t.completed || (t.status === "已完成" ? "" : "")
  const dateStr = completed ? toYmd(completed) : ""
  if (!dateStr) {
    warnings.push(`任务「${t.title}」缺少完成时间，无法直接归档（可改用 active 目标）`)
    return null
  }
  const date = dateStr.replace(/-/g, "")
  const monthDir = join(tasksDir, "archive", date.slice(0, 6))
  const file = join(monthDir, `${date}.md`)
  const metaLine = `> 负责人：${t.owner}　状态：已完成　范围：${t.scope}　完成时间：${completed}`
  const body = `# ${t.title}${t.body ? `\n\n${t.body}` : ""}`
  const block = { title: t.title, metaLine, completed, body }
  if (dryRun) return file
  mkdirSync(monthDir, { recursive: true })
  let header = `# ${date} 归档\n\n> 本文件由 \`toolkit tasks import --target archive\` 自动生成。\n`
  let blocks: ArchiveBlockInfo[] = []
  if (existsSync(file)) {
    const parsed = parseArchiveBlocks(readFileSync(file, "utf8"))
    if (parsed.header) header = parsed.header
    blocks = parsed.blocks
  }
  blocks.push(block)
  blocks.sort((a, b) => normalizeCompleted(b.completed).localeCompare(normalizeCompleted(a.completed)))
  const parts = blocks.map((b) => `## ${b.title}\n\n${b.metaLine}\n\n${b.body}`)
  writeFileSync(file, `${header}\n\n${parts.join("\n\n---\n\n")}\n`, "utf8")
  return file
}

// 导入主入口：file 扩展名决定解析方式（csv/xlsx/json），返回创建/跳过统计
export async function importTasks(file: string, tasksDir = ".tasks", opts: ImportOptions = {}): Promise<ImportResult> {
  const dryRun = !!opts.dryRun
  const warnings: string[] = []
  const custom = opts.importColumns ?? {}
  const ext = file.split(".").pop()?.toLowerCase()
  let records: Record<string, string>[]
  if (ext === "csv") {
    records = readRowsCSV(readFileSync(file, "utf8"), custom)
  } else if (ext === "xlsx") {
    records = await readRowsXLSX(file, custom)
  } else if (ext === "json") {
    records = readRowsJSON(readFileSync(file, "utf8"), custom)
  } else {
    throw new Error(`不支持的导入格式「${ext || ""}」，仅支持 .csv / .xlsx / .json`)
  }
  if (records.length === 0) {
    console.log("未识别到可导入的任务行（检查表头是否包含「任务名/标题」等列名）")
    return { created: 0, skipped: 0, warnings, dryRun }
  }

  let created = 0
  let skipped = 0
  const target = opts.target ?? "active"
  for (const rec of records) {
    const norm = normalizeRecord(rec, opts, warnings)
    if (!norm.ok) {
      skipped++
      continue
    }
    const t = norm.t
    if (target === "archive") {
      const targetFile = writeArchiveTask(tasksDir, t, dryRun, warnings)
      if (!targetFile) {
        skipped++
        continue
      }
      console.log(`${dryRun ? "[预演] 将写入归档" : "已写入归档"} → ${targetFile}`)
    } else {
      const targetFile = writeActiveTask(tasksDir, t, dryRun)
      console.log(`${dryRun ? "[预演] 将创建" : "已创建"} → ${targetFile}`)
    }
    created++
  }
  for (const w of warnings) console.warn(`⚠️ ${w}`)
  const kind = dryRun ? "预演可导入" : "已导入"
  console.log(`${kind} ${created} 个任务，跳过 ${skipped} 行`)
  return { created, skipped, warnings, dryRun }
}
