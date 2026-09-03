// 过滤与视图单测：owner/scope 多值、单值、状态与日期组合
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { queryTasks } from "../tasks/query"

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tk-query-"))
  mkdirSync(join(dir, "active", "202609"), { recursive: true })
  const put = (name: string, owner: string, scope: string) =>
    writeFileSync(
      join(dir, "active", "202609", name),
      `---\nowner: ${owner}\nstatus: 待办\ncreated: 20260903\nupdated: 20260903\ncompleted: ''\ndepends_on: []\nscope: ${scope}\n---\n\n# ${name}\n`,
      "utf8",
    )
  put("20260903-唐启云-a.md", "唐启云", "admin")
  put("20260903-李四-b.md", "李四", "admin")
  put("20260903-王五-c.md", "王五", "工程化")
  return dir
}

describe("queryTasks 过滤", () => {
  it("owner 多值与单值（F12）", () => {
    const dir = makeDir()
    expect(queryTasks(dir, "all", { owner: ["唐启云", "李四"] }).rows).toHaveLength(2)
    expect(queryTasks(dir, "all", { owner: "唐启云" }).rows).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it("scope 多值与组合过滤", () => {
    const dir = makeDir()
    expect(queryTasks(dir, "all", { scope: ["admin", "工程化"] }).rows).toHaveLength(3)
    expect(queryTasks(dir, "all", { scope: ["admin"], status: ["待办"] }).rows).toHaveLength(2)
    expect(queryTasks(dir, "all", { owner: "王五", scope: "工程化" }).rows).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })
})
