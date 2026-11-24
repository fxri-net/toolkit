// 技能选择与状态重构：分层配置、新状态结构迁移、选择集解析、未选择产物与 --prune 清理
// 用例把 home 与项目目录注入临时目录，产物只落在临时目录
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import {
  buildSkillChoices,
  coreSkillNames,
  groupSkillChoices,
  hasGlobalSkillsInstalled,
  installSkills,
  listPackageSkills,
  optionalSkillNames,
  planSkillSelection,
  readProjectSkillsConfig,
  readSavedSelection,
  readSkillsInstallConfig,
  readSkillsState,
  resetSkillsConfigWarnings,
  resetSkillsRootCache,
  skillsSourceDir,
  skillsStateFile,
  skillsStatus,
  writeProjectSkillsConfig,
  writeSkillsInstallConfig,
} from "../skills"

// 临时 home（全局层配置与状态文件落点）
let home = ""
// 临时项目目录（项目层配置落点）
let project = ""
// 用例前的 CI 环境值：自愈在 CI 下跳过，避免宿主环境影响断言
let savedCI: string | undefined

// 取包内技能名（保持包内顺序）
function skillNames(): string[] {
  return listPackageSkills().map((skill) => skill.name)
}

// 读取全局层配置文件原文
function readGlobalConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8")) as Record<string, unknown>
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fxts-tk-skills-select-"))
  // 项目目录落在注入的 home 下：项目层查找止于 home，避免向上命中真实用户配置
  project = mkdtempSync(join(home, "fxts-tk-skills-project-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  resetSkillsConfigWarnings()
  savedCI = process.env.CI
  delete process.env.CI
})

afterEach(() => {
  vi.restoreAllMocks()
  if (savedCI === undefined) delete process.env.CI
  else process.env.CI = savedCI
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  resetSkillsConfigWarnings()
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
})

describe("planSkillSelection 选择集解析", () => {
  it("首次且非交互时只装 core 技能", () => {
    const skills = listPackageSkills()
    const plan = planSkillSelection({ skills, interactive: false, yes: false })
    expect(plan.names).toEqual(coreSkillNames(skills))
    expect(plan.needsPrompt).toBe(false)
  })

  it("有已保存选择时回显 core + 已选可选技能", () => {
    const skills = listPackageSkills()
    const optional = optionalSkillNames(skills)[0]!
    const plan = planSkillSelection({ skills, saved: [optional], interactive: false, yes: true })
    expect(plan.names).toEqual(expect.arrayContaining([...coreSkillNames(skills), optional]))
    expect(plan.names).toHaveLength(coreSkillNames(skills).length + 1)
  })

  it("显式 --skills 优先且 core 恒装，非法名称单独回报", () => {
    const skills = listPackageSkills()
    const optional = optionalSkillNames(skills)[0]!
    const plan = planSkillSelection({ skills, explicit: [optional, "fxri-not-exists"], interactive: false, yes: false })
    expect(plan.names).toContain(optional)
    expect(plan.names).toEqual(expect.arrayContaining(coreSkillNames(skills)))
    expect(plan.invalid).toEqual(["fxri-not-exists"])
    expect(plan.error).toBeUndefined()
  })

  it("--skills 全部非法时报错，由调用方终止", () => {
    const plan = planSkillSelection({ skills: listPackageSkills(), explicit: ["fxri-not-exists"], interactive: false, yes: false })
    expect(plan.names).toEqual([])
    expect(plan.error).toBe("全部取值非法")
  })

  it("--all 安装全部、--no-optional 只装 core", () => {
    const skills = listPackageSkills()
    expect(planSkillSelection({ skills, all: true, interactive: false, yes: false }).names).toEqual(skillNames())
    expect(planSkillSelection({ skills, noOptional: true, interactive: false, yes: false }).names).toEqual(coreSkillNames(skills))
  })

  it("TTY 且未用 --yes / 未显式传参时进入交互；--yes 跳过交互", () => {
    const skills = listPackageSkills()
    expect(planSkillSelection({ skills, interactive: true, yes: false }).needsPrompt).toBe(true)
    expect(planSkillSelection({ skills, interactive: true, yes: true }).needsPrompt).toBe(false)
  })

  it("交互选项：core 恒选中，可选技能按已保存选择回显", () => {
    const skills = listPackageSkills()
    const optional = optionalSkillNames(skills)[0]!
    const choices = buildSkillChoices(skills, [optional])
    expect(choices.filter((choice) => choice.tier === "core").every((choice) => choice.selected)).toBe(true)
    expect(choices.find((choice) => choice.name === optional)?.selected).toBe(true)
    expect(choices.find((choice) => choice.tier === "optional" && choice.name !== optional)?.selected).toBe(false)
  })

  it("交互选项顺序：core 全部先于 optional，组内保持名称升序（两种模式一致）", () => {
    const skills = listPackageSkills()
    const tierOf = new Map(skills.map((skill) => [skill.name, skill.tier]))
    for (const mode of ["skills", "package"] as const) {
      const names = buildSkillChoices(skills, [], mode).map((choice) => choice.name)
      const cores = names.filter((name) => tierOf.get(name) === "core")
      const optionals = names.filter((name) => tierOf.get(name) !== "core")
      expect(names).toEqual([...cores, ...optionals])
      expect(cores).toEqual([...cores].sort())
      expect(optionals).toEqual([...optionals].sort())
    }
  })
})

