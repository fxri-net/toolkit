// 交互组件加载与运行时下限：版本判定与失败提示文案的单元测试
import { describe, expect, it } from "vitest"
import { formatPromptsLoadError, MIN_NODE, nodeVersionAtLeast } from "../prompts"

describe("nodeVersionAtLeast", () => {
  it("达到或高于下限返回 true", () => {
    expect(nodeVersionAtLeast(MIN_NODE, "18.17.0")).toBe(true)
    expect(nodeVersionAtLeast(MIN_NODE, "18.20.8")).toBe(true)
    expect(nodeVersionAtLeast(MIN_NODE, "20.0.0")).toBe(true)
    expect(nodeVersionAtLeast(MIN_NODE, "22.22.3")).toBe(true)
  })

  it("低于下限或无法解析返回 false", () => {
    expect(nodeVersionAtLeast(MIN_NODE, "18.16.9")).toBe(false)
    expect(nodeVersionAtLeast(MIN_NODE, "16.20.2")).toBe(false)
    expect(nodeVersionAtLeast(MIN_NODE, "unknown")).toBe(false)
  })
})

describe("formatPromptsLoadError", () => {
  it("保留底层原因并给出升级与非交互两条出路", () => {
    const message = formatPromptsLoadError(new Error("boom"), "18.16.0")
    expect(message).toContain("18.16.0")
    expect(message).toContain("boom")
    expect(message).toContain("Node >= 18.17")
    expect(message).toContain("--yes")
  })

  it("非 Error 抛值同样转成可读文案", () => {
    expect(formatPromptsLoadError("plain", "18.19.0")).toContain("plain")
  })
})
