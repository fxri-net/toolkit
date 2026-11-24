// 作用域写入命令的分流与技能维度映射：等价于旧 list / policy / skills 三组写法
import { describe, expect, it } from "vitest"
import { allowSkills, denySkills, hasPolicyConditions } from "../commands/scope"

describe("scope allow / deny 分流", () => {
  it("无条件选项走目录名单，出现任一条件选项走策略", () => {
    expect(hasPolicyConditions({})).toBe(false)
    expect(hasPolicyConditions({ tree: true })).toBe(false)
    expect(hasPolicyConditions({ skill: ["fxri-plan-task"] })).toBe(true)
    expect(hasPolicyConditions({ profile: ["front"] })).toBe(true)
    expect(hasPolicyConditions({ paths: ["~/work"] })).toBe(true)
    expect(hasPolicyConditions({ markers: ["package.json"] })).toBe(true)
    expect(hasPolicyConditions({ gitRemotes: ["github.com"] })).toBe(true)
    expect(hasPolicyConditions({ delivery: "gated" })).toBe(true)
  })

  it("allow 点名技能等价于仅名单内生效", () => {
    expect(allowSkills({ skill: ["fxri-plan-task"] })).toEqual({ mode: "allowlist", allow: ["fxri-plan-task"] })
    expect(allowSkills({ profile: ["front"] })).toEqual({ mode: "allowlist", profiles: ["front"] })
    expect(allowSkills({ paths: ["~/work"] })).toBeUndefined()
  })

  it("deny 点名技能等价于技能选择器，未点名即整段拒绝", () => {
    expect(denySkills({ skill: ["fxri-plan-task"] }, "global")).toEqual({ match: ["fxri-plan-task"] })
    expect(denySkills({ markers: ["legacy"] }, "global")).toBeUndefined()
  })
})