// 构造交互层技能条目：source 省略即包内
function promptSkill(name: string, tier: "core" | "optional", source?: string) {
  return { name, dir: `/tmp/${name}`, version: "1.0.0", tier, requires: [], previousNames: [], source }
}

describe("groupSkillChoices 按来源分组", () => {
  const mixed = [
    promptSkill("fxri-web", "optional"),
    promptSkill("fxri-plan-task", "core"),
    promptSkill("playbook-b", "optional", "playbook"),
    promptSkill("playbook-a", "optional", "playbook"),
    promptSkill("alpha-x", "optional", "alpha"),
    promptSkill("fxri-plan-review", "core"),
  ]

  it("包内 core → 包内 optional → 外部来源按来源名排序，组内按技能名升序", () => {
    const groups = groupSkillChoices(mixed, [], "skills")
    expect(groups.map((group) => group.title)).toEqual(["包内 · 必装", "包内 · 可选", "alpha", "playbook"])
    expect(groups[0]?.choices.map((choice) => choice.name)).toEqual(["fxri-plan-review", "fxri-plan-task"])
    expect(groups[1]?.choices.map((choice) => choice.name)).toEqual(["fxri-web"])
    expect(groups[3]?.choices.map((choice) => choice.name)).toEqual(["playbook-a", "playbook-b"])
  })

  it("package 模式合并为单一「包内」组，不写必装", () => {
    const groups = groupSkillChoices(mixed, [], "package")
    expect(groups.map((group) => group.title)).toEqual(["包内", "alpha", "playbook"])
    expect(groups[0]?.choices.map((choice) => choice.name)).toEqual([
      "fxri-plan-review",
      "fxri-plan-task",
      "fxri-web",
    ])
  })

  it("选择语义不变：skills 模式 core 恒选，package 模式未保存时全不选，已保存回显", () => {
    const skillsMode = groupSkillChoices(mixed, ["playbook-a"], "skills").flatMap((group) => group.choices)
    expect(skillsMode.filter((choice) => choice.tier === "core").every((choice) => choice.selected)).toBe(true)
    expect(skillsMode.find((choice) => choice.name === "playbook-a")?.selected).toBe(true)
    expect(skillsMode.find((choice) => choice.name === "alpha-x")?.selected).toBe(false)

    const packageMode = groupSkillChoices(mixed, undefined, "package").flatMap((group) => group.choices)
    expect(packageMode.every((choice) => !choice.selected)).toBe(true)

    const echoed = groupSkillChoices(mixed, ["alpha-x"], "package").flatMap((group) => group.choices)
    expect(echoed.find((choice) => choice.name === "alpha-x")?.selected).toBe(true)
  })
})

describe("状态文件新结构与旧结构导入", () => {
  it("旧结构一次性导入新结构并备份 .bak", () => {
    mkdirSync(join(home, ".agents"), { recursive: true })
    const legacy = {
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      targets: [{ dir: join(home, ".agents", "skills"), updatedAt: "2026-01-01T00:00:00.000Z", links: ["fxri-plan-task"], copies: ["fxri-plan-recap"] }],
    }
    writeFileSync(skillsStateFile(), `${JSON.stringify(legacy, null, 2)}\n`, "utf8")

    const state = readSkillsState()
    expect(state?.format).toBe("fxri.toolkit.skills-state")
    expect(state?.schemaVersion).toBe(1)
    const target = state?.sources["toolkit"]?.targets[0]
    expect(target?.dir).toBe(join(home, ".agents", "skills"))
    expect(target?.entries).toEqual([
      { name: "fxri-plan-task", version: expect.any(String), mode: "link" },
      { name: "fxri-plan-recap", version: expect.any(String), mode: "copy" },
    ])
    // 导入前备份旧文件，便于回滚
    const backup = JSON.parse(readFileSync(`${skillsStateFile()}.bak`, "utf8")) as { targets: unknown[] }
    expect(backup.targets).toHaveLength(1)
    // 文件已落为新结构
    const onDisk = JSON.parse(readFileSync(skillsStateFile(), "utf8")) as { format?: string }
    expect(onDisk.format).toBe("fxri.toolkit.skills-state")
  })

  it("损坏状态按未安装处理，不写坏文件", () => {
    mkdirSync(join(home, ".agents"), { recursive: true })
    writeFileSync(skillsStateFile(), "{ 非法 json", "utf8")
    expect(readSkillsState()).toBeNull()
    expect(hasGlobalSkillsInstalled()).toBe(false)
  })

  it("新结构空来源不视为已安装", () => {
    mkdirSync(join(home, ".agents"), { recursive: true })
    writeFileSync(
      skillsStateFile(),
      `${JSON.stringify({ format: "fxri.toolkit.skills-state", schemaVersion: 1, updatedAt: "", sources: { toolkit: { kind: "builtin", version: "", temporary: false, targets: [] } } })}\n`,
      "utf8",
    )
    expect(hasGlobalSkillsInstalled()).toBe(false)
  })
})

