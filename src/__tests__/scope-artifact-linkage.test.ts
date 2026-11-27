// 作用域写入联动：写前预演形态变化、写后收敛产物、重复执行幂等
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { applyArtifactLinkage, previewShapeChanges } from "../scope/artifact-linkage"
import { resetScopeCache } from "../scope/load"
import { isSkillGateShell, reconcileSkills, resetDeliveryWarnings, resetSkillsConfigWarnings, resetSkillsRootCache } from "../skills"
import { tempDir } from "./helpers"

let home = ""
let project = ""

// 全局配置：只选一个技能，并用策略把它声明为入口壳
function writeGlobal(next: Record<string, unknown>): void {
  writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify(next))
}

const gatedConfig = {
  skillInstall: { selection: { toolkit: ["fxri-plan-task"] } },
  policies: [{ id: "shape", effect: "allow", skills: { match: ["fxri-plan-task"] }, delivery: "gated" }],
}

beforeEach(() => {
  home = tempDir("fxts-tk-scope-linkage-")
  project = join(home, "repo")
  mkdirSync(project, { recursive: true })
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetScopeCache()
  resetSkillsRootCache()
  resetSkillsConfigWarnings()
  resetDeliveryWarnings()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetScopeCache()
  resetSkillsRootCache()
  resetSkillsConfigWarnings()
  resetDeliveryWarnings()
  rmSync(home, { recursive: true, force: true })
})

describe("写前预演", () => {
  it("按即将写入的配置给出形态变化，未变化不列", () => {
    writeGlobal(gatedConfig)
    const changes = previewShapeChanges("global", { skillInstall: gatedConfig.skillInstall, policies: [] }, project)
    expect(changes).toEqual([{ face: "global", name: "fxri-plan-task", from: "gated", to: "full" }])
    // 与原配置相同的预演不产生变化
    expect(previewShapeChanges("global", gatedConfig, project)).toEqual([])
  })

  it("项目层只预演项目面", () => {
    writeGlobal({ skillInstall: { selection: { toolkit: ["fxri-plan-task"] } } })
    const changes = previewShapeChanges(
      "project",
      { policies: [{ id: "shape", effect: "allow", skills: { match: ["fxri-plan-task"] }, delivery: "off" }] },
      project,
    )
    expect(changes.every((change) => change.face === "project")).toBe(true)
  })
})

describe("写后收敛", () => {
  it("声明入口壳后把产物改成入口壳，重复执行幂等", () => {
    writeGlobal(gatedConfig)
    const outcome = applyArtifactLinkage([{ face: "global", name: "fxri-plan-task", from: "full", to: "gated" }], project)
    expect(outcome.failed).toBe(0)
    const shell = join(home, ".agents", "skills", "fxri-plan-task", "SKILL.md")
    expect(existsSync(shell)).toBe(true)
    expect(isSkillGateShell(readFileSync(shell, "utf8"))).toBe(true)
    // 再跑一次：已是目标形态，不再列为待收敛
    expect(reconcileSkills({ scope: "global", startDir: project, skills: ["fxri-plan-task"] }).items).toHaveLength(0)
  })

  it("预演模式只报告不写盘", () => {
    writeGlobal(gatedConfig)
    const result = reconcileSkills({ scope: "global", startDir: project, skills: ["fxri-plan-task"], dryRun: true })
    expect(result.items.map((item) => item.name)).toContain("fxri-plan-task")
    expect(result.changed).toBe(0)
    expect(existsSync(join(home, ".agents", "skills", "fxri-plan-task"))).toBe(false)
  })
})
