// 分发形态模型：优先级推导、两个安装面的配置读取、旧键映射与 off 的安装 / 状态 / 清理口径
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import {
  explainSkillDelivery,
  installSkills,
  listPackageSkills,
  readSkillsDeliveryConfig,
  resetDeliveryWarnings,
  resetSkillDeliveryWarnings,
  resetSkillsConfigWarnings,
  resetSkillsRootCache,
  resolveDelivery,
  setPackageRootForTest,
  skillsStatus,
} from "../skills"

// 临时 home 与项目目录：产物与配置都只落在临时路径
let home = ""
let project = ""
let savedCI: string | undefined

// 主目标目录 ~/.agents/skills
function primaryDir(): string {
  return join(home, ".agents", "skills")
}

// 写全局层配置并失效缓存
function writeHomeConfig(value: unknown): void {
  writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify(value))
  resetToolkitConfigCache()
}

// 写项目层 / 本地层配置并失效缓存
function writeProjectConfig(name: string, value: unknown): void {
  writeFileSync(join(project, name), JSON.stringify(value))
  resetToolkitConfigCache()
}

// 取主目标下某技能的现场状态
function primaryState(name: string): string | undefined {
  return skillsStatus().targets.find((target) => target.dir === primaryDir())?.items.find((item) => item.name === name)?.state
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-delivery-"))
  project = mkdtempSync(join(tmpdir(), "tk-delivery-proj-"))
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
  rmSync(project, { recursive: true, force: true })
})

describe("分发形态推导", () => {
  it("显式规则优先于默认，并给出来源与原因", () => {
    const decision = resolveDelivery({
      name: "fxri-plan-task",
      config: { default: "full", rules: [{ match: ["fxri-*"], delivery: "gated" }] },
    })
    expect(decision.mode).toBe("gated")
    expect(decision.source).toContain("skillDelivery.rules[0]")
    expect(decision.reason).toContain("入口壳")
  })

  it("具体度：更具体的规则压过通配规则", () => {
    const decision = resolveDelivery({
      name: "fxri-plan-task",
      config: {
        rules: [
          { match: ["*"], delivery: "gated" },
          { match: ["fxri-plan-task"], delivery: "full" },
        ],
      },
    })
    expect(decision.mode).toBe("full")
    expect(decision.source).toContain("rules[1]")
  })

  it("具体度相同时取最后一条并告警被压规则", () => {
    const decision = resolveDelivery({
      name: "fxri-plan-task",
      config: {
        rules: [
          { match: ["fxri-*"], delivery: "gated" },
          { match: ["fxri-*"], delivery: "full" },
        ],
      },
    })
    expect(decision.mode).toBe("full")
    expect(vi.mocked(console.warn).mock.calls.some((call) => String(call[0]).includes("已压过"))).toBe(true)
  })

  it("旧键 include / exclude 映射后保持排除优先", () => {
    writeHomeConfig({ skillInstall: { gate: { include: ["fxri-*"], exclude: ["fxri-code-encoding"] } } })
    const config = readSkillsDeliveryConfig("global", project)
    const gated = resolveDelivery({ name: "fxri-plan-task", config })
    const excluded = resolveDelivery({ name: "fxri-code-encoding", config })
    expect(gated.mode).toBe("gated")
    expect(gated.source).toContain("旧键 skillInstall.gate.include")
    expect(excluded.mode).toBe("full")
    expect(excluded.source).toContain("旧键 skillInstall.gate.exclude")
  })

  it("技能声明 metadata.gate=false 单点退出，按全文安装", () => {
    const decision = resolveDelivery({
      name: "fxri-plan-task",
      config: { default: "gated", rules: [{ match: ["*"], delivery: "gated" }] },
      gate: false,
    })
    expect(decision.mode).toBe("full")
    expect(decision.source).toContain("metadata.gate=false")
  })

  it("零配置回落全文安装", () => {
    const decision = resolveDelivery({ name: "fxri-plan-task" })
    expect(decision.mode).toBe("full")
    expect(decision.source).toBe("默认")
  })
})