describe("技能选择落盘与未选择产物", () => {
  it("安装后保存选择集到全局层 skillInstall，重装按保存值回显", () => {
    const core = coreSkillNames(listPackageSkills())
    installSkills({ skills: core })
    expect(readSavedSelection(readSkillsInstallConfig())).toEqual(core)
    expect(readGlobalConfig().skillInstall).toEqual({ selection: { toolkit: core }, targets: ["canonical"] })
  })

  it("未选择且有产物的技能单列 installed-unselected，不计入问题；--prune 只清内容一致的条目", () => {
    const skills = listPackageSkills()
    const optional = optionalSkillNames(skills)[0]!
    const core = coreSkillNames(skills)
    installSkills({ skills: skillNames() })
    const optionalDir = join(home, ".agents", "skills", optional)
    expect(existsSync(optionalDir)).toBe(true)

    // 收窄选择并清理未选择产物
    const pruned = installSkills({ skills: core, prune: true })
    expect(pruned.targets[0]!.pruned).toContain(optional)
    expect(existsSync(optionalDir)).toBe(false)

    // 手工放回未选择产物：status 单列、不计问题
    const status = skillsStatus()
    expect(status.selection).toEqual(core)
    cpSync(join(skillsSourceDir(), optional), optionalDir, { recursive: true })
    const primary = skillsStatus().targets.find((target) => target.kind === "primary")
    expect(primary?.items.find((item) => item.name === optional)?.state).toBe("installed-unselected")
  })

  it("选择集内的技能缺失仍报 missing，未选择且无产物不占版面", () => {
    const core = coreSkillNames(listPackageSkills())
    installSkills({ skills: core })
    rmSync(join(home, ".agents", "skills", core[0]!), { recursive: true, force: true })
    const status = skillsStatus()
    const primary = status.targets.find((target) => target.kind === "primary")
    expect(primary?.items.find((item) => item.name === core[0])?.state).toBe("missing")
    const unselected = skillNames().filter((name) => !status.selection.includes(name))
    expect(primary?.items.some((item) => unselected.includes(item.name))).toBe(false)
  })
})

describe("skillInstall / projectSkill 分层配置", () => {
  it("skillInstall 只认全局层，写在项目层时告警并忽略", () => {
    writeFileSync(join(project, ".toolkitrc.json"), JSON.stringify({ skillInstall: { selection: { toolkit: ["fxri-code-encoding"] } } }), "utf8")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const config = readSkillsInstallConfig(project)
    expect(config.selection).toBeUndefined()
    expect(warn.mock.calls.some(([message]) => String(message).includes("skillInstall") && String(message).includes("全局层"))).toBe(true)
  })

  it("projectSkill 只认项目层，写在全局层时告警并忽略", () => {
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ projectSkill: { selection: ["fxri-plan-task"] } }), "utf8")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(readProjectSkillsConfig(project).selection).toBeUndefined()
    expect(warn.mock.calls.some(([message]) => String(message).includes("projectSkill") && String(message).includes("项目层"))).toBe(true)
  })

  it("写全局段只合并目标段、保留其他段，并在二次写入前备份", () => {
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ task: { dir: ".tasks" }, skillInstall: { targets: ["claude-code"] } }), "utf8")
    writeSkillsInstallConfig({ selection: { toolkit: ["fxri-plan-task"] } })
    const first = readGlobalConfig()
    expect(first.task).toEqual({ dir: ".tasks" })
    expect(first.skillInstall).toEqual({ targets: ["claude-code"], selection: { toolkit: ["fxri-plan-task"] } })

    writeSkillsInstallConfig({ targets: ["cursor"] })
    expect(existsSync(join(home, ".toolkitrc.json.bak"))).toBe(true)
    const second = readGlobalConfig()
    expect(second.skillInstall).toEqual({ targets: ["cursor"], selection: { toolkit: ["fxri-plan-task"] } })
  })

  it("写项目段落在项目层，不写全局层", () => {
    writeProjectSkillsConfig({ selection: ["fxri-plan-task"] }, project)
    expect(existsSync(join(home, ".toolkitrc.json"))).toBe(false)
    const projectConfig = JSON.parse(readFileSync(join(project, ".toolkitrc.json"), "utf8")) as { projectSkill?: unknown }
    expect(projectConfig.projectSkill).toEqual({ selection: ["fxri-plan-task"] })
    expect(readProjectSkillsConfig(project).selection).toEqual(["fxri-plan-task"])
  })
})
