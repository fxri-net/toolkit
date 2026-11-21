// 项目面分发形态：gated 落入口壳、off 不落产物、状态与 guard 按项目层配置判定
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { resolveGuard } from "../scope/guard"
import { resetScopeCache } from "../scope/load"
import {
  buildSkillGateShell,
  buildSkillShell,
  installProjectSkills,
  isSkillGateShell,
  projectSkillsStatus,
  readSkillDescription,
  resetDeliveryWarnings,
  resetSkillsConfigWarnings,
  resetSkillsRootCache,
} from "../skills"

// 临时 home 与项目：配置与产物只落在临时目录
let home = ""
let project = ""
let savedCI: string | undefined

// 项目面候选薄壳目录（测试固定用 .trae/skills）
const SHELL_DIR = ".trae/skills"

// 写项目层配置并失效缓存
function writeProjectConfig(value: unknown): void {
  writeFileSync(join(project, ".toolkitrc.json"), JSON.stringify(value))
  resetToolkitConfigCache()
  resetScopeCache()
}

// 安装两个技能：一个按规则收口、一个保持全文
function installPair(): ReturnType<typeof installProjectSkills> {
  return installProjectSkills({ cwd: project, skills: ["fxri-plan-to-task", "fxri-text-encoding"] })
}

// 项目面某目录下某技能的状态
function stateIn(dir: string, name: string): string | undefined {
  return projectSkillsStatus(project).dirs.find((item) => item.dir === dir)?.items.find((item) => item.name === name)?.state
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-proj-delivery-"))
  project = mkdtempSync(join(home, "repo-"))
  setHomeDirForTest(home)
  mkdirSync(join(project, ".tasks"), { recursive: true })
  mkdirSync(join(project, SHELL_DIR), { recursive: true })
  resetToolkitConfigCache()
  resetScopeCache()
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
  resetScopeCache()
  resetSkillsRootCache()
  resetSkillsConfigWarnings()
  resetDeliveryWarnings()
  rmSync(home, { recursive: true, force: true })
})

describe("项目面分发形态", () => {
  it("未配置 skillsDelivery 时保持全文：真源副本 + 项目薄壳", () => {
    const report = installPair()
    expect(report.source.created).toEqual(expect.arrayContaining(["fxri-plan-to-task", "fxri-text-encoding"]))
    const skill = { name: "fxri-plan-to-task", dir: join(project, ".agents/skills/fxri-plan-to-task") }
    const shell = readFileSync(join(project, SHELL_DIR, "fxri-plan-to-task", "SKILL.md"), "utf8")
    expect(isSkillGateShell(shell)).toBe(false)
    expect(shell).toBe(buildSkillShell(skill.name, ".agents/skills", readSkillDescription(skill.dir)))
  })

  it("项目层规则指定 gated 时只写入口壳，真源副本保留", () => {
    writeProjectConfig({ skillsDelivery: { rules: [{ match: ["fxri-plan-to-task"], delivery: "gated" }] } })
    const report = installPair()
    expect(report.shells[0]?.gates).toContain("fxri-plan-to-task")
    const gate = readFileSync(join(project, SHELL_DIR, "fxri-plan-to-task", "SKILL.md"), "utf8")
    expect(isSkillGateShell(gate)).toBe(true)
    expect(gate).toContain("toolkit scope guard fxri-plan-to-task")
    // 真源副本仍写入，作为 guard 的正文来源
    expect(existsSync(join(project, ".agents/skills/fxri-plan-to-task/SKILL.md"))).toBe(true)
    // 未被规则覆盖的技能仍是项目薄壳
    const other = readFileSync(join(project, SHELL_DIR, "fxri-text-encoding", "SKILL.md"), "utf8")
    expect(isSkillGateShell(other)).toBe(false)
  })

  it("入口壳就绪、被改动或真源缺失时状态可分辨", () => {
    writeProjectConfig({ skillsDelivery: { rules: [{ match: ["fxri-plan-to-task"], delivery: "gated" }] } })
    installPair()
    expect(stateIn(SHELL_DIR, "fxri-plan-to-task")).toBe("ready")
    // 保留本包标记但内容过期 → 漂移，重跑 install 恢复
    const gateFile = join(project, SHELL_DIR, "fxri-plan-to-task", "SKILL.md")
    writeFileSync(gateFile, `${readFileSync(gateFile, "utf8")}<!-- 过期 -->\n`, "utf8")
    expect(stateIn(SHELL_DIR, "fxri-plan-to-task")).toBe("drift")
    installPair()
    expect(stateIn(SHELL_DIR, "fxri-plan-to-task")).toBe("ready")
    // 真源副本缺失 → 真源目录报缺失
    rmSync(join(project, ".agents/skills/fxri-plan-to-task"), { recursive: true, force: true })
    expect(stateIn(".agents/skills", "fxri-plan-to-task")).toBe("missing")
  })

  it("off 不落产物，既有产物单列残留并由 --prune 清理", () => {
    installPair()
    writeProjectConfig({ skillsDelivery: { rules: [{ match: ["fxri-plan-to-task"], delivery: "off" }] } })
    expect(stateIn(SHELL_DIR, "fxri-plan-to-task")).toBe("residue")
    installProjectSkills({ cwd: project, skills: ["fxri-plan-to-task"], prune: true })
    expect(existsSync(join(project, SHELL_DIR, "fxri-plan-to-task"))).toBe(false)
    expect(existsSync(join(project, ".agents/skills/fxri-plan-to-task"))).toBe(false)
    expect(stateIn(SHELL_DIR, "fxri-plan-to-task")).toBeUndefined()
  })
})

describe("guard 读取项目真源", () => {
  it("仓库内真源副本优先，子目录运行结论一致", () => {
    writeProjectConfig({ skillsDelivery: { rules: [{ match: ["fxri-plan-to-task"], delivery: "gated" }] } })
    installPair()
    const body = "# 项目内正文\n\n按项目层配置下发\n"
    writeFileSync(join(project, ".agents/skills/fxri-plan-to-task/SKILL.md"), body, "utf8")
    const fromRoot = resolveGuard("fxri-plan-to-task", project)
    expect(fromRoot.active).toBe(true)
    expect(fromRoot.content).toBe(body)
    const sub = join(project, "packages", "child")
    mkdirSync(sub, { recursive: true })
    expect(resolveGuard("fxri-plan-to-task", sub).content).toBe(body)
  })

  it("项目层作用域配置优先于全局层", () => {
    writeProjectConfig({
      skillsDelivery: { rules: [{ match: ["fxri-plan-to-task"], delivery: "gated" }] },
      policies: [{ id: "allow-project", effect: "allow" }],
    })
    installPair()
    // 全局层拒绝该项目目录，项目层允许：按项目层结论下发正文
    writeFileSync(
      join(home, ".toolkitrc.json"),
      JSON.stringify({ policies: [{ id: "deny-global", effect: "deny", when: { paths: [`${project}/**`] } }] }),
    )
    resetToolkitConfigCache()
    resetScopeCache()
    const result = resolveGuard("fxri-plan-to-task", project)
    expect(result.active).toBe(true)
    expect(result.content).toContain("fxri-plan-to-task")
    expect(result.content).not.toBe(buildSkillGateShell("fxri-plan-to-task", ""))
  })
})
