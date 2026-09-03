// M1 标题误报 / M3 已归档依赖去向 / L3 导入写锁
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"
import { importTasks } from "../tasks/import"

const warnTexts = (dir: string) => validateTasks(dir).issues.filter((i) => i.level === "warn").map((i) => i.message)

function rootDir(): string {
  return mkdtempSync(join(tmpdir(), "tk-lm-"))
}

describe("M1 标题含待办词不误报", () => {
  it("H1 标题含「待办」不告警，正文含「待办」仍告警", () => {
    const header = "---\nowner: 唐启云\nstatus: 待办\ncreated: 20260903\nupdated: 20260903\ncompleted: ''\ndepends_on: []\nscope: x\n---\n\n"
    // 仅标题含待办词：不应有未闭合标记告警
    const dirA = rootDir()
    mkdirSync(join(dirA, "active", "202609"), { recursive: true })
    writeFileSync(join(dirA, "active", "202609", "20260903-唐启云-m1a.md"), header + "# 待办入口建设\n\n普通正文。\n", "utf8")
    expect(warnTexts(dirA).some((m) => m.includes("未闭合待办标记"))).toBe(false)
    rmSync(dirA, { recursive: true, force: true })

    // 正文含待办词：仍应告警
    const dirB = rootDir()
    mkdirSync(join(dirB, "active", "202609"), { recursive: true })
    writeFileSync(join(dirB, "active", "202609", "20260903-唐启云-m1b.md"), header + "# 正常标题\n\n说明：仍有待办收尾项。\n", "utf8")
    expect(warnTexts(dirB).some((m) => m.includes("未闭合待办标记"))).toBe(true)
    rmSync(dirB, { recursive: true, force: true })
  })
})

describe("M3 依赖指向已归档任务给出去向", () => {
  it("缺失依赖命中归档索引时提示归档位置", () => {
    const dir = rootDir()
    mkdirSync(join(dir, "active", "202609"), { recursive: true })
    mkdirSync(join(dir, "archive", "202609"), { recursive: true })
    writeFileSync(
      join(dir, "archive", "202609", "20260903.md"),
      "# 20260903 归档\n\n## 20260903-唐启云-done\n\n> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-03 10:00\n\ndone\n",
      "utf8",
    )
    writeFileSync(
      join(dir, "active", "202609", "20260903-唐启云-a.md"),
      "---\nowner: 唐启云\nstatus: 进行中\ncreated: 20260903\nupdated: 20260903\ncompleted: ''\ndepends_on: [20260903-唐启云-done]\nscope: x\n---\n\n# a\n",
      "utf8",
    )
    const warns = warnTexts(dir)
    expect(warns.some((m) => m.includes("已归档于 archive/202609/20260903.md"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("L3 导入写锁", () => {
  it("存在写锁时导入跳过并告警", async () => {
    const dir = rootDir()
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "archive"), { recursive: true })
    const csv = join(dir, "in.csv")
    writeFileSync(csv, "任务名,负责人,状态,创建日期\n锁下任务,甲,待办,20260903\n", "utf8")
    writeFileSync(join(dir, ".archive.lock"), "fresh", "utf8")
    const res = await importTasks(csv, dir, {})
    expect(res.created).toBe(0)
    expect(res.warnings.join(" ")).toContain("写入锁")
    expect(existsSync(join(dir, "active", "202609", "20260903-甲-锁下任务.md"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
