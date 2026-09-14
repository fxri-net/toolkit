// CheckIssue.line 行号定位：frontmatter 键问题指向键所在行、正文问题指向命中行、文件级问题不带行号
import { describe, it, expect } from "vitest"
import { rmSync, renameSync } from "node:fs"
import { join } from "node:path"
import { makeTasksDir, writeActiveTask } from "./helpers"
import { validateTasks } from "../tasks/validate"

describe("CheckIssue.line 行号定位", () => {
  it("frontmatter 键问题指向该键所在行，正文问题指向实际命中行", () => {
    const dir = makeTasksDir("tk-line-")
    // writeActiveTask 的字段顺序固定：completed 为第 6 行；正文首个非空行（复选框）为第 13 行
    writeActiveTask(dir, "20260903-唐启云-行号.md", { completed: "2000/01/01", body: "- [ ] 收尾项" })
    const issues = validateTasks(dir).issues
    expect(issues.find((i) => i.message.includes("格式非法"))?.line).toBe(6)
    expect(issues.find((i) => i.message.includes("未勾选待办项"))?.line).toBe(13)
    rmSync(dir, { recursive: true, force: true })
  })

  it("文件级问题（active 根目录直放）不带行号", () => {
    const dir = makeTasksDir("tk-line-")
    const name = "20260903-唐启云-根目录.md"
    renameSync(writeActiveTask(dir, name), join(dir, "active", name))
    const hit = validateTasks(dir).issues.find((i) => i.message.includes("应放入"))
    expect(hit).toBeTruthy()
    expect(hit?.line).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })
  })
})
