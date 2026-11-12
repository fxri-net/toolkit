// 技能改名：曾用名声明、选择集迁移、断链登记保留与清理、未登记旧名卸载、疑似残留提示
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import {
  findProjectRenamedArtifacts,
  findStaleArtifacts,
  installProjectSkills,
  installSkills,
  projectSkillsStatus,
  readSkillsInstallConfig,
  readSkillsState,
  removeSkills,
  resetSkillsConfigWarnings,
  resetSkillsRootCache,
  resolveLocalSource,
  resolveSavedProjectSelection,
  resolveSavedSelection,
  skillsStatus,
  type SelectionSkill,
} from "../skills"

// 临时 home（全局状态与配置落点）
let home = ""
// 临时工作目录（外部来源与产物落点）
let work = ""

// 写一份最小技能：frontmatter name / version / tier / previousNames
function writeSkill(dir: string, name: string, version = "1.0.0", previousNames: string[] = []): void {
  mkdirSync(dir, { recursive: true })
  const previous = previousNames.length > 0 ? `  previousNames: [${previousNames.map((item) => `"${item}"`).join(", ")}]\n` : ""
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: 外部测试技能 ${name}\nlicense: MIT\nmetadata:\n  version: "${version}"\n  tier: optional\n${previous}---\n\n# ${name}\n`,
    "utf8",
  )
}

// 写 skills.json 清单：entries 为 path 或 { path, name, previousNames }
function writeManifest(root: string, entries: Array<string | { path: string; name?: string; previousNames?: string[] }>): void {
  writeFileSync(join(root, "skills.json"), `${JSON.stringify({ formatVersion: 1, name: "ext", skills: entries }, null, 2)}\n`, "utf8")
}

// 建一个指向 source 的链接（先建目标再删除，模拟来源改名后的悬空链接）
function danglingLink(dest: string, source: string): void {
  mkdirSync(source, { recursive: true })
  mkdirSync(join(dest, ".."), { recursive: true })
  symlinkSync(source, dest, process.platform === "win32" ? "junction" : "dir")
  rmSync(source, { recursive: true, force: true })
}

// 取状态文件里某目标目录的条目名（同一目录可能被多个来源登记，合并去重）
function stateNames(dir: string): string[] {
  const state = readSkillsState()
  const names = new Set<string>()
  for (const source of Object.values(state?.sources ?? {})) {
    for (const target of source.targets) {
      if (target.dir !== dir) continue
      for (const entry of target.entries) names.add(entry.name)
    }
  }
  return [...names]
}

