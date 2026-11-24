// 阻塞节形态：三行固定、位置、日期与「已解除未转态」；非阻塞档保留该节不校验
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateTasks } from "../tasks/validate"

// 造单任务档：默认阻塞态、无完成时间
function makeTask(body: string, status = "阻塞", completed = ""): string {
  const dir = mkdtempSync(join(tmpdir(), "fxts-tk-block-"))
  mkdirSync(join(dir, "active", "202611"), { recursive: true })
  writeFileSync(
    join(dir, "active", "202611", "20261120-唐启云-阻塞样例.md"),
    `---\nowner: 唐启云\nstatus: ${status}\ncreated: 20261120\nupdated: 20261120\ncompleted: '${completed}'\ndepends_on: []\nscope: x\n---\n\n# 阻塞样例\n\n${body}`,
    "utf8",
  )
  return dir
}

const warned = (dir: string) => validateTasks(dir).issues.filter((i) => i.level === "warn").map((i) => i.message)

// 合规正文：阻塞节位于标题与计划位置行之后、背景之前
const okBody = `> 计划位置：第 1 个（共 1 个）；前置：无；后继：无\n\n## 阻塞\n\n- 阻塞原因：等待业务裁决口径\n- 解除条件：用户确认处置口径\n- 阻塞日期：2026-01-01\n\n## 背景\n\n说明\n`

describe("阻塞节形态校验", () => {
  it("合规档零告警", () => {
    const dir = makeTask(okBody)
    expect(warned(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it("status 阻塞但缺少阻塞节", () => {
    const dir = makeTask("## 背景\n\n说明\n")
    expect(warned(dir).some((m) => m.includes("缺少「## 阻塞」节"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("三行缺项", () => {
    const dir = makeTask("## 阻塞\n\n- 阻塞原因：等裁决\n- 解除条件：用户确认\n")
    expect(warned(dir).some((m) => m.includes("缺少「阻塞日期」一行"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("三行顺序错", () => {
    const dir = makeTask("## 阻塞\n\n- 解除条件：用户确认\n- 阻塞原因：等裁决\n- 阻塞日期：2026-01-01\n")
    expect(warned(dir).some((m) => m.includes("阻塞三行顺序应为"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("半角冒号", () => {
    const dir = makeTask("## 阻塞\n\n- 阻塞原因: 等裁决\n- 解除条件：用户确认\n- 阻塞日期：2026-01-01\n")
    expect(warned(dir).some((m) => m.includes("须用全角冒号"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("阻塞日期格式非法与晚于今天", () => {
    const bad = makeTask(okBody.replace("2026-01-01", "20260101"))
    expect(warned(bad).some((m) => m.includes("格式非法，应为 YYYY-MM-DD"))).toBe(true)
    rmSync(bad, { recursive: true, force: true })
    const future = makeTask(okBody.replace("2026-01-01", "2099-01-01"))
    expect(warned(future).some((m) => m.includes("晚于今天"))).toBe(true)
    rmSync(future, { recursive: true, force: true })
  })

  it("已记录解除却仍为阻塞状态", () => {
    const body = okBody.replace("## 背景", "- 解除记录：2026-11-19 用户确认口径\n\n## 背景")
    const dir = makeTask(body.replace("2026-01-01", "2026-11-18"))
    expect(warned(dir).some((m) => m.includes("但仍为阻塞状态"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("重复进入阻塞：旧解除记录早于新阻塞日期不误报", () => {
    const body = okBody.replace("## 背景", "- 解除记录：2026-10-01 首次解除\n- 解除记录：2026-10-05 二次解除\n\n## 背景")
    const dir = makeTask(body.replace("2026-01-01", "2026-11-20"))
    expect(warned(dir).some((m) => m.includes("但仍为阻塞状态"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it("阻塞转搁置：搁置节在前、阻塞节在后不误报", () => {
    const body =
      "> 计划位置：第 1 个（共 1 个）；前置：无；后继：无\n\n" +
      "## 搁置\n\n- 搁置原因：等窗口\n- 重启条件：窗口确定\n- 进度锚点：未开工\n- 搁置日期：2026-01-01\n\n" +
      "## 阻塞\n\n- 阻塞原因：等裁决\n- 解除条件：用户确认\n- 阻塞日期：2026-01-01\n- 解除记录：2026-01-02 用户确认\n\n## 背景\n\n说明\n"
    const dir = makeTask(body, "搁置")
    expect(warned(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it("非阻塞档保留残缺阻塞节不校验形态与位置", () => {
    const dir = makeTask("## 背景\n\n说明\n\n## 阻塞\n\n- 阻塞原因：历史原因\n", "待办")
    expect(warned(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})
