// 外部技能来源：三种来源形态、路径越界、同名冲突、临时 / 永久落点、按来源卸载与操作锁
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import {
  acquireSkillsLock,
  installSkills,
  listPackageSkills,
  readSkillsInstallConfig,
  readSkillsState,
  removeSkills,
  resolveLocalSource,
  resetSkillsConfigWarnings,
  resetSkillsRootCache,
  skillsLockFile,
  skillsStatus,
  writeSkillsInstallConfig,
} from "../skills"

// 临时 home（状态 / 配置落点）
let home = ""
// 临时工作目录（外部来源与项目目录落点）
let work = ""

// 写一份最小技能：frontmatter name / version / tier
function writeSkill(dir: string, name: string, version = "1.0.0", tier: "core" | "optional" = "optional"): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: 外部测试技能 ${name}\nlicense: MIT\nmetadata:\n  version: "${version}"\n  tier: ${tier}\n---\n\n# ${name}\n\n> 本技能版本 ${version}（测试）\n`,
    "utf8",
  )
}

// 多技能来源：<root>/skills/<name>/SKILL.md
function multiSource(root: string, name = "ext"): string {
  writeSkill(join(root, "skills", "ext-alpha"), "ext-alpha", "1.2.3")
  writeSkill(join(root, "skills", "ext-beta"), "ext-beta", "2.0.0")
  mkdirSync(root, { recursive: true })
  return name
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-skills-source-home-"))
  work = mkdtempSync(join(tmpdir(), "tk-skills-source-work-"))
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
  rmSync(work, { recursive: true, force: true })
})

describe("外部来源解析", () => {
  it("支持根 SKILL.md 单技能源", () => {
    const root = join(work, "solo")
    writeSkill(root, "solo-skill", "1.0.0")
    const source = resolveLocalSource(root, { name: "solo" })
    expect(source.kind).toBe("local")
    expect(source.temporary).toBe(true)
    expect(source.skills.map((skill) => skill.name)).toEqual(["solo-skill"])
  })

  it("支持 skills/*/SKILL.md 多技能源", () => {
    const root = join(work, "multi")
    multiSource(root)
    const source = resolveLocalSource(root, { name: "ext" })
    expect(source.skills.map((skill) => skill.name)).toEqual(["ext-alpha", "ext-beta"])
    expect(source.skills.map((skill) => skill.version)).toEqual(["1.2.3", "2.0.0"])
  })

  it("支持 skills.json 清单，并按清单名覆盖目录名", () => {
    const root = join(work, "manifest")
    writeSkill(join(root, "custom", "alpha-dir"), "alpha-dir", "3.0.0")
    writeSkill(join(root, "custom", "beta-dir"), "beta-dir", "3.1.0")
    writeFileSync(
      join(root, "skills.json"),
      `${JSON.stringify({ formatVersion: 1, name: "play", version: "9.9.9", skills: [{ path: "custom/alpha-dir", name: "alpha" }, { path: "custom/beta-dir" }] }, null, 2)}\n`,
      "utf8",
    )
    const source = resolveLocalSource(root)
    expect(source.name).toBe("play")
    expect(source.version).toBe("9.9.9")
    expect(source.skills.map((skill) => skill.name)).toEqual(["alpha", "beta-dir"])
  })

  it("manifest formatVersion 非 1 直接报错，不静默回退目录扫描", () => {
    const root = join(work, "bad-version")
    writeSkill(join(root, "skills", "a"), "a")
    writeFileSync(join(root, "skills.json"), `${JSON.stringify({ formatVersion: 2, skills: ["skills/a"] })}\n`, "utf8")
    expect(() => resolveLocalSource(root)).toThrow(/formatVersion/)
  })

  it("manifest 路径越出来源根时拒绝", () => {
    const root = join(work, "escape")
    mkdirSync(root, { recursive: true })
    writeSkill(join(work, "outside"), "outside")
    writeFileSync(join(root, "skills.json"), `${JSON.stringify({ formatVersion: 1, skills: ["../outside"] })}\n`, "utf8")
    expect(() => resolveLocalSource(root)).toThrow(/越出来源根/)
  })

  it("同一来源内重名或跨来源同名都报错", () => {
    const root = join(work, "dup")
    writeSkill(join(root, "skills", "a"), "same")
    writeSkill(join(root, "skills", "b"), "same")
    expect(() => resolveLocalSource(root)).toThrow(/技能名重复/)

    // 跨来源同名：外部来源复制一个与内置技能同名的目录，安装时直接报错
    const source = join(work, "conflict")
    multiSource(source)
    writeSkill(join(source, "skills", listPackageSkills()[0]!.name), listPackageSkills()[0]!.name)
    expect(() => installSkills({ targets: ["canonical"], externalSources: [{ path: source, name: "conflict", temporary: true }] })).toThrow(/技能名冲突/)
  })
})

