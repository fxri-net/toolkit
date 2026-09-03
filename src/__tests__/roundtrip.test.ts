// 导出→导入往返单测（T-7）：CSV/JSON/XLSX 三种格式写出后可被导入端回读，
// 覆盖 CSV 特殊字符转义、UTF-8 BOM、XLSX 多 sheet（待完成/已归档）与汇总 sheet 跳过、JSON schemaVersion
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exportTasks } from "../tasks/export"
import { importTasks } from "../tasks/import"
import { queryTasks } from "../tasks/query"
import type { TaskSummary } from "../tasks/types"

const summary: TaskSummary = { total: 0, byStatus: {}, byOwner: {} }

// 造含 CSV 特殊字符标题的 active 源目录
function makeActiveSource(): string {
  const dir = mkdtempSync(join(tmpdir(), "tk-rt-src-"))
  mkdirSync(join(dir, "active", "202609"), { recursive: true })
  const put = (name: string, title: string) =>
    writeFileSync(
      join(dir, "active", "202609", name),
      `---\nowner: 唐启云\nstatus: 待办\ncreated: 20260903\nupdated: 20260903\ncompleted: ''\ndepends_on: []\nscope: 工程化\n---\n\n# ${title}\n正文说明\n`,
      "utf8",
    )
  put("20260903-唐启云-任务甲.md", '任务甲：验证,逗号与引号"混合')
  put("20260903-唐启云-任务乙.md", "任务乙：Title, with, punctuation")
  return dir
}

// 追加一个已归档块（供 XLSX 多 sheet 往返）
function appendArchived(dir: string): void {
  mkdirSync(join(dir, "archive", "202608"), { recursive: true })
  writeFileSync(
    join(dir, "archive", "202608", "20260831.md"),
    "# 20260831 归档\n\n## 20260831-唐启云-旧任务\n\n> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-08-31 09:00\n\n旧任务正文\n",
    "utf8",
  )
}

// 导入目标空目录
function emptyTasksDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tk-rt-dst-"))
  mkdirSync(join(dir, "active"), { recursive: true })
  mkdirSync(join(dir, "archive"), { recursive: true })
  return dir
}

// 读某 .tasks 下 active/202609 全部文件文本
function activeText(dir: string): string {
  const files = readdirSync(join(dir, "active", "202609"))
  return files.map((f) => readFileSync(join(dir, "active", "202609", f), "utf8")).join("\n")
}

describe("导出→导入往返", () => {
  it("CSV 写出含 BOM 与引号转义，往返不丢特殊字符", async () => {
    const src = makeActiveSource()
    const outDir = mkdtempSync(join(tmpdir(), "tk-rt-out-"))
    const out = join(outDir, "out.csv")
    const { rows } = queryTasks(src, "active", {})
    expect(rows).toHaveLength(2)
    await exportTasks(out, rows, summary)

    const text = readFileSync(out, "utf8")
    expect(text.startsWith("\uFEFF")).toBe(true)
    // 含逗号与引号的字段被引号包裹、内部引号翻倍
    expect(text).toContain('"任务甲：验证,逗号与引号""混合"')

    const dst = emptyTasksDir()
    const res = await importTasks(out, dst, {})
    expect(res.created).toBe(2)
    const body = activeText(dst)
    expect(body).toContain("逗号与引号")
    expect(body).toContain("Title, with")
    rmSync(src, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
    rmSync(dst, { recursive: true, force: true })
  })

  it("JSON 写出含 schemaVersion 字段，往返可回读", async () => {
    const src = makeActiveSource()
    const outDir = mkdtempSync(join(tmpdir(), "tk-rt-out-"))
    const out = join(outDir, "out.json")
    const { rows } = queryTasks(src, "active", {})
    await exportTasks(out, rows, summary)

    const parsed = JSON.parse(readFileSync(out, "utf8"))
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.items).toHaveLength(2)

    const dst = emptyTasksDir()
    const res = await importTasks(out, dst, {})
    expect(res.created).toBe(2)
    expect(activeText(dst)).toContain("逗号与引号")
    rmSync(src, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
    rmSync(dst, { recursive: true, force: true })
  })

  it("XLSX 待完成/已归档双 sheet 往返（汇总 sheet 跳过）", async () => {
    const src = makeActiveSource()
    appendArchived(src)
    const outDir = mkdtempSync(join(tmpdir(), "tk-rt-out-"))
    const out = join(outDir, "out.xlsx")
    const { rows } = queryTasks(src, "all", {})
    expect(rows).toHaveLength(3)
    await exportTasks(out, rows, summary)
    expect(existsSync(out)).toBe(true)

    const dst = emptyTasksDir()
    const res = await importTasks(out, dst, {})
    expect(res.created).toBe(3)
    expect(activeText(dst)).toContain("旧任务")
    rmSync(src, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
    rmSync(dst, { recursive: true, force: true })
  })
})
