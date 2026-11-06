// usage 向导默认值单测：重复执行 init 时应沿用历史选择
import { describe, expect, it } from "vitest"
import { DEFAULT_USAGE_CONFIG } from "../usage/config"
import { resolveInitDefaults } from "../usage/wizard"
import type { UsageConfig } from "../usage/types"

// 以默认配置为底，按需覆盖
function makeConfig(patch: Partial<UsageConfig> = {}): UsageConfig {
  return { ...DEFAULT_USAGE_CONFIG, ...patch }
}

describe("usage 向导默认值", () => {
  it("未配置过：保持关闭导向的保守默认", () => {
    const defaults = resolveInitDefaults(makeConfig())
    expect(defaults.configured).toBe(false)
    expect(defaults.agents).toEqual([])
    expect(defaults.firstParty).toBe(true)
    expect(defaults.thirdParty).toBe(false)
    expect(defaults.mode).toBe("none")
    expect(defaults.triggerPrompt).toBe(false)
    expect(defaults.rotation).toBe("monthly")
    expect(defaults.retentionDays).toBe(180)
  })

  it("已配置：逐项回填现有选择", () => {
    const defaults = resolveInitDefaults(
      makeConfig({
        enabled: true,
        agents: { trae: true, copilot: false },
        sources: { firstParty: true, thirdParty: true, unmanaged: false },
        skills: { mode: "exclude", include: [], exclude: ["a", "b"] },
        capture: { triggerPrompt: true, skillArgs: false, outcome: true },
        storage: { dir: "D:/data", rotation: "size", retentionDays: 90, maxFileBytes: 1024 },
      }),
    )
    expect(defaults.configured).toBe(true)
    expect(defaults.agents).toEqual(["trae"])
    expect(defaults.firstParty).toBe(true)
    expect(defaults.thirdParty).toBe(true)
    expect(defaults.mode).toBe("exclude")
    expect(defaults.exclude).toEqual(["a", "b"])
    expect(defaults.triggerPrompt).toBe(true)
    expect(defaults.outcome).toBe(true)
    expect(defaults.dir).toBe("D:/data")
    expect(defaults.rotation).toBe("size")
    expect(defaults.retentionDays).toBe(90)
  })

  it("Agent 有值但总开关关闭：仍视为已配置，避免重跑丢失选择", () => {
    const defaults = resolveInitDefaults(makeConfig({ enabled: false, agents: { trae: true } }))
    expect(defaults.configured).toBe(true)
    expect(defaults.agents).toEqual(["trae"])
  })
})
