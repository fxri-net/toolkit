// 展示层：未知状态兜底分组、导出目录自动创建
import { describe, it, expect, vi, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { printTaskBoard } from "../tasks/list"
import { exportTasks } from "../tasks/export"
import { queryTasks } from "../tasks/query"

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
