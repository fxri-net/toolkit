// skills 包内分发：目标解析、安装（软链 / 副本 / 幂等 / 冲突）、现场状态、卸载与链接自愈
// 用例统一把 home 注入独立临时目录，产物只落在临时目录，绝不触碰真实用户全局技能目录
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import {
  AGENT_SKILL_DIRS,
  autoLinkSkills,
  installSkills,
  listPackageSkills,
  readSkillsState,
  removeSkills,
  resetSkillsRootCache,
  resolveSkillTargets,
  skillsPackageDir,
  skillsSourceDir,
  skillsStateFile,
  skillsStatus,
} from "../skills"

// 软链类型：Windows 必须用 junction（免管理员、免开发者模式）
const LINK_TYPE = process.platform === "win32" ? "junction" : "dir"

// 临时 home（本文件所有用例的注入点）
let home = ""
// 用例前的 CI 环境值：autoLink 在 CI 下跳过，需临时清空避免宿主环境影响断言
let savedCI: string | undefined

// 主目标目录 ~/.agents/skills
function primaryDir(): string {
  return join(home, ".agents", "skills")
}

// 内置快照表里某个 agent 的技能目录（相对 home 展开为绝对路径）
function agentDir(name: string): string {
  const entry = AGENT_SKILL_DIRS.find((a) => a.name === name)
  if (!entry) throw new Error(`内置快照表缺少 agent：${name}`)
  return join(home, entry.dir)
}

