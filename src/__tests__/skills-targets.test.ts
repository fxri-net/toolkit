// 目标选择：全局 agent 与项目薄壳目录的长期选择、取消保留、--prune 清理与状态单列
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import {
  buildGlobalTargetChoices,
  buildProjectTargetChoices,
  coreSkillNames,
  installProjectSkills,
  installSkills,
  listPackageSkills,
  projectSkillsStatus,
  readProjectSkillsConfig,
  readSkillsInstallConfig,
  resetSkillsConfigWarnings,
  resetSkillsRootCache,
  resolveProjectTargets,
  resolveSkillTargets,
  resolveTargetsByName,
  skillsStatus,
} from "../skills"
import { tempDir } from "./helpers"

// 临时 home（全局配置 / 状态与 agent 目录落点）
let home = ""
// 临时项目目录（项目面配置 / 状态与薄壳落点）
let project = ""

// 创建 agent 配置目录，使该 agent 在目标解析中被视为已安装
function enableAgent(configDir: string): void {
  mkdirSync(join(home, configDir), { recursive: true })
}

beforeEach(() => {
  home = tempDir("fxts-tk-skills-targets-")
  project = tempDir("fxts-tk-skills-targets-project-")
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  resetSkillsConfigWarnings()
})

afterEach(() => {
  vi.restoreAllMocks()
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  resetSkillsConfigWarnings()
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
})

describe("全局目标选择", () => {
  it("按名字解析目标：未知项与未检测 agent 分别回报", () => {
    enableAgent(".claude")
    const resolved = resolveTargetsByName(["canonical", "claude-code", "cursor", "not-exists"], [])
    expect(resolved.targets.map((target) => target.name)).toEqual(["canonical", "claude-code"])
    expect(resolved.invalid).toEqual(["not-exists"])
    expect(resolved.unavailable).toEqual(["cursor"])
  })

  it("只写选中目标并把长期选择写回 skillsInstall.targets", () => {
    enableAgent(".claude")
    const core = coreSkillNames(listPackageSkills())
    installSkills({ skills: core, targets: ["canonical", "claude-code"] })
    expect(readSkillsInstallConfig().targets).toEqual(["canonical", "claude-code"])
    expect(existsSync(join(home, ".agents", "skills", core[0]!, "SKILL.md"))).toBe(true)
    expect(existsSync(join(home, ".claude", "skills", core[0]!, "SKILL.md"))).toBe(true)
  })

  it("--no-save-agents 等价：saveTargets=false 只影响本次，不写 targets", () => {
    const core = coreSkillNames(listPackageSkills())
    installSkills({ skills: core, targets: ["canonical"], saveTargets: false })
    expect(readSkillsInstallConfig().targets).toBeUndefined()
    expect(existsSync(join(home, ".agents", "skills", core[0]!, "SKILL.md"))).toBe(true)
  })

  it("取消目标后产物保留并单列 installed-unselected；--prune 才清理", () => {
    enableAgent(".claude")
    const core = coreSkillNames(listPackageSkills())
    installSkills({ skills: core, targets: ["canonical", "claude-code"] })
    const claudeDir = join(home, ".claude", "skills")

    installSkills({ skills: core, targets: ["canonical"] })
    expect(existsSync(join(claudeDir, core[0]!))).toBe(true)
    const status = skillsStatus()
    const claude = status.targets.find((target) => target.label === "Claude Code")
    expect(claude?.selected).toBe(false)
    expect(claude?.items.every((item) => item.state === "installed-unselected")).toBe(true)

    installSkills({ skills: core, targets: ["canonical"], prune: true })
    expect(existsSync(join(claudeDir, core[0]!))).toBe(false)
  })

  it("--dir 目标始终一次性：不写入长期 targets", () => {
    const extra = join(home, "custom-skills")
    const core = coreSkillNames(listPackageSkills())
    installSkills({ skills: core, targets: ["canonical"], dirs: [extra] })
    expect(readSkillsInstallConfig().targets).toEqual(["canonical"])
    expect(existsSync(join(extra, core[0]!, "SKILL.md"))).toBe(true)
  })

  it("交互选项分组：canonical 在前、已检测 agent 可选、未检测的已保存 agent 置灰", () => {
    enableAgent(".claude")
    const all = resolveSkillTargets([])
    const choices = buildGlobalTargetChoices(all, ["canonical", "claude-code", "cursor"], [])
    expect(choices[0]?.group).toBe("主目标")
    expect(choices[0]?.label).toBe("canonical（多家 agent 共读）")
    expect(choices.find((choice) => choice.value === "claude-code")?.checked).toBe(true)
    const cursor = choices.find((choice) => choice.value === "cursor")
    // 分组改用分隔标题，标签只留显示名；原因只由禁用文案承载
    expect(cursor?.group).toBe("agent")
    expect(cursor?.label).toBe("Cursor")
    expect(String(cursor?.disabled)).toContain("未检测到该 agent")
    expect(cursor?.checked).toBe(false)
  })

  it("--dir 自定义目标：标签只留路径，分组标注一次性", () => {
    const extra = join(home, "custom-skills")
    const choices = buildGlobalTargetChoices(resolveSkillTargets([extra]), undefined, [extra])
    const custom = choices.find((choice) => choice.value === extra)
    expect(custom?.group).toBe("自定义（一次性）")
    expect(custom?.label).toBe(extra)
    expect(String(custom?.disabled)).toContain("一次性 --dir")
  })
})

