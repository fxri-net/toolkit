// 时间过滤单测（T-8）：since/until 区间与单日、已归档按完成时间匹配（夹具复用公共 helpers）
import { describe, it, expect } from "vitest"
import { rmSync } from "node:fs"
import { makeTasksDir, writeActiveTask, writeArchiveFile } from "./helpers"
import { queryTasks } from "../tasks/query"

function makeDir(): string {
  const dir = makeTasksDir("tk-qd-")
  writeActiveTask(dir, "20260901-唐启云-a.md", { created: "20260901", scope: "x" })
  writeActiveTask(dir, "20260903-唐启云-b.md", { created: "20260903", scope: "x" })
  // 归档两条：完成时间 08-31 与 09-02，落到各自月份目录
  writeArchiveFile(dir, "2026-08-31", [{ title: "20260831-唐启云-旧块", completed: "2026-08-31 10:00", scope: "x" }])
  writeArchiveFile(dir, "2026-09-02", [{ title: "20260902-唐启云-旧块", completed: "2026-09-02 10:00", scope: "x" }])
  return dir
}

describe("queryTasks 时间过滤", () => {
  it("since/until 过滤 active 创建/更新日期（YYYYMMDD 与 YYYY-MM-DD 输入均可）", () => {
    const dir = makeDir()
    expect(queryTasks(dir, "active", { since: "20260902" }).rows).toHaveLength(1)
    expect(queryTasks(dir, "active", { until: "2026-09-01" }).rows).toHaveLength(1)
    expect(queryTasks(dir, "active", { since: "2026-09-01", until: "2026-09-03" }).rows).toHaveLength(2)
    expect(queryTasks(dir, "active", { since: "2026-09-04" }).rows).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it("date 单日匹配 active 创建日期", () => {
    const dir = makeDir()
    const rows = queryTasks(dir, "active", { date: "20260903" }).rows
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe("20260903-唐启云-b.md")
    rmSync(dir, { recursive: true, force: true })
  })

  it("已归档按完成时间匹配 date 与 since/until", () => {
    const dir = makeDir()
    expect(queryTasks(dir, "archived", { date: "2026-08-31" }).rows).toHaveLength(1)
    expect(queryTasks(dir, "archived", { date: "2026-09-02" }).rows).toHaveLength(1)
    expect(queryTasks(dir, "archived", { since: "2026-09-01" }).rows).toHaveLength(1)
    expect(queryTasks(dir, "archived", { until: "2026-08-31" }).rows).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })
})