// 手工写状态文件：模拟上一次 install 的留痕，供 status / remove / autoLink 用例构造现场
function writeState(targets: Array<{ dir: string; links?: string[]; copies?: string[] }>): void {
  mkdirSync(join(home, ".agents"), { recursive: true })
  const now = new Date().toISOString()
  const data = { version: 1, updatedAt: now, targets: targets.map((t) => ({ dir: t.dir, updatedAt: now, links: t.links ?? [], copies: t.copies ?? [] })) }
  writeFileSync(skillsStateFile(), `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

// 判定 dest 是否为指向 source 的软链（junction 的 readlink 带尾分隔符，需剥掉再比较）
function isLinkTo(dest: string, source: string): boolean {
  if (!lstatSync(dest).isSymbolicLink()) return false
  const target = readlinkSync(dest).replace(/[\\/]+$/, "")
  return target === source.replace(/[\\/]+$/, "")
}

// 取某目标目录下单个技能的现场状态
function stateOf(dir: string, name: string): string | undefined {
  const target = skillsStatus().targets.find((t) => t.dir === dir)
  return target?.items.find((i) => i.name === name)?.state
}

// 取安装报告里某类目标的结果
function targetOf(report: ReturnType<typeof installSkills>, kind: "primary" | "agent" | "custom") {
  const found = report.targets.find((t) => t.kind === kind)
  if (!found) throw new Error(`安装报告缺少目标类型：${kind}`)
  return found
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-skills-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  savedCI = process.env.CI
  delete process.env.CI
})

afterEach(() => {
  if (savedCI === undefined) delete process.env.CI
  else process.env.CI = savedCI
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  rmSync(home, { recursive: true, force: true })
})

describe("包根与技能真源定位", () => {
  it("包根指向本仓库，真源为包内 skills/", () => {
    const root = skillsPackageDir()
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name).toBe("@fxri/toolkit")
    expect(skillsSourceDir()).toBe(join(root, "skills"))
  })

  it("列出包内技能且按名称排序（只认含 SKILL.md 的目录）", () => {
    const names = listPackageSkills().map((s) => s.name)
    expect(names).toContain("fxri-plan-to-task")
    expect(names).toContain("fxri-session-recap")
    expect(names).toContain("fxri-release-changelog")
    expect(names).toEqual([...names].sort())
    for (const skill of listPackageSkills()) {
      expect(existsSync(join(skill.dir, "SKILL.md"))).toBe(true)
    }
  })
})

describe("resolveSkillTargets 三层目标解析", () => {
  it("主目标恒可用且排在最前，与表内同路径 agent 去重", () => {
    const targets = resolveSkillTargets()
    expect(targets[0].kind).toBe("primary")
    expect(targets[0].dir).toBe(primaryDir())
    expect(targets[0].available).toBe(true)
    expect(targets.filter((t) => t.dir === primaryDir())).toHaveLength(1)
    expect(new Set(targets.map((t) => t.dir)).size).toBe(targets.length)
  })

  it("agent 未安装时不可用（不凭空造目录）", () => {
    expect(resolveSkillTargets().find((t) => t.dir === agentDir("claude-code"))?.available).toBe(false)
  })

  it("agent 配置目录存在即视为已安装", () => {
    mkdirSync(join(home, ".claude"), { recursive: true })
    expect(resolveSkillTargets().find((t) => t.dir === agentDir("claude-code"))?.available).toBe(true)
  })

  it("detect 路径命中即视为已安装（如 .codex）", () => {
    mkdirSync(join(home, ".codex"), { recursive: true })
    expect(resolveSkillTargets().find((t) => t.dir === agentDir("codex"))?.available).toBe(true)
  })

  it("--dir 作为 custom 目标恒可用并排在末尾，与内置路径重复时去重", () => {
    const extra = join(home, "extra-skills")
    const targets = resolveSkillTargets([extra, primaryDir()])
    expect(targets[targets.length - 1].dir).toBe(extra)
    expect(targets[targets.length - 1].kind).toBe("custom")
    expect(targets[targets.length - 1].available).toBe(true)
    expect(targets.filter((t) => t.kind === "custom")).toHaveLength(1)
  })
})

describe("installSkills 安装", () => {
  it("--dry-run 只预演：报告将新建，但不落任何文件", () => {
    const report = installSkills({ dryRun: true })
    const primary = targetOf(report, "primary")
    expect(primary.created).toEqual(report.skills)
    expect(primary.links).toEqual(report.skills)
    expect(existsSync(primaryDir())).toBe(false)
    expect(existsSync(skillsStateFile())).toBe(false)
  })

  it("默认软链到真源并写入状态文件", () => {
    const report = installSkills()
    const primary = targetOf(report, "primary")
    expect(primary.created).toEqual(report.skills)
    for (const name of report.skills) {
      expect(isLinkTo(join(primaryDir(), name), join(skillsSourceDir(), name))).toBe(true)
    }
    const state = readSkillsState()
    expect(state?.targets[0].dir).toBe(primaryDir())
    expect(state?.targets[0].links).toEqual(report.skills)
    expect(state?.targets[0].copies).toEqual([])
  })

  it("重复安装幂等：已就绪的链接整体跳过", () => {
    installSkills()
    const second = installSkills()
    const primary = targetOf(second, "primary")
    expect(primary.skipped).toEqual(second.skills)
    expect(primary.created).toHaveLength(0)
    expect(primary.updated).toHaveLength(0)
  })

  it("--copy 写副本，重复安装内容一致时跳过", () => {
    const report = installSkills({ copy: true })
    const primary = targetOf(report, "primary")
    expect(primary.copies).toEqual(report.skills)
    expect(lstatSync(join(primaryDir(), report.skills[0])).isSymbolicLink()).toBe(false)
    const second = installSkills({ copy: true })
    expect(targetOf(second, "primary").skipped).toEqual(second.skills)
  })

  it("副本内容漂移后重跑安装会重建为真源内容，预演只记更新不落盘", () => {
    const report = installSkills({ copy: true })
    const name = report.skills[0]
    const dest = join(primaryDir(), name, "SKILL.md")
    writeFileSync(dest, "drifted", "utf8")
    const preview = installSkills({ copy: true, dryRun: true })
    expect(targetOf(preview, "primary").updated).toContain(name)
    expect(readFileSync(dest, "utf8")).toBe("drifted")
    const again = installSkills({ copy: true })
    expect(targetOf(again, "primary").updated).toContain(name)
    expect(readFileSync(dest, "utf8")).toBe(readFileSync(join(skillsSourceDir(), name, "SKILL.md"), "utf8"))
  })

  it("同名普通文件视为冲突默认跳过，status 报冲突", () => {
    const name = listPackageSkills()[0].name
    mkdirSync(primaryDir(), { recursive: true })
    writeFileSync(join(primaryDir(), name), "not a skill", "utf8")
    expect(targetOf(installSkills(), "primary").conflicts).toContain(name)
    expect(readFileSync(join(primaryDir(), name), "utf8")).toBe("not a skill")
    expect(stateOf(primaryDir(), name)).toBe("conflict")
  })

  it("同名用户自装目录默认不覆盖，--force 才重建", () => {
    const name = listPackageSkills()[0].name
    const dest = join(primaryDir(), name)
    mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, "SKILL.md"), "user made", "utf8")
    expect(targetOf(installSkills(), "primary").conflicts).toContain(name)
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe("user made")
    const forced = installSkills({ force: true })
    expect(targetOf(forced, "primary").updated).toContain(name)
    expect(isLinkTo(dest, join(skillsSourceDir(), name))).toBe(true)
  })

  it("指向别处的链接在 status 报错并在下次安装重建", () => {
    const name = listPackageSkills()[0].name
    mkdirSync(primaryDir(), { recursive: true })
    const other = join(home, "other")
    mkdirSync(other, { recursive: true })
    symlinkSync(other, join(primaryDir(), name), LINK_TYPE)
    expect(stateOf(primaryDir(), name)).toBe("wrong")
    expect(targetOf(installSkills(), "primary").updated).toContain(name)
    expect(isLinkTo(join(primaryDir(), name), join(skillsSourceDir(), name))).toBe(true)
  })

  it("悬空链接在 status 报悬空并在下次安装重建", () => {
    const ghost = "fxri-ghost"
    mkdirSync(primaryDir(), { recursive: true })
    // 真源缺失的链接：指向包内不存在的技能目录，且由状态文件记载使其纳入比对
    symlinkSync(join(skillsSourceDir(), ghost), join(primaryDir(), ghost), LINK_TYPE)
    writeState([{ dir: primaryDir(), links: [ghost] }])
    expect(stateOf(primaryDir(), ghost)).toBe("dangling")
    const report = installSkills()
    expect(report.skills).not.toContain(ghost)
  })

  it("agent 配置目录存在时其技能目录一并安装，未安装的 agent 只报告不造目录", () => {
    mkdirSync(join(home, ".claude"), { recursive: true })
    const report = installSkills()
    const claude = report.targets.find((t) => t.dir === agentDir("claude-code"))
    expect(claude?.created).toEqual(report.skills)
    expect(existsSync(join(agentDir("claude-code"), report.skills[0], "SKILL.md"))).toBe(true)
    expect(report.skippedTargets.some((t) => t.dir === agentDir("codex"))).toBe(true)
    expect(existsSync(join(home, ".codex"))).toBe(false)
  })

  it("--dir 兜底安装到未收录的目录，且后续安装不丢历史记录", () => {
    const extra = join(home, "custom-skills")
    const report = installSkills({ dirs: [extra] })
    expect(targetOf(report, "custom").created).toEqual(report.skills)
    expect(existsSync(join(extra, report.skills[0], "SKILL.md"))).toBe(true)
    installSkills()
    expect(readSkillsState()?.targets.some((t) => t.dir === extra)).toBe(true)
    removeSkills()
    expect(existsSync(join(extra, report.skills[0]))).toBe(false)
  })
})

describe("skillsStatus 现场状态", () => {
  it("尚未安装时主目标标为未创建、逐项缺失", () => {
    const status = skillsStatus()
    const primary = status.targets.find((t) => t.kind === "primary")
    expect(primary?.dirExists).toBe(false)
    expect(primary?.recorded).toBe(false)
    expect(primary?.items.every((i) => i.state === "missing")).toBe(true)
    expect(status.stateExists).toBe(false)
  })

  it("安装后逐项报软链正常，副本形态报副本已同步", () => {
    installSkills()
    expect(skillsStatus().targets.find((t) => t.kind === "primary")?.items.every((i) => i.state === "link")).toBe(true)
    rmSync(primaryDir(), { recursive: true, force: true })
    installSkills({ copy: true })
    expect(skillsStatus().targets.find((t) => t.kind === "primary")?.items.every((i) => i.state === "copy")).toBe(true)
  })

  it("副本被改动报漂移，产物被删除报缺失", () => {
    const report = installSkills({ copy: true })
    const [drifted, gone] = report.skills
    writeFileSync(join(primaryDir(), drifted, "SKILL.md"), "changed", "utf8")
    rmSync(join(primaryDir(), gone), { recursive: true, force: true })
    expect(stateOf(primaryDir(), drifted)).toBe("copy-drift")
    expect(stateOf(primaryDir(), gone)).toBe("missing")
  })

  it("未安装的 agent 汇总进 pendingAgents，供 --dir 兜底提示", () => {
    const status = skillsStatus()
    expect(status.pendingAgents.some((a) => a.dir === agentDir("claude-code"))).toBe(true)
    expect(status.targets.some((t) => t.dir === agentDir("claude-code"))).toBe(false)
  })

  it("状态文件损坏时按未安装处理，不影响技能比对", () => {
    mkdirSync(join(home, ".agents"), { recursive: true })
    writeFileSync(skillsStateFile(), "{ 非法 json", "utf8")
    expect(readSkillsState()).toBeNull()
    const status = skillsStatus()
    expect(status.stateExists).toBe(false)
    expect(status.targets.find((t) => t.kind === "primary")?.items.every((i) => i.state === "missing")).toBe(true)
    writeFileSync(skillsStateFile(), JSON.stringify({ version: 1, updatedAt: "", targets: "broken" }), "utf8")
    expect(readSkillsState()).toBeNull()
  })
})

describe("removeSkills 精确清理", () => {
  it("无状态文件时为空操作", () => {
    const report = removeSkills()
    expect(report.stateExists).toBe(false)
    expect(report.targets).toHaveLength(0)
    expect(report.stateRemoved).toBe(false)
  })

  it("预演只报告不删除，正式卸载清空产物并删除状态文件", () => {
    const installed = installSkills({ copy: true })
    const preview = removeSkills({ dryRun: true })
    expect(preview.targets[0].removed).toEqual(installed.skills)
    expect(existsSync(join(primaryDir(), installed.skills[0], "SKILL.md"))).toBe(true)
    expect(existsSync(skillsStateFile())).toBe(true)
    const done = removeSkills()
    expect(done.stateRemoved).toBe(true)
    expect(existsSync(skillsStateFile())).toBe(false)
    expect(existsSync(join(primaryDir(), installed.skills[0]))).toBe(false)
  })

  it("软链产物只摘链，不触碰包内真源", () => {
    const installed = installSkills()
    const name = installed.skills[0]
    expect(lstatSync(join(primaryDir(), name)).isSymbolicLink()).toBe(true)
    removeSkills()
    expect(existsSync(join(skillsSourceDir(), name, "SKILL.md"))).toBe(true)
  })

  it("现场被改动（指向别处 / 内容漂移 / 变成普通文件）时跳过并保留状态文件", () => {
    const installed = installSkills({ copy: true })
    const [wrongName, driftName, fileLike] = installed.skills
    rmSync(join(primaryDir(), wrongName), { recursive: true, force: true })
    const other = join(home, "other")
    mkdirSync(other, { recursive: true })
    symlinkSync(other, join(primaryDir(), wrongName), LINK_TYPE)
    writeFileSync(join(primaryDir(), driftName, "SKILL.md"), "drifted", "utf8")
    rmSync(join(primaryDir(), fileLike), { recursive: true, force: true })
    writeFileSync(join(primaryDir(), fileLike), "plain file", "utf8")
    const report = removeSkills()
    expect(report.targets[0].skippedForeign.sort()).toEqual([wrongName, driftName, fileLike].sort())
    expect(report.stateRemoved).toBe(false)
    expect(existsSync(skillsStateFile())).toBe(true)
    expect(existsSync(join(primaryDir(), driftName))).toBe(true)
  })

  it("产物已被手动删除时计入缺失，仍按清理结果处理状态文件", () => {
    const installed = installSkills({ copy: true })
    const name = installed.skills[0]
    rmSync(join(primaryDir(), name), { recursive: true, force: true })
    const report = removeSkills()
    expect(report.targets[0].missing).toContain(name)
    expect(report.stateRemoved).toBe(true)
  })
})

describe("autoLinkSkills 链接自愈", () => {
  it("无状态文件时不做任何事", () => {
    expect(autoLinkSkills()).toBe(0)
  })

  it("链接已正常时计数为 0", () => {
    installSkills()
    expect(autoLinkSkills()).toBe(0)
  })

  it("补建被删除的链接并重建指向错误的链接", () => {
    const installed = installSkills()
    const [gone, wrongName] = installed.skills
    rmSync(join(primaryDir(), gone), { recursive: true, force: true })
    rmSync(join(primaryDir(), wrongName), { recursive: true, force: true })
    const other = join(home, "other")
    mkdirSync(other, { recursive: true })
    symlinkSync(other, join(primaryDir(), wrongName), LINK_TYPE)
    expect(autoLinkSkills()).toBe(2)
    expect(isLinkTo(join(primaryDir(), gone), join(skillsSourceDir(), gone))).toBe(true)
    expect(isLinkTo(join(primaryDir(), wrongName), join(skillsSourceDir(), wrongName))).toBe(true)
  })

  it("重建时顺带剔除已不在包内的技能记录", () => {
    mkdirSync(primaryDir(), { recursive: true })
    writeState([{ dir: primaryDir(), links: ["fxri-not-exists", "fxri-plan-to-task"] }])
    expect(autoLinkSkills()).toBe(1)
    expect(readSkillsState()?.targets[0].links).toEqual(["fxri-plan-to-task"])
  })

  it("状态记录的目标目录已不存在时原样保留记录", () => {
    const ghostDir = join(home, "ghost-target")
    writeState([{ dir: ghostDir, links: ["fxri-plan-to-task"] }])
    expect(autoLinkSkills()).toBe(0)
    expect(readSkillsState()?.targets[0].dir).toBe(ghostDir)
  })

  it("配置 skills.autoLink=false 时关闭自愈", () => {
    mkdirSync(primaryDir(), { recursive: true })
    writeState([{ dir: primaryDir(), links: ["fxri-plan-to-task"] }])
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ skills: { autoLink: false } }), "utf8")
    resetToolkitConfigCache()
    expect(autoLinkSkills()).toBe(0)
    expect(existsSync(join(primaryDir(), "fxri-plan-to-task"))).toBe(false)
  })

  it("CI 环境下跳过自愈", () => {
    mkdirSync(primaryDir(), { recursive: true })
    writeState([{ dir: primaryDir(), links: ["fxri-plan-to-task"] }])
    process.env.CI = "1"
    expect(autoLinkSkills()).toBe(0)
    expect(existsSync(join(primaryDir(), "fxri-plan-to-task"))).toBe(false)
  })
})
