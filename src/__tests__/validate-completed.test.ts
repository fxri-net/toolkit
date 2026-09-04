// completed 完成时间校验：未来时间（晚于系统时间）应软告警，过去时间不误报
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"

const warnTexts = (dir: string) => validateTasks(dir).issues.filter((i) => i.level === "warn").map((i) => i.message)

// 建指定 completed 值的已完成任务（文件名与 created 用 20990101，避免与当前日期耦合）
function withCompleted(completed: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tk-completed-"))
  mkdirSync(join(dir, "active", "209901"), { recursive: true })
  writeFileSync(
    join(dir, "active", "209901", "20990101-唐启云-时间校验.md"),
    `---\nowner: 唐启云\nstatus: 已完成\ncreated: 20990101\nupdated: 20990101\ncompleted: '${completed}'\ndepends_on: []\nscope: x\n---\n\n# t\n`,
    "utf8",
  )
  return dir
}

describe("completed 未来时间检测", () => {
  it("completed 晚于当前系统时间告警（时间源错误检测）", () => {
    const dir = withCompleted("2099-01-01 00:00")
    expect(warnTexts(dir).some((m) => m.includes("晚于当前系统时间"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("过去时间不触发未来时间告警", () => {
    const dir = withCompleted("2000-01-01 12:30")
    expect(warnTexts(dir).some((m) => m.includes("晚于当前系统时间"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("completed 零点整检测", () => {
  it("completed 恰为 00:00 告警（疑似只填日期被补零）", () => {
    const dir = withCompleted("2000-01-01 00:00")
    expect(warnTexts(dir).some((m) => m.includes("恰为零点整"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("带秒的零点值同样告警", () => {
    const dir = withCompleted("2000-01-01 00:00:00")
    expect(warnTexts(dir).some((m) => m.includes("恰为零点整"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("非零点时间不触发零点告警", () => {
    const dir = withCompleted("2000-01-01 00:01")
    expect(warnTexts(dir).some((m) => m.includes("恰为零点整"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