describe("项目薄壳目录选择", () => {
  it("只写选中候选目录并保存 projectSkills.targets", () => {
    mkdirSync(join(project, ".trae", "skills"), { recursive: true })
    mkdirSync(join(project, ".claude", "skills"), { recursive: true })
    const core = coreSkillNames(listPackageSkills())
    installProjectSkills({ cwd: project, skills: core, targetDirs: [".trae/skills"] })
    expect(readProjectSkillsConfig(project).targets).toEqual([".trae/skills"])
    expect(existsSync(join(project, ".trae", "skills", core[0]!, "SKILL.md"))).toBe(true)
    expect(existsSync(join(project, ".claude", "skills", core[0]!, "SKILL.md"))).toBe(false)
  })

  it("取消目录后薄壳保留并单列 installed-unselected；--prune 才清理", () => {
    mkdirSync(join(project, ".trae", "skills"), { recursive: true })
    mkdirSync(join(project, ".claude", "skills"), { recursive: true })
    const core = coreSkillNames(listPackageSkills())
    installProjectSkills({ cwd: project, skills: core, targetDirs: [".trae/skills", ".claude/skills"] })
    const claudeSkillDir = join(project, ".claude", "skills", core[0]!)

    installProjectSkills({ cwd: project, skills: core, targetDirs: [".trae/skills"] })
    expect(existsSync(join(claudeSkillDir, "SKILL.md"))).toBe(true)
    const status = projectSkillsStatus(project)
    const claude = status.dirs.find((dir) => dir.dir === ".claude/skills")
    expect(claude?.selected).toBe(false)
    expect(claude?.items.every((item) => item.state === "installed-unselected")).toBe(true)

    installProjectSkills({ cwd: project, skills: core, targetDirs: [".trae/skills"], prune: true })
    expect(existsSync(claudeSkillDir)).toBe(false)
  })

  it("保存的目录不存在时告警并跳过，不凭空创建", () => {
    const core = coreSkillNames(listPackageSkills())
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    installProjectSkills({ cwd: project, skills: core, targetDirs: [".trae/skills"] })
    expect(existsSync(join(project, ".trae", "skills", core[0]!, "SKILL.md"))).toBe(false)
    expect(warn.mock.calls.some(([message]) => String(message).includes("不存在的技能目录"))).toBe(true)
  })

  it("项目目录选项：已存在目录可选，缺失的已保存目录置灰", () => {
    mkdirSync(join(project, ".trae", "skills"), { recursive: true })
    const targets = resolveProjectTargets(project)
    const choices = buildProjectTargetChoices(targets.shellDirs, [".trae/skills", ".claude/skills"], [], targets.missingDirs)
    const available = choices.find((choice) => choice.value === ".trae/skills")
    expect(available?.group).toBe("项目目录")
    expect(available?.checked).toBe(true)
    const missing = choices.find((choice) => choice.value === ".claude/skills")
    // 分组改用分隔标题，标签只留目录，原因只由禁用文案承载
    expect(missing?.group).toBe("已保存（目录不存在）")
    expect(missing?.label).toBe(".claude/skills")
    expect(String(missing?.disabled)).toContain("目录不存在")
  })

  it("项目面 --dir 自定义目录：标签只留路径，分组标注一次性", () => {
    const targets = resolveProjectTargets(project)
    const choices = buildProjectTargetChoices(targets.shellDirs, undefined, [".custom/skills"])
    const custom = choices.find((choice) => choice.value === ".custom/skills")
    expect(custom?.group).toBe("自定义（一次性）")
    expect(custom?.label).toBe(".custom/skills")
    expect(String(custom?.disabled)).toContain("一次性 --dir")
  })
})
