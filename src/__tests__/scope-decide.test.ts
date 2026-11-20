// 作用域判定：排除优先、白名单、marker 与 git 远端组合
import { describe, expect, it } from "vitest"
import { decideScope } from "../scope/decide"
import type { ActivationConfig, ScopeContext } from "../scope/types"

// 构造判定现场：默认 POSIX 路径、无 git、无 marker
function context(overrides: Partial<ScopeContext> = {}): ScopeContext {
  return {
    cwd: "/home/u/work/repo",
    gitRoot: "/home/u/work/repo",
    gitRemote: null,
    markers: new Set<string>(),
    caseInsensitive: false,
    ...overrides,
  }
}

// 构造配置：未写的字段取默认值
function activation(overrides: Partial<ActivationConfig> = {}): ActivationConfig {
  return {
    mode: "allowlist",
    include: [],
    exclude: [],
    markers: { include: [], exclude: [] },
    gitRemotes: [],
    ...overrides,
  }
}

describe("decideScope", () => {
  it("未配置时全域生效", () => {
    const decision = decideScope(null, context())
    expect(decision.active).toBe(true)
    expect(decision.mode).toBe("all")
    expect(decision.reason).toContain("未配置")
  })

  it("白名单命中生效，未命中不生效，空白名单不生效", () => {
    expect(decideScope(activation({ include: ["/home/u/work/**"] }), context()).active).toBe(true)
    expect(decideScope(activation({ include: ["/home/u/other/**"] }), context()).active).toBe(false)
    expect(decideScope(activation({ include: [] }), context()).active).toBe(false)
  })

  it("排除规则优先于白名单", () => {
    const decision = decideScope(
      activation({ include: ["/home/u/work/**"], exclude: ["/home/u/work/repo"] }),
      context(),
    )
    expect(decision.active).toBe(false)
    expect(decision.matchedRule).toContain("exclude:")
  })

  it("黑名单模式默认生效，命中排除不生效", () => {
    expect(decideScope(activation({ mode: "denylist" }), context()).active).toBe(true)
    expect(decideScope(activation({ mode: "denylist", exclude: ["/home/u/work/**"] }), context()).active).toBe(false)
  })

  it("marker 与 git 远端作为附加条件", () => {
    const withMarker = activation({ mode: "all", markers: { include: [".toolkit-scope"], exclude: [] } })
    expect(decideScope(withMarker, context()).active).toBe(false)
    expect(decideScope(withMarker, context({ markers: new Set([".toolkit-scope"]) })).active).toBe(true)
    const withRemote = activation({ mode: "all", gitRemotes: ["github.com/acme/**"] })
    expect(decideScope(withRemote, context({ gitRemote: "git@github.com:acme/repo.git" })).active).toBe(true)
    expect(decideScope(withRemote, context({ gitRemote: "https://github.com/acme/repo.git" })).active).toBe(true)
    expect(decideScope(withRemote, context({ gitRemote: "https://github.com/other/repo.git" })).active).toBe(false)
  })
})
