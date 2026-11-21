// 作用域输出展示：home 前缀折叠的大小写口径
import { afterEach, describe, expect, it } from "vitest"
import { setHomeDirForTest } from "../config"
import type { ScopeReport } from "../scope/load"
import { displayPath, formatList, formatStatus } from "../scope/print"

// 只有策略的现场：用于验证 status / list 的只读视图口径
function scopeReport(overrides: Partial<ScopeReport> = {}): ScopeReport {
  return {
    decision: {
      active: false,
      mode: "all",
      baseDir: "/repo",
      sourceFile: null,
      matchedRule: "policy:p1 (规则)",
      reason: "命中策略 policy:p1 (规则)：拒绝该范围",
    },
    activation: null,
    context: { cwd: "/repo", baseDir: "/repo", gitRoot: null, gitRemote: null, markers: new Set<string>() },
    layer: null,
    warnings: [],
    migrationHint: null,
    policies: [{ id: "p1", name: "规则", effect: "deny", layer: "project" }],
    profiles: [],
    policySourceFile: "/repo/.toolkitrc.json",
    policyCount: 1,
    ...overrides,
  }
}

afterEach(() => {
  setHomeDirForTest(undefined)
})

describe("displayPath", () => {
  it("home 前缀按大小写口径折叠，输出保留原始写法", () => {
    setHomeDirForTest("C:\\Users\\Tqy")
    expect(displayPath("c:/users/tqy/work/repo")).toBe("~/work/repo")
    expect(displayPath("C:\\Users\\tqy")).toBe("~")
  })

  it("非 home 路径原样输出，null 回落默认文案", () => {
    setHomeDirForTest("C:\\Users\\Tqy")
    expect(displayPath("D:\\Work\\repo")).toBe("D:\\Work\\repo")
    expect(displayPath(null)).toBe("默认（未配置）")
  })

  it("只有策略时 status 显示策略条数与来源，不显示旧模式", () => {
    const text = formatStatus(scopeReport()).join("\n")
    expect(text).not.toContain("模式：")
    expect(text).toContain("策略：1 条")
    expect(text).toContain("来源：/repo/.toolkitrc.json")
  })

  it("list 追加策略摘要", () => {
    const text = formatList(scopeReport()).join("\n")
    expect(text).toContain("策略规则：")
    expect(text).toContain("[project] p1（规则） deny")
  })
})
