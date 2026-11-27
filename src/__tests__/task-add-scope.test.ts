// task add 影响范围默认值：取项目内最近任务（含归档），读不到回落 cli
import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { inferScopeDefault } from "../tasks/scope-default"
import { tempDir } from "./helpers"

let dir = ""

// 建临时任务目录：前缀固定，避免污染其它用例
function makeTasksDir(): string {
  dir = tempDir("fxts-tk-scope-default-")
  return dir
}

// 写一个最小可解析的 active 任务档
function writeActiveTask(tasksDir: string, date: string, scope: string): void {
  const monthDir = join(tasksDir, "active", date.slice(0, 6))
  mkdirSync(monthDir, { recursive: true })
  writeFileSync(
    join(monthDir, `${date}-某人-任务.md`),
    [
      "---",
      "owner: 某人",
      "status: 进行中",
      `created: ${date}`,
      `updated: ${date}`,
      "completed: ''",
      "depends_on: []",
      `scope: ${scope}`,
      "---",
      "",
      "# 任务",
      "",
    ].join("\n"),
  )
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ""
})

describe("task add 影响范围默认值", () => {
  it("目录不存在时回落 cli", () => {
    expect(inferScopeDefault(join(makeTasksDir(), "absent"))).toBe("cli")
  })

  it("取最近创建任务的范围", () => {
    const tasksDir = makeTasksDir()
    writeActiveTask(tasksDir, "20260101", "docs")
    writeActiveTask(tasksDir, "20260201", "web+server")
    expect(inferScopeDefault(tasksDir)).toBe("web+server")
  })

  it("没有待完成任务时读归档块范围", () => {
    const tasksDir = makeTasksDir()
    const monthDir = join(tasksDir, "archive", "202601")
    mkdirSync(monthDir, { recursive: true })
    writeFileSync(
      join(monthDir, "20260105.md"),
      [
        "# 20260105 归档",
        "",
        "## 20260104-某人-旧任务",
        "",
        "> 负责人：某人　状态：已完成　范围：skills　完成时间：2026-01-04 10:00",
        "",
        "正文",
        "",
      ].join("\n"),
    )
    expect(inferScopeDefault(tasksDir)).toBe("skills")
  })
})
