// completed 完成时间校验：未来时间（晚于系统时间）应软告警，过去时间不误报；跨时区容差边界单独校验
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"
import { isBeyondTzFuture, MAX_UTC_OFFSET_MS } from "../date"

const HOUR = 60 * 60 * 1000

// 以本地时区把时间戳渲染为 YYYY-MM-DD HH:mm 墙上串：渲染与解析同轴，期望值不随运行环境时区漂移
function wallString(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

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

describe("isBeyondTzFuture 跨时区容差边界", () => {
  // 固定基准取本地整分时刻，避免渲染截断秒导致取整误差
  const now = new Date(2026, 5, 15, 12, 0, 0, 0).getTime()

  it("容差内不判为未来（UTC+8 墙上时间在 UTC 环境下的偏移量级）", () => {
    expect(isBeyondTzFuture(wallString(now + 13 * HOUR), now)).toBe(false)
    expect(isBeyondTzFuture(wallString(now + MAX_UTC_OFFSET_MS), now)).toBe(false)
  })

  it("超出容差判为未来", () => {
    expect(isBeyondTzFuture(wallString(now + 15 * HOUR), now)).toBe(true)
  })

  it("错填日期（超前 14 小时以上）仍被捕获", () => {
    expect(isBeyondTzFuture(wallString(now + 48 * HOUR), now)).toBe(true)
  })

  it("过去时间判为非未来", () => {
    expect(isBeyondTzFuture(wallString(now - 30 * HOUR), now)).toBe(false)
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
