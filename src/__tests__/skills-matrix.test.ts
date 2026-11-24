// 矩阵视图：逐技能给出产物形态、当前目录形态与命中依据；旧配置给迁移提示
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { resetScopeCache } from "../scope/load"
import { buildSkillMatrix, legacyShapeHints, resetSkillsConfigWarnings } from "../skills"

let home = ""
let project = ""

function writeGlobal(config: unknown): void {
  writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify(config))
}

function writeProject(config: unknown): void {
  writeFileSync(join(project, ".toolkitrc.json"), JSON.stringify(config))
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fxts-tk-skills-matrix-"))
  project = join(home, "repo")
  mkdirSync(project, { recursive: true })
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetScopeCache()
  resetSkillsConfigWarnings()
})

afterEach(() => {
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetScopeCache()
  resetSkillsConfigWarnings()
  rmSync(home, { recursive: true, force: true })
})

describe("技能矩阵", () => {
  it("给出产物形态、当前目录形态与命中规则依据", () => {
    writeGlobal({
      policies: [
        { id: "shape", name: "公司矩阵", effect: "allow", when: { paths: ["/work/**"] }, skills: { match: ["fxri-plan-task"] }, delivery: "gated" },
      ],
    })
    const entries = buildSkillMatrix(project)
    const task = entries.find((entry) => entry.name === "fxri-plan-task")
    expect(task?.artifact).toBe("gated")
    expect(task?.source).toContain("policy:shape")
    expect(task?.rows[0]).toMatchObject({ policy: "policy:shape", when: "路径 /work/**", delivery: "gated" })
    // 未命中规则的技能按默认形态
    const review = entries.find((entry) => entry.name === "fxri-plan-review")
    expect(review?.rows).toHaveLength(0)
    expect(review?.artifact).toBe("full")
  })

  it("旧 activation 与 skillDelivery.rules 给出迁移提示", () => {
    writeProject({ activation: { mode: "allowlist", include: [project] } })
    writeGlobal({ skillDelivery: { rules: [{ match: ["fxri-*"], delivery: "gated" }] } })
    const hints = legacyShapeHints(project)
    expect(hints.join("\n")).toContain("activation")
    expect(hints.join("\n")).toContain("skillDelivery.rules")
  })
})
