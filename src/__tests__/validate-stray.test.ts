// 游离任务文件检测：active/archive 之外带 {YYYYMMDD}- 日期前缀的 .md 应软告警
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"

const warnTexts = (dir: string) => validateTasks(dir).issues.filter((i) => i.level === "warn").map((i) => i.message)

const header = "---\nowner: 唐启云\nstatus: 待办\ncreated: 20260904\nupdated: 20260904\ncompleted: ''\ndepends_on: []\nscope: x\n---\n\n# t\n"

describe("游离任务文件检测", () => {
  it("直放 .tasks 根目录的任务文件告警，README 不误报，正常位置不告警", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-stray-"))
    // 游离：直放 .tasks 根目录（漏建 active 层的典型错位）
    writeFileSync(join(dir, "20260904-唐启云-错位任务.md"), header, "utf8")
    // 非任务文档：不带日期前缀，不应误报
    writeFileSync(join(dir, "README.md"), "# doc\n", "utf8")
    // 正常位置任务：不告警
    mkdirSync(join(dir, "active", "202609"), { recursive: true })
    writeFileSync(join(dir, "active", "202609", "20260904-唐启云-正常任务.md"), header, "utf8")

    const warns = warnTexts(dir)
    expect(warns.some((m) => m.includes("游离于 active/ 之外"))).toBe(true)
    expect(warns.filter((m) => m.includes("游离于 active/ 之外"))).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it("游离于年月子目录（漏 active 层）与 active 根目录直放均告警", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-stray-"))
    // 游离：漏建 active 层的 .tasks/202609/xxx.md
    mkdirSync(join(dir, "202609"), { recursive: true })
    writeFileSync(join(dir, "202609", "20260904-唐启云-漏层任务.md"), header, "utf8")
    // 游离：直放 active 根目录（既有口径仍生效）
    mkdirSync(join(dir, "active"), { recursive: true })
    writeFileSync(join(dir, "active", "20260904-唐启云-根目录任务.md"), header, "utf8")

    const warns = warnTexts(dir)
    expect(warns.some((m) => m.includes("游离于 active/ 之外"))).toBe(true)
    expect(warns.some((m) => m.includes("应放入 {YYYYMM} 月份子目录"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})