describe("技能包默认形态", () => {
  it("metadata.delivery 声明生效，非法取值告警后忽略", () => {
    const root = mkdtempSync(join(tmpdir(), "tk-delivery-pkg-"))
    mkdirSync(join(root, "skills", "demo-gated"), { recursive: true })
    writeFileSync(
      join(root, "skills", "demo-gated", "SKILL.md"),
      ["---", "name: demo-gated", "metadata:", "  version: 1.0.0", "  delivery: gated", "---", "", "# 演示", ""].join("\n"),
    )
    mkdirSync(join(root, "skills", "demo-bad"), { recursive: true })
    writeFileSync(
      join(root, "skills", "demo-bad", "SKILL.md"),
      ["---", "name: demo-bad", "metadata:", "  version: 1.0.0", "  delivery: off", "---", "", "# 演示", ""].join("\n"),
    )
    setPackageRootForTest(root)
    resetSkillDeliveryWarnings()
    const skills = listPackageSkills()
    expect(skills.find((skill) => skill.name === "demo-gated")?.delivery).toBe("gated")
    expect(skills.find((skill) => skill.name === "demo-bad")?.delivery).toBeUndefined()
    expect(vi.mocked(console.warn).mock.calls.some((call) => String(call[0]).includes("metadata.delivery 非法"))).toBe(true)
    // 解释接口必须带上技能包默认层级（文本与 JSON 共用同一实现）
    const explanation = explainSkillDelivery("demo-gated")
    expect(explanation.decision.mode).toBe("gated")
    expect(explanation.decision.source).toContain("metadata.delivery")
    // 声明 gated 的技能按入口壳安装
    installSkills({ skills: ["demo-gated"] })
    expect(existsSync(join(primaryDir(), "demo-gated", "SKILL.md"))).toBe(true)
    rmSync(root, { recursive: true, force: true })
    resetSkillsRootCache()
  })

  it("packageDefault 低于显式规则与策略，高于全局默认", () => {
    const byDefault = resolveDelivery({ name: "demo", packageDefault: "gated", config: { default: "full", rules: [] } })
    expect(byDefault.mode).toBe("gated")
    expect(byDefault.source).toContain("metadata.delivery")

    const byRule = resolveDelivery({
      name: "demo",
      packageDefault: "gated",
      config: { rules: [{ match: ["demo"], delivery: "full" }] },
    })
    expect(byRule.mode).toBe("full")

    const byPolicy = resolveDelivery({
      name: "demo",
      packageDefault: "full",
      policy: { mode: "gated", source: "policy:matrix", reason: "矩阵限制" },
    })
    expect(byPolicy.mode).toBe("gated")
  })
})

describe("外部来源的声明参与解释", () => {
  it("状态登记的外部技能：metadata.gate:false 在解释中生效", () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), "tk-delivery-ext-"))
    mkdirSync(join(sourceRoot, "skills", "ext-opt-out"), { recursive: true })
    writeFileSync(
      join(sourceRoot, "skills", "ext-opt-out", "SKILL.md"),
      ["---", "name: ext-opt-out", "metadata:", "  version: 1.0.0", "  gate: false", "---", "", "# 演示", ""].join("\n"),
    )
    mkdirSync(join(home, ".agents"), { recursive: true })
    writeFileSync(
      join(home, ".agents", ".toolkit-skills.json"),
      JSON.stringify({
        format: "fxri.toolkit.skills-state",
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        sources: { ext: { kind: "local", version: "", temporary: false, root: sourceRoot, targets: [] } },
      }),
    )
    const explanation = explainSkillDelivery("ext-opt-out")
    expect(explanation.decision.mode).toBe("full")
    expect(explanation.decision.source).toContain("metadata.gate=false")
    rmSync(sourceRoot, { recursive: true, force: true })
  })
})

