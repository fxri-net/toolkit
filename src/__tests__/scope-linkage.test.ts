// 技能矩阵与内容闸门联动：闸门未接管、策略失效与死技能提示
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { analyzeSkillLinkage, formatLinkageHints } from "../scope/linkage"
import { resetScopeCache } from "../scope/load"

let home = ""
let project = ""

function writeGlobal(config: unknown): void {
  writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify(config))
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "scope-linkage-"))
  project = join(home, "repo")
  mkdirSync(join(project, ".tasks"), { recursive: true })
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetScopeCache()
})

afterEach(() => {
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetScopeCache()
  rmSync(home, { recursive: true, force: true })
})

// 矩阵只允许 fxri-plan-review，其余包内技能在当前目录被拒绝
function matrixConfig(gate?: boolean | { include: string[]; exclude: string[] }): Record<string, unknown> {
  return {
    policies: [
      {
        id: "matrix",
        name: "技能矩阵",
        skills: { mode: "allowlist", allow: ["fxri-plan-review"] },
        effect: "allow",
      },
    ],
    ...(gate === undefined ? {} : { skillsInstall: { gate } }),
  }
}

describe("analyzeSkillLinkage", () => {
  it("未配置矩阵时不产生联动提示", () => {
    writeGlobal({ activation: { mode: "all", include: [], exclude: [] } })
    const report = analyzeSkillLinkage(project)
    expect(report.matrixConfigured).toBe(false)
    expect(report.dead).toEqual([])
    expect(formatLinkageHints(report)).toEqual([])
  })

  it("闸门未开启时提示正文仍全量加载，并列出被矩阵拒绝的技能", () => {
    writeGlobal(matrixConfig())
    const report = analyzeSkillLinkage(project)
    expect(report.matrixConfigured).toBe(true)
    expect(report.gateEnabled).toBe(false)
    expect(report.dead).toContain("fxri-text-encoding")
    expect(report.ineffective).toContain("fxri-text-encoding")
    const hints = formatLinkageHints(report).join("\n")
    expect(hints).toContain("矩阵已配置，但正文仍全量加载")
    expect(hints).toContain("策略无效：")
    expect(hints).toContain("已安装但矩阵未允许")
  })

  it("闸门开启且默认接管全部技能时策略生效，死技能仍提示", () => {
    writeGlobal(matrixConfig(true))
    const report = analyzeSkillLinkage(project)
    expect(report.gateEnabled).toBe(true)
    expect(report.ineffective).toEqual([])
    expect(report.dead).toContain("fxri-text-encoding")
    expect(formatLinkageHints(report).join("\n")).not.toContain("策略无效")
  })

  it("闸门规则排除目标技能时提示策略无效", () => {
    writeGlobal(matrixConfig({ include: ["*"], exclude: ["fxri-text-encoding"] }))
    const report = analyzeSkillLinkage(project)
    expect(report.ineffective).toEqual(["fxri-text-encoding"])
    expect(formatLinkageHints(report).join("\n")).toContain("策略无效：fxri-text-encoding")
  })
})
