// 技能简介摘要：首句 + 显示宽度截断；行格式供选择列表与 list 复用
import { describe, expect, it } from "vitest"
import { formatSkillChoice, formatSkillLine } from "../skills/format"
import { displayWidth, skillSummary } from "../skills/summary"

describe("技能简介摘要", () => {
  it("取首句并去掉行内 Markdown", () => {
    const summary = skillSummary("方案落盘：见 [文档](https://example.com)。后续说明不应出现。")
    expect(summary).toBe("方案落盘：见 文档。")
  })

  it("按显示宽度截断：中文按 2 列，超出补省略号", () => {
    const summary = skillSummary("一二三四五六七八九十", 10)
    expect(displayWidth(summary)).toBeLessThanOrEqual(10)
    expect(summary.endsWith("…")).toBe(true)
  })

  it("空简介返回空串，不产生占位噪音", () => {
    expect(skillSummary("")).toBe("")
  })
})

describe("技能行格式", () => {
  it("选择项把简介跟在名称后，超宽时收缩简介且不换行", () => {
    const line = formatSkillChoice("fxri-plan-task", "方案落盘：任务分解与归档", 40)
    expect(line.startsWith("fxri-plan-task  ")).toBe(true)
    expect(line).not.toContain("\n")
    expect(displayWidth(line)).toBeLessThanOrEqual(40)
  })

  it("列表行按 名称 · 简介 · 版本 · 形态 拼装", () => {
    const line = formatSkillLine({ name: "fxri-plan-task", summary: "方案落盘", version: "1.13.2", form: "入口壳" })
    expect(line).toBe("fxri-plan-task · 方案落盘 · v1.13.2 · 入口壳")
  })
})
