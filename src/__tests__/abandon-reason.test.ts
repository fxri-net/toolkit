// 放弃理由：已放弃须在正文写非空「> 放弃原因：」，其它状态不得残留该行
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"

// 造单任务档：默认已放弃，status / completed / 正文可按用例覆盖
function makeTask(body: string, status = "已放弃", completed = "2026-11-20 10:00"): string {
  const dir = mkdtempSync(join(tmpdir(), "tk-abandon-"))
  mkdirSync(join(dir, "active", "202611"), { recursive: true })
  writeFileSync(
    join(dir, "active", "202611", "20261120-唐启云-放弃样例.md"),
    `---\nowner: 唐启云\nstatus: ${status}\ncreated: 20261120\nupdated: 20261120\ncompleted: '${completed}'\ndepends_on: []\nscope: x\n---\n\n# 放弃样例\n\n${body}`,
    "utf8",
  )
  return dir
}

const warned = (dir: string) => validateTasks(dir).issues.filter((i) => i.level === "warn").map((i) => i.message)

describe("放弃理由校验", () => {
  it("合规档零告警", () => {
    const dir = makeTask("> 计划位置：第 1 个（共 1 个）；前置：无；后继：无\n\n> 放弃原因：成本高于收益\n\n## 背景\n\n说明\n")
    expect(warned(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it("已放弃但缺少放弃原因行", () => {
    const dir = makeTask("## 背景\n\n说明\n")
    expect(warned(dir).some((m) => m.includes("缺少「> 放弃原因：」行"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("放弃原因值为空", () => {
    const dir = makeTask("> 放弃原因：\n\n## 背景\n\n说明\n")
    expect(warned(dir).some((m) => m.includes("值为空"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("非已放弃档残留放弃原因行", () => {
    const dir = makeTask("> 放弃原因：曾经想放弃\n\n## 背景\n\n说明\n", "待办", "")
    expect(warned(dir).some((m) => m.includes("残留「> 放弃原因：」行"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("与搁置节并存：保留搁置节不视为残留", () => {
    const body =
      "> 计划位置：第 1 个（共 1 个）；前置：无；后继：无\n\n> 放弃原因：等待窗口过久，决定不投入\n\n" +
      "## 搁置\n\n- 搁置原因：等契约\n- 重启条件：契约提供\n- 进度锚点：未开工\n- 搁置日期：2026-01-01\n\n## 背景\n\n说明\n"
    const dir = makeTask(body)
    const messages = warned(dir)
    expect(messages.some((m) => m.includes("残留「## 搁置」节"))).toBe(false)
    expect(messages.some((m) => m.includes("放弃原因"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
