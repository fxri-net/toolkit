// 策略推导：矩阵声明直接决定分发形态，显式规则仍可覆盖；解释接口逐级复述命中情况
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import {
  derivePolicyDelivery,
  explainDelivery,
  installSkills,
  resetDeliveryWarnings,
  resetSkillsConfigWarnings,
  resetSkillsRootCache,
  resolveDelivery,
} from "../skills"

// 临时 home：矩阵与产物只落在临时目录
let home = ""
let savedCI: string | undefined

// 主目标目录 ~/.agents/skills
function primaryDir(): string {
  return join(home, ".agents", "skills")
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-policy-delivery-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetSkillsConfigWarnings()
  resetDeliveryWarnings()
  savedCI = process.env.CI
  delete process.env.CI
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (savedCI === undefined) delete process.env.CI
  else process.env.CI = savedCI
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  resetSkillsConfigWarnings()
  resetDeliveryWarnings()
  rmSync(home, { recursive: true, force: true })
})

describe("策略推导", () => {
  const emptyProfiles: never[] = []

  it("带条件的 deny 推导为入口壳，并给出策略 id", () => {
    const decision = derivePolicyDelivery("fxri-plan-to-task", {
      policies: [{ id: "deny-work", effect: "deny", when: { paths: ["/work/**"] } }],
      profiles: emptyProfiles,
    })
    expect(decision?.mode).toBe("gated")
    expect(decision?.source).toBe("policy:deny-work")
  })

  it("无条件 deny 推导为不安装", () => {
    const decision = derivePolicyDelivery("fxri-plan-to-task", {
      policies: [{ id: "deny-all", effect: "deny" }],
      profiles: emptyProfiles,
    })
    expect(decision?.mode).toBe("off")
  })

  it("收窄的允许名单不含该技能时推导为入口壳", () => {
    const decision = derivePolicyDelivery("fxri-plan-to-task", {
      policies: [{ id: "allow-small", skills: { mode: "allowlist", allow: ["fxri-plan-review"] } }],
      profiles: emptyProfiles,
    })
    expect(decision?.mode).toBe("gated")
    expect(decision?.reason).toContain("允许名单")
  })

  it("允许名单为全量通配 * 时不产生限制", () => {
    const decision = derivePolicyDelivery("fxri-plan-to-task", {
      policies: [{ id: "allow-all", skills: { mode: "allowlist", allow: ["*"] } }],
      profiles: emptyProfiles,
    })
    expect(decision).toBeUndefined()
  })

  it("多策略命中时 source 列出全部 id，reason 取最具体一条", () => {
    const decision = derivePolicyDelivery("fxri-plan-to-task", {
      policies: [
        { id: "broad", skills: { match: ["fxri-*"], mode: "allowlist", allow: ["fxri-plan-review"] } },
        { id: "exact", skills: { match: ["fxri-plan-to-task"], mode: "allowlist", allow: ["fxri-plan-review"] } },
      ],
      profiles: emptyProfiles,
    })
    expect(decision?.source).toBe("policy:broad、policy:exact")
    expect(decision?.reason).toContain("policy:exact")
  })

  it("技能声明退出高于命令行显式取值", () => {
    const decision = resolveDelivery({ name: "fxri-plan-to-task", override: "gated", gate: false })
    expect(decision.mode).toBe("full")
    expect(decision.source).toContain("metadata.gate=false")
  })

  it("显式规则优先于策略推导", () => {
    const decision = resolveDelivery({
      name: "fxri-plan-to-task",
      config: { rules: [{ match: ["fxri-plan-to-task"], delivery: "full" }] },
      policy: { mode: "gated", source: "policy:matrix", reason: "矩阵限制" },
    })
    expect(decision.mode).toBe("full")
    expect(decision.source).toContain("skillDelivery.rules[0]")
  })
})

describe("推导解释", () => {
  it("逐级给出命中 / 未命中，并暴露被压规则", () => {
    const explanation = explainDelivery({
      name: "fxri-plan-to-task",
      config: {
        rules: [
          { match: ["fxri-*"], delivery: "gated" },
          { match: ["fxri-*"], delivery: "full" },
        ],
      },
    })
    expect(explanation.decision.mode).toBe("full")
    expect(explanation.levels.map((level) => level.level)).toEqual([
      "技能声明 metadata.gate",
      "命令行显式取值",
      "显式规则",
    ])
    expect(explanation.overridden.length).toBe(1)
  })

  it("未命中任何级别时列出全局默认回落", () => {
    const explanation = explainDelivery({ name: "fxri-plan-to-task" })
    expect(explanation.decision.mode).toBe("full")
    expect(explanation.levels.at(-1)?.detail).toContain("回落全文安装")
  })
})

describe("安装按矩阵推导", () => {
  it("矩阵只限制部分技能时，受限技能写入口壳、其余保持全文", () => {
    writeFileSync(
      join(home, ".toolkitrc.json"),
      JSON.stringify({ policies: [{ id: "matrix", effect: "allow", skills: { mode: "allowlist", allow: ["fxri-plan-review"] } }] }),
    )
    resetToolkitConfigCache()
    const report = installSkills({ skills: ["fxri-plan-review", "fxri-plan-to-task"] })
    const primary = report.targets.find((target) => target.kind === "primary")
    expect(primary?.links).toContain("fxri-plan-review")
    expect(primary?.gates).toContain("fxri-plan-to-task")
    expect(existsSync(join(primaryDir(), "fxri-plan-to-task", "SKILL.md"))).toBe(true)
  })
})
