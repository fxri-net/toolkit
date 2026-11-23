// 交互选项排版：单行预算、尾部 / 中段截断与答案折叠
import { describe, expect, it } from "vitest"
import { renderSelectedChoices } from "../cli-ui"
import { formatChoiceLine } from "../prompt-line"
import { displayWidth, truncateDisplay, truncateMiddle } from "../text-line"

describe("文本截断", () => {
  it("显示宽度按中文 2 列计算，尾部省略不超宽", () => {
    expect(displayWidth("中文abc")).toBe(7)
    expect(truncateDisplay("abcdef", 4)).toBe("abc…")
    expect(displayWidth(truncateDisplay("一二三四五", 6))).toBeLessThanOrEqual(6)
  })

  it("路径中段省略保留末段目录名", () => {
    const text = "very/long/path/to/feature-dir"
    const out = truncateMiddle(text, 24)
    expect(displayWidth(out)).toBeLessThanOrEqual(24)
    expect(out.endsWith("feature-dir")).toBe(true)
    expect(out).toContain("…")
  })
})

describe("交互选项行", () => {
  it("80 列下名称与简介单行且不超宽", () => {
    const line = formatChoiceLine({
      name: "fxri-plan-task",
      description: "将已确认的实施方案分解为可独立交付的任务并给出计划表",
      columns: 80,
      reserved: 5,
    })
    expect(line).not.toContain("\n")
    expect(displayWidth(line)).toBeLessThanOrEqual(80)
  })

  it("预算不足时省略简介，只保留名称", () => {
    const line = formatChoiceLine({ name: "fxri-plan-task", description: "很长很长的简介".repeat(5), columns: 24, reserved: 5 })
    expect(line).toBe("fxri-plan-task")
  })

  it("reserved 计入勾选符与禁用原因宽度后仍不超宽", () => {
    const reason = "必装，不可取消"
    const line = formatChoiceLine({ name: "fxri-plan-task", description: "简介", columns: 40, reserved: 5 + 1 + displayWidth(reason) })
    expect(displayWidth(line) + displayWidth(` ${reason}`)).toBeLessThanOrEqual(40)
  })
})

describe("答案行折叠", () => {
  it("不超过 6 项时逐项列出，优先用 short", () => {
    expect(renderSelectedChoices([{ name: "a" }, { name: "b", short: "B" }])).toBe("a, B")
  })

  it("超过 6 项时折叠为前 5 个与总数", () => {
    const selected = Array.from({ length: 8 }, (_, index) => ({ name: `s${index}` }))
    expect(renderSelectedChoices(selected)).toBe("s0, s1, s2, s3, s4 等 8 项")
  })
})
