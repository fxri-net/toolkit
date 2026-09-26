// 展示层：未知状态兜底分组、导出目录自动创建、导出脱敏覆盖面
import { describe, it, expect, vi, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { printTaskBoard } from "../tasks/list"
import { exportTasks, toCSV, toJSON } from "../tasks/export"
import { queryTasks } from "../tasks/query"
import type { TaskRow } from "../tasks/types"

afterEach(() => vi.restoreAllMocks())

describe("printTaskBoard 未知状态（K1）", () => {
  it("归档 meta 中的未知状态不再静默丢弃，以兜底分组展示", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-board-"))
    mkdirSync(join(dir, "archive", "202609"), { recursive: true })
    writeFileSync(
      join(dir, "archive", "202609", "20260903.md"),
      "# 20260903 归档\n\n## 20260903-唐启云-a\n\n> 负责人：唐启云　状态：已完成X　范围：x　完成时间：2026-09-03 10:00\n\na\n",
      "utf8",
    )
    const lines: string[] = []
    const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => lines.push(a.join(" ")))
    printTaskBoard(dir, "all")
    spy.mockRestore()
    const out = lines.join("\n")
    expect(out).toContain("【已完成X】1 项")
    expect(out).toContain("其他 1")
    expect(out).toContain("共 1 个任务")
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("exportTasks 目录自动创建（K3）", () => {
  it("嵌套目录不存在时自动创建", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-exp-"))
    const rows = queryTasks(join(dir, ".tasks"), "active", {}).rows
    const target = join(dir, "a", "b", "out.json")
    await exportTasks(target, rows, { total: 0, byStatus: {}, byOwner: {} })
    expect(existsSync(target)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

// 缺陷 9：任务名此前有特判绕过脱敏，现全部文本列统一走 redactText，不再有漏网列
describe("导出脱敏覆盖面（缺陷 9）", () => {
  const phone = "13812345678"
  // 真实形态：敏感信息出现在标题/负责人/范围/依赖/来源文件等文本列
  const row = (): TaskRow => ({
    view: "待完成",
    title: `对接${phone}`,
    status: "待办",
    owner: phone,
    scope: `svc${phone}`,
    created: "20260903",
    updated: "20260903",
    completed: "",
    depends: [`dep${phone}`],
    file: `active/202609/20260903-${phone}-对接.md`,
  })

  it("CSV 全部文本列走脱敏，原始值不落盘", () => {
    const csv = toCSV([row()], true)
    expect(csv).not.toContain(phone)
    expect(csv).toContain("对接138****5678")
    expect(csv).toContain("svc138****5678")
    expect(csv).toContain("dep138****5678")
    expect(csv).toContain("20260903-138****5678-对接.md")
  })

  it("JSON 全部文本列走脱敏（含依赖数组逐元素）", () => {
    const text = toJSON([row()], { total: 1, byStatus: {}, byOwner: {} }, true)
    const item = JSON.parse(text).items[0] as Record<string, unknown>
    expect(item.title).toBe("对接138****5678")
    expect(item.owner).toBe("138****5678")
    expect(item.scope).toBe("svc138****5678")
    expect(item.depends).toEqual(["dep138****5678"])
    expect(item.file).toBe("active/202609/20260903-138****5678-对接.md")
  })

  it("redact=false 时原样导出（脱敏开关可关）", () => {
    expect(toCSV([row()], false)).toContain(phone)
  })
})