// 选择解析用的技能视图
function view(name: string, source = "toolkit", sourceKind: "builtin" | "local" = "builtin", tier: "core" | "optional" = "optional", previousNames: string[] = []): SelectionSkill {
  return { name, source, sourceKind, tier, previousNames }
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-skills-rename-home-"))
  work = mkdtempSync(join(tmpdir(), "tk-skills-rename-work-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  resetSkillsConfigWarnings()
  delete process.env.CI
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

describe("曾用名声明解析", () => {
  it("清单 previousNames 优先于 frontmatter，并随条目带到技能视图", () => {
    const root = join(work, "manifest")
    writeSkill(join(root, "skills", "alpha-new"), "alpha-new", "2.0.0")
    writeManifest(root, [{ path: "skills/alpha-new", previousNames: ["alpha-old"] }])
    const source = resolveLocalSource(root, { name: "ext" })
    expect(source.skills[0]!.previousNames).toEqual(["alpha-old"])
  })

  it("frontmatter metadata.previousNames 在清单未声明时生效", () => {
    const root = join(work, "frontmatter")
    writeSkill(join(root, "skills", "beta"), "beta", "1.0.0", ["beta-old", "beta-older"])
    const source = resolveLocalSource(root, { name: "ext" })
    expect(source.skills[0]!.previousNames).toEqual(["beta-old", "beta-older"])
  })

  it("previousNames 非字符串数组直接报错，不静默丢弃", () => {
    const root = join(work, "bad")
    writeSkill(join(root, "skills", "alpha"), "alpha")
    writeFileSync(join(root, "skills.json"), `${JSON.stringify({ formatVersion: 1, skills: [{ path: "skills/alpha", previousNames: "alpha-old" }] })}\n`, "utf8")
    expect(() => resolveLocalSource(root, { name: "ext" })).toThrow(/previousNames/)
  })

  it("来源内曾用名与现用名重复、或两条声明同一曾用名时报错", () => {
    const root = join(work, "dup")
    writeSkill(join(root, "skills", "alpha"), "alpha", "1.0.0", ["beta"])
    writeSkill(join(root, "skills", "beta"), "beta")
    expect(() => resolveLocalSource(root, { name: "ext" })).toThrow(/曾用名与现用名重复/)

    const other = join(work, "dup2")
    writeSkill(join(other, "skills", "one"), "one", "1.0.0", ["gone"])
    writeSkill(join(other, "skills", "two"), "two", "1.0.0", ["gone"])
    expect(() => resolveLocalSource(other, { name: "ext2" })).toThrow(/曾用名重复/)
  })

  it("跨来源曾用名撞上内置现用名时拒绝安装", () => {
    const root = join(work, "cross")
    writeSkill(join(root, "skills", "alpha"), "alpha", "1.0.0", ["fxri-text-encoding"])
    expect(() =>
      installSkills({ targets: ["canonical"], externalSources: [{ path: root, name: "ext", temporary: true }], skills: ["alpha"] }),
    ).toThrow(/曾用名与现用名冲突/)
  })
})

describe("已保存选择解析", () => {
  it("曾用名按别名迁移到现用名", () => {
    const result = resolveSavedSelection([view("new-name", "toolkit", "builtin", "optional", ["old-name"]), view("core-a", "toolkit", "builtin", "core")], {
      toolkit: ["old-name"],
    })
    expect(result.saved).toEqual(["new-name"])
    expect(result.migrated.toolkit).toEqual(["new-name"])
    expect(result.expired).toEqual([])
  })

  it("来源整份名单失效时按默认口径重算并告警", () => {
    const result = resolveSavedSelection([view("core-a", "toolkit", "builtin", "core"), view("opt-b", "ext", "local", "optional")], {
      toolkit: ["gone-core"],
      ext: ["gone-ext"],
    })
    expect(result.saved).toEqual(["core-a", "opt-b"])
    expect(result.expired.map((item) => [item.source, item.whole])).toEqual([
      ["toolkit", true],
      ["ext", true],
    ])
    expect(result.migrated.ext).toEqual(["opt-b"])
  })

  it("部分失效只剔除失效名，不自动补选新增技能", () => {
    const result = resolveSavedSelection([view("a"), view("b"), view("c")], { toolkit: ["a", "gone"] })
    expect(result.saved).toEqual(["a"])
    expect(result.expired).toEqual([{ source: "toolkit", missing: ["gone"], whole: false, rebased: [] }])
  })

  it("来源键缺省时按未保存处理（默认全选该来源）", () => {
    const result = resolveSavedSelection([view("a"), view("b", "ext", "local")], { toolkit: ["a"] })
    expect(result.saved).toEqual(["a", "b"])
  })

  it("项目面平铺名单迁移并默认带上外部来源技能", () => {
    const result = resolveSavedProjectSelection([view("old", "ext", "local", "optional", ["legacy"]), view("core-a", "toolkit", "builtin", "core")], ["legacy"])
    // 平铺名单存在时即完整名单：外部来源强制带上，内置未列出的技能不自动补
    expect(result.saved).toEqual(["old"])
    expect(result.expired).toEqual([])
  })
})

describe("改名后的现场与状态", () => {
  it("按曾用名清理旧链接、建立新链接并把状态迁到新名", () => {
    const root = join(work, "src")
    writeSkill(join(root, "skills", "alpha-old"), "alpha-old", "1.0.0")
    writeManifest(root, ["skills/alpha-old"])
    const sources = [{ path: root, name: "ext", temporary: false }]
    installSkills({ targets: ["canonical"], externalSources: sources })
    const canonical = join(home, ".agents", "skills")
    expect(lstatSync(join(canonical, "alpha-old")).isSymbolicLink()).toBe(true)

    // 改名：目录与 frontmatter 换新名，旧名在清单里声明为曾用名
    renameSync(join(root, "skills", "alpha-old"), join(root, "skills", "alpha-new"))
    writeSkill(join(root, "skills", "alpha-new"), "alpha-new", "2.0.0")
    writeManifest(root, [{ path: "skills/alpha-new", previousNames: ["alpha-old"] }])

    const report = installSkills({ targets: ["canonical"], externalSources: sources, skills: ["alpha-new"] })
    expect(existsSync(join(canonical, "alpha-old"))).toBe(false)
    expect(lstatSync(join(canonical, "alpha-new")).isSymbolicLink()).toBe(true)
    expect(report.targets[0]!.migrated).toEqual([{ from: "alpha-old", to: "alpha-new" }])
    expect(stateNames(canonical)).toContain("alpha-new")
    expect(stateNames(canonical)).not.toContain("alpha-old")
  })

  it("来源改名未声明曾用名时，悬空旧登记保留在状态里可被 status 报出", () => {
    const root = join(work, "src2")
    writeSkill(join(root, "skills", "beta-old"), "beta-old", "1.0.0")
    writeManifest(root, ["skills/beta-old"])
    const sources = [{ path: root, name: "ext", temporary: false }]
    installSkills({ targets: ["canonical"], externalSources: sources })
    const canonical = join(home, ".agents", "skills")

    renameSync(join(root, "skills", "beta-old"), join(root, "skills", "beta-new"))
    writeSkill(join(root, "skills", "beta-new"), "beta-new", "2.0.0")
    writeManifest(root, ["skills/beta-new"])
    installSkills({ targets: ["canonical"], externalSources: sources, skills: ["beta-new"] })

    // 断链仍属现场：登记保留，status 报为悬空
    expect(stateNames(canonical)).toContain("beta-old")
    const report = skillsStatus()
    const item = report.targets.find((target) => target.dir === canonical)?.items.find((entry) => entry.name === "beta-old")
    expect(item?.state).toBe("dangling")
  })

  it("--prune 清理来源已无此名的悬空链接，副本形态保留", () => {
    const root = join(work, "src3")
    writeSkill(join(root, "skills", "gamma-old"), "gamma-old", "1.0.0")
    writeManifest(root, ["skills/gamma-old"])
    const sources = [{ path: root, name: "ext", temporary: false }]
    installSkills({ targets: ["canonical"], externalSources: sources })
    const canonical = join(home, ".agents", "skills")

    renameSync(join(root, "skills", "gamma-old"), join(root, "skills", "gamma-new"))
    writeSkill(join(root, "skills", "gamma-new"), "gamma-new", "2.0.0")
    writeManifest(root, ["skills/gamma-new"])
    const report = installSkills({ targets: ["canonical"], externalSources: sources, skills: ["gamma-new"], prune: true })

    expect(existsSync(join(canonical, "gamma-old"))).toBe(false)
    expect(report.targets[0]!.pruned).toContain("gamma-old")
    expect(stateNames(canonical)).toEqual(["gamma-new"])
  })

  it("卸载未登记的旧名：只摘除指向技能源缓存的本工具形态链接", () => {
    const root = join(work, "src4")
    writeSkill(join(root, "skills", "keep"), "keep", "1.0.0")
    writeManifest(root, ["skills/keep"])
    installSkills({ targets: ["canonical"], externalSources: [{ path: root, name: "ext", temporary: false }] })
    const canonical = join(home, ".agents", "skills")
    const stale = join(canonical, "delta-old")
    danglingLink(stale, join(home, ".toolkit", "cache", "skill-sources", "deadbeef", "skills", "delta-old"))
    // 用户自装链接（不在技能源缓存 / 本包目录下）不应被摘除
    const foreign = join(canonical, "user-owned")
    danglingLink(foreign, join(work, "elsewhere", "user-owned"))

    const preview = removeSkills({ skills: ["delta-old", "user-owned"], dryRun: true })
    expect(preview.targets.flatMap((target) => target.removed)).toContain("delta-old")
    expect(preview.targets.flatMap((target) => target.removed)).not.toContain("user-owned")

    removeSkills({ skills: ["delta-old"] })
    expect(existsSync(stale)).toBe(false)
    expect(lstatSync(foreign).isSymbolicLink()).toBe(true)
  })

  it("疑似残留按指向技能源缓存的链接单列，未登记也不误报普通技能", () => {
    const root = join(work, "src5")
    writeSkill(join(root, "skills", "keep"), "keep", "1.0.0")
    writeManifest(root, ["skills/keep"])
    installSkills({ targets: ["canonical"], externalSources: [{ path: root, name: "ext", temporary: false }] })
    const canonical = join(home, ".agents", "skills")
    danglingLink(join(canonical, "epsilon-old"), join(home, ".toolkit", "cache", "skill-sources", "deadbeef", "skills", "epsilon-old"))

    const stale = findStaleArtifacts(skillsStatus())
    expect(stale).toEqual([{ name: "epsilon-old", dir: canonical }])
  })

  it("项目面改名后旧副本仍报漂移，并提供旧名到新名的指引", () => {
    const root = join(work, "proj")
    mkdirSync(root, { recursive: true })
    const src = join(work, "srcp")
    writeSkill(join(src, "skills", "proj-old"), "proj-old", "1.0.0")
    writeManifest(src, ["skills/proj-old"])
    const sources = [{ path: src, name: "ext", temporary: false }]
    installProjectSkills({ cwd: root, targetDirs: [], externalSources: sources })

    renameSync(join(src, "skills", "proj-old"), join(src, "skills", "proj-new"))
    writeSkill(join(src, "skills", "proj-new"), "proj-new", "2.0.0")
    writeManifest(src, [{ path: "skills/proj-new", previousNames: ["proj-old"] }])
    installProjectSkills({ cwd: root, targetDirs: [], externalSources: sources, skills: ["proj-new"] })

    const report = projectSkillsStatus(root)
    const sourceDir = report.dirs.find((dir) => dir.kind === "source")!
    // 旧副本仍为漂移（不自动删），但能通过曾用名视图给出「已改名为 X」
    expect(sourceDir.items.find((item) => item.name === "proj-old")?.state).toBe("drift")
    expect(findProjectRenamedArtifacts(report)["proj-old"]).toBe("proj-new")
  })

  it("旧名副本无法自动清理时按失败条目回报，不冒充同名冲突", () => {
    const root = join(work, "src7")
    writeSkill(join(root, "skills", "copy-old"), "copy-old", "1.0.0")
    writeManifest(root, ["skills/copy-old"])
    const sources = [{ path: root, name: "ext", temporary: false }]
    // 以副本形态安装：旧产物是实体目录，改名后无从校验、不能自动删
    installSkills({ targets: ["canonical"], externalSources: sources, copy: true })
    const canonical = join(home, ".agents", "skills")
    renameSync(join(root, "skills", "copy-old"), join(root, "skills", "copy-new"))
    writeSkill(join(root, "skills", "copy-new"), "copy-new", "2.0.0")
    writeManifest(root, [{ path: "skills/copy-new", previousNames: ["copy-old"] }])
    const report = installSkills({ targets: ["canonical"], externalSources: sources, skills: ["copy-new"] })
    expect(existsSync(join(canonical, "copy-old"))).toBe(true)
    expect(report.targets[0]!.failed.some((item) => item.name === "copy-old" && item.reason.includes("人工清理"))).toBe(true)
    expect(report.targets[0]!.conflicts).not.toContain("copy-old")
  })

  it("本次零装不把来源选择集写成空数组", () => {
    const root = join(work, "src6")
    writeSkill(join(root, "skills", "alpha"), "alpha", "1.0.0")
    writeManifest(root, ["skills/alpha"])
    installSkills({
      targets: ["canonical"],
      skills: ["fxri-text-encoding"],
      externalSources: [{ path: root, name: "ext", temporary: false }],
    })
    const selection = readSkillsInstallConfig().selection
    expect(selection?.ext).toBeUndefined()
    expect(selection?.toolkit).toEqual(["fxri-text-encoding"])
  })
})