describe("外部来源安装与卸载", () => {
  it("临时来源以副本写入，状态按来源分组且 status 单列来源", () => {
    const root = join(work, "temp")
    multiSource(root)
    installSkills({ skills: ["ext-alpha"], targets: ["canonical"], externalSources: [{ path: root, name: "ext", temporary: true }] })
    const dest = join(home, ".agents", "skills", "ext-alpha")
    expect(existsSync(join(dest, "SKILL.md"))).toBe(true)
    expect(lstatSync(dest).isSymbolicLink()).toBe(false)
    const state = readSkillsState()
    expect(state?.sources.ext?.temporary).toBe(true)
    expect(state?.sources.ext?.targets[0]?.entries).toContainEqual({ name: "ext-alpha", version: "1.2.3", mode: "copy" })

    const status = skillsStatus()
    expect(status.sources.find((source) => source.name === "ext")?.temporary).toBe(true)
    expect(status.targets.find((target) => target.kind === "primary")?.items.find((item) => item.name === "ext-alpha")?.source).toBe("ext")
  })

  it("永久来源默认软链到技能真源目录", () => {
    const root = join(work, "perm")
    multiSource(root)
    installSkills({ skills: ["ext-beta"], targets: ["canonical"], externalSources: [{ path: root, name: "play", temporary: false }] })
    const dest = join(home, ".agents", "skills", "ext-beta")
    expect(lstatSync(dest).isSymbolicLink()).toBe(true)
    const state = readSkillsState()
    expect(state?.sources.play?.temporary).toBe(false)
    expect(state?.sources.play?.targets[0]?.entries[0]?.mode).toBe("link")
  })

  it("按来源卸载只清该来源的产物与选择，不影响内置源", () => {
    const root = join(work, "remove")
    multiSource(root)
    const builtin = listPackageSkills()[0]!.name
    installSkills({ skills: [builtin, "ext-alpha"], targets: ["canonical"], externalSources: [{ path: root, name: "ext", temporary: true }] })
    expect(existsSync(join(home, ".agents", "skills", builtin))).toBe(true)
    expect(existsSync(join(home, ".agents", "skills", "ext-alpha"))).toBe(true)

    const report = removeSkills({ source: "ext" })
    expect(report.targets.some((target) => target.removed.includes("ext-alpha"))).toBe(true)
    expect(existsSync(join(home, ".agents", "skills", "ext-alpha"))).toBe(false)
    expect(existsSync(join(home, ".agents", "skills", builtin))).toBe(true)
    expect(readSkillsState()?.sources.ext).toBeUndefined()
    expect(readSkillsInstallConfig().selection?.ext).toBeUndefined()
  })

  it("来源登记写入全局层 sources", () => {
    writeSkillsInstallConfig({ sources: { play: { root: join(work, "play") } } })
    expect(readSkillsInstallConfig().sources).toEqual({ play: { root: join(work, "play") } })
  })
})

describe("技能操作锁", () => {
  it("持锁期间再次获取报错，释放后可重新获取", () => {
    const file = skillsLockFile(home)
    const release = acquireSkillsLock(file)
    expect(() => acquireSkillsLock(file)).toThrow(/锁被占用/)
    release()
    const second = acquireSkillsLock(file)
    second()
  })

  it("超过 5 分钟的陈旧锁可接管", () => {
    const file = skillsLockFile(home)
    mkdirSync(join(home, ".agents"), { recursive: true })
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    writeFileSync(file, `${JSON.stringify({ pid: 999999, host: "old-host", startedAt: old }, null, 2)}\n`, "utf8")
    const release = acquireSkillsLock(file)
    release()
    expect(existsSync(file)).toBe(false)
  })
})
