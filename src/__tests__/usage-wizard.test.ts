// usage 向导默认值单测：重复执行 init 时应沿用历史选择
import { describe, expect, it } from "vitest"
import { DEFAULT_USAGE_CONFIG } from "../usage/config"
import { DEFAULT_INIT_PRESET, PRESET_LABELS, resolveInitDefaults } from "../usage/wizard"
import type { UsageConfig } from "../usage/types"

// 以默认配置为底，按需覆盖
function makeConfig(patch: Partial<UsageConfig> = {}): UsageConfig {
  return { ...DEFAULT_USAGE_CONFIG, ...patch }
}

describe("usage 向导默认值", () => {
  it("未配置过：默认预设覆盖一方与第三方技能", () => {
    // 默认预设是产品决定：显式执行 init 即启用，并一并统计第三方技能
    expect(DEFAULT_INIT_PRESET).toBe("third-party")
    const defaults = resolveInitDefaults(makeConfig())
    expect(defaults.configured).toBe(false)
    expect(defaults.agents).toEqual([])
    // 回填值只反映现有配置（未配置视为一方开、第三方关），第三方由预设分支强制打开
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

  it("预设文案写明上传口径，不再出现「本地 +」的歧义表述", () => {
    // 「本地」在 usage 域还指本地来源 / 本地目录，预设名必须显式说清是否上传
    expect(PRESET_LABELS["third-party"]).toContain("不上传")
    expect(PRESET_LABELS.recommended).toContain("不上传")
    expect(PRESET_LABELS.advanced).toContain("配置上传")
    for (const [key, label] of Object.entries(PRESET_LABELS)) {
      expect(label, `预设 ${key} 仍含「本地 +」`).not.toContain("本地 +")
      expect(label, `预设 ${key} 仍含「本地统计」`).not.toContain("本地统计")
    }
  })
})