describe("分发形态配置读取", () => {
  it("全局面读全局层 + 本地层，忽略项目层并告警", () => {
    writeHomeConfig({ skillDelivery: { default: "gated" } })
    writeProjectConfig(".toolkitrc.json", { skillDelivery: { default: "off" } })
    const config = readSkillsDeliveryConfig("global", project)
    expect(config.default).toBe("gated")
    expect(vi.mocked(console.warn).mock.calls.some((call) => String(call[0]).includes("全局面不读取项目层配置"))).toBe(true)
  })

  it("项目面读全局 + 项目 + 本地，项目层整段覆盖全局、本地层字段覆盖", () => {
    writeHomeConfig({ skillDelivery: { default: "gated" } })
    writeProjectConfig(".toolkitrc.json", { skillDelivery: { default: "off" } })
    expect(readSkillsDeliveryConfig("project", project).default).toBe("off")
    writeProjectConfig(".toolkitrc.local.json", { skillDelivery: { default: "full" } })
    expect(readSkillsDeliveryConfig("project", project).default).toBe("full")
  })

  it("旧键 gate: true 映射为默认入口壳并提示一次", () => {
    writeHomeConfig({ skillInstall: { gate: true } })
    expect(readSkillsDeliveryConfig("global", project).default).toBe("gated")
    const hits = () => vi.mocked(console.warn).mock.calls.filter((call) => String(call[0]).includes("skillInstall.gate")).length
    expect(hits()).toBe(1)
    readSkillsDeliveryConfig("global", project)
    expect(hits()).toBe(1)
  })

  it("新旧并存以 skillDelivery 为准并告警旧键被忽略", () => {
    writeHomeConfig({ skillInstall: { gate: true }, skillDelivery: { default: "off" } })
    expect(readSkillsDeliveryConfig("global", project).default).toBe("off")
    expect(vi.mocked(console.warn).mock.calls.some((call) => String(call[0]).includes("旧键不再生效"))).toBe(true)
  })

  it("非法枚举与非法模式告警剔除", () => {
    writeHomeConfig({
      skillDelivery: {
        default: "half",
        rules: [
          { match: ["re:("], delivery: "gated" },
          { match: ["fxri-*"], delivery: "nope" },
        ],
      },
    })
    const config = readSkillsDeliveryConfig("global", project)
    expect(config.default).toBeUndefined()
    expect(config.rules).toEqual([])
    expect(vi.mocked(console.warn).mock.calls.some((call) => String(call[0]).includes("skillDelivery.default"))).toBe(true)
  })
})

describe("安装与状态的分发形态口径", () => {
  it("规则指定 gated 只写入口壳，其余保持全文", () => {
    writeHomeConfig({ skillDelivery: { rules: [{ match: ["fxri-plan-task"], delivery: "gated" }] } })
    const report = installSkills({ skills: ["fxri-plan-task", "fxri-code-encoding"] })
    const primary = report.targets.find((target) => target.kind === "primary")
    expect(primary?.gates).toEqual(["fxri-plan-task"])
    expect(primary?.links).toContain("fxri-code-encoding")
    expect(primaryState("fxri-plan-task")).toBe("gate")
  })

  it("规则指定 off 不写产物，status 不把缺失算作问题", () => {
    writeHomeConfig({ skillDelivery: { rules: [{ match: ["fxri-plan-task"], delivery: "off" }] } })
    installSkills({ skills: ["fxri-plan-task"] })
    expect(existsSync(join(primaryDir(), "fxri-plan-task"))).toBe(false)
    expect(primaryState("fxri-plan-task")).toBeUndefined()
  })

  it("off 的既有产物在 status 单列残留，--prune 后清理", () => {
    installSkills({ skills: ["fxri-plan-task"] })
    expect(existsSync(join(primaryDir(), "fxri-plan-task"))).toBe(true)
    writeHomeConfig({ skillDelivery: { rules: [{ match: ["fxri-plan-task"], delivery: "off" }] } })
    expect(primaryState("fxri-plan-task")).toBe("residue")
    installSkills({ skills: ["fxri-plan-task"], prune: true })
    expect(existsSync(join(primaryDir(), "fxri-plan-task"))).toBe(false)
  })
})
