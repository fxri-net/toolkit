// 规范载体形态告警：旧单文件提示迁移、目录形态缺 index.md 提示补齐（均软告警，不读内容）
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"

const warnTexts = (dir: string) => validateTasks(dir).issues.filter((i) => i.level === "warn").map((i) => i.message)

const header = "---\nowner: 唐启云\nstatus: 待办\ncreated: 20260904\nupdated: 20260904\ncompleted: ''\ndepends_on: []\nscope: x\n---\n\n# t\n"

describe("规范载体形态告警", () => {
  it("旧单文件 conventions.md 提示迁移，且不被误判为游离任务文件", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-conv-legacy-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    writeFileSync(join(dir, "conventions.md"), "# 项目协作规范\n", "utf8")

    const warns = warnTexts(dir)
    expect(warns.filter((m) => m.includes("建议迁移为 conventions/ 目录形态"))).toHaveLength(1)
    expect(warns.some((m) => m.includes("游离于 active/ 之外"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it("目录形态缺 index.md 提示补齐", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-conv-noindex-"))
    mkdirSync(join(dir, "active"), { recursive: true })
    mkdirSync(join(dir, "conventions"), { recursive: true })
    writeFileSync(join(dir, "conventions", "web.md"), "# web 规范\n", "utf8")

    const warns = warnTexts(dir)
    expect(warns.filter((m) => m.includes("缺 index.md"))).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it("新旧并存时提示清理旧文件，目录形态完整时无规范载体告警", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-conv-both-"))
    mkdirSync(join(dir, "active", "202609"), { recursive: true })
    writeFileSync(join(dir, "active", "202609", "20260904-唐启云-正常任务.md"), header, "utf8")
    writeFileSync(join(dir, "conventions.md"), "# 旧规范\n", "utf8")
    mkdirSync(join(dir, "conventions"), { recursive: true })
    writeFileSync(join(dir, "conventions", "index.md"), "# 项目协作规范索引\n", "utf8")

    const warns = warnTexts(dir)
    expect(warns.filter((m) => m.includes("建议清理"))).toHaveLength(1)
    expect(warns.some((m) => m.includes("缺 index.md"))).toBe(false)
    expect(warns.some((m) => m.includes("游离于 active/ 之外"))).toBe(false)

    // 清理旧文件后即无任何规范载体告警（分册与 index.md 均不触发游离文件误报）
    rmSync(join(dir, "conventions.md"))
    writeFileSync(join(dir, "conventions", "web.md"), "# web 规范\n", "utf8")
    const after = warnTexts(dir)
    expect(after.filter((m) => m.includes("conventions"))).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})
