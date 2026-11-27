// 作用域配置加载：三层就近覆盖、来源文件与非法值告警
import { mkdirSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { findProjectRoot, resolveScope, resetScopeCache } from "../scope"
import { tempDir } from "./helpers"

let home = ""
let project = ""
let other = ""

// 写入全局层配置（目录级作用域示例）
function writeGlobal(config: unknown): void {
  writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify(config))
}

beforeEach(() => {
  home = tempDir("fxts-tk-scope-home-")
  project = join(home, "work", "repo")
  other = join(home, "personal")
  mkdirSync(project, { recursive: true })
  mkdirSync(other, { recursive: true })
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

describe("resolveScope", () => {
  it("未配置时全域生效", () => {
    const report = resolveScope(project)
    expect(report.decision.active).toBe(true)
    expect(report.decision.mode).toBe("all")
    expect(report.decision.sourceFile).toBeNull()
  })

  it("全局白名单按目录生效，项目层可整体覆盖", () => {
    const pattern = `${home.replace(/\\/g, "/")}/work/**`
    writeGlobal({ activation: { mode: "allowlist", include: [pattern] } })
    expect(resolveScope(project).decision.active).toBe(true)
    expect(resolveScope(other).decision.active).toBe(false)

    writeFileSync(join(project, ".toolkitrc.json"), JSON.stringify({ activation: { mode: "all" } }))
    const overridden = resolveScope(project)
    expect(overridden.decision.active).toBe(true)
    expect(overridden.decision.sourceFile?.endsWith(".toolkitrc.json")).toBe(true)
  })

  it("marker 作为附加启用条件，只认 cwd 与 git 根", () => {
    writeGlobal({ activation: { mode: "all", markers: { include: [".toolkit-scope"] } } })
    expect(resolveScope(project).decision.active).toBe(false)
    writeFileSync(join(project, ".toolkit-scope"), "")
    expect(resolveScope(project).decision.active).toBe(true)
  })

  it("非法 mode 告警并回落 all", () => {
    writeGlobal({ activation: { mode: "sometimes" } })
    const report = resolveScope(project)
    expect(report.decision.mode).toBe("all")
    expect(report.warnings.join("\n")).toContain("mode 非法")
  })

  it("判定基准取项目根：子目录按项目根命中并给出迁移提示", () => {
    const subdir = join(project, "src")
    mkdirSync(subdir, { recursive: true })
    writeFileSync(join(project, ".toolkitrc.json"), "{}")
    writeGlobal({ activation: { mode: "allowlist", include: [project.replace(/\\/g, "/")] } })
    const report = resolveScope(subdir)
    expect(report.decision.active).toBe(true)
    expect(report.decision.baseDir.endsWith("repo")).toBe(true)
    expect(report.migrationHint ?? "").toContain("判定基准已改为项目根")
  })

  it("展示路径保留原始大小写，marker 在大写目录下仍可识别", () => {
    const upper = join(home, "Work", "Repo")
    mkdirSync(upper, { recursive: true })
    writeGlobal({ activation: { mode: "all", markers: { include: [".toolkit-scope"] } } })
    writeFileSync(join(upper, ".toolkit-scope"), "")
    const report = resolveScope(upper)
    // 展示值与文件系统判断都用原始大小写，大小写折叠只发生在匹配函数内部
    expect(report.context.cwd.endsWith(join("Work", "Repo"))).toBe(true)
    expect(report.decision.baseDir.endsWith(join("Work", "Repo"))).toBe(true)
    expect(report.decision.active).toBe(true)
  })

  it("旧规则按真实路径写入时给出迁移提示，不改变判定", () => {
    const realPath = join(home, "real-project")
    mkdirSync(join(realPath, ".git"), { recursive: true })
    const link = join(home, "link-project")
    try {
      // Windows 用 junction（无需管理员权限），其余平台用目录软链
      symlinkSync(realPath, link, process.platform === "win32" ? "junction" : "dir")
    } catch {
      // 无符号链接权限时跳过该用例
      return
    }
    // 规则须按真实形态书写：临时目录本身可能是软链（macOS /var）或短名（Windows 8.3）
    const realKey = realpathSync.native(realPath).replace(/\\/g, "/")
    writeGlobal({ activation: { mode: "allowlist", include: [realKey] } })
    const report = resolveScope(link)
    // 字符串口径：按真实路径写的规则不再命中链接路径，结论不生效
    expect(report.decision.active).toBe(false)
    expect(report.migrationHint ?? "").toContain("真实路径")

    // 规则按链接路径书写时本就命中，不应触发迁移提示
    writeGlobal({ activation: { mode: "allowlist", include: [link.replace(/\\/g, "/")] } })
    resetToolkitConfigCache()
    resetScopeCache()
    const matched = resolveScope(link)
    expect(matched.decision.active).toBe(true)
    expect(matched.migrationHint).toBeNull()

    // 只有技能级规则按真实路径书写时同样给出提示
    writeGlobal({
      activation: {
        mode: "allowlist",
        include: [link.replace(/\\/g, "/")],
        skills: { "fxri-plan-review": { exclude: [realKey] } },
      },
    })
    resetToolkitConfigCache()
    const skillHint = resolveScope(link, "fxri-plan-review")
    expect(skillHint.migrationHint ?? "").toContain("真实路径")
  })

  it("配置同长度改写且时间戳未变时仍按新内容判定", () => {
    // 快照指纹只认内容：mtime / size 相同也必须识别改写，否则会复用旧判定
    const first = join(home, "proj-a")
    const second = join(home, "proj-b")
    mkdirSync(first, { recursive: true })
    mkdirSync(second, { recursive: true })
    const fixed = new Date("2026-01-01T00:00:00Z")
    const configFile = join(home, ".toolkitrc.json")
    writeGlobal({ activation: { mode: "allowlist", include: [first.replace(/\\/g, "/")] } })
    utimesSync(configFile, fixed, fixed)
    expect(resolveScope(first).decision.active).toBe(true)
    expect(resolveScope(second).decision.active).toBe(false)

    // 两份白名单路径等长（proj-a / proj-b），字节数与修改时间都被固定
    writeGlobal({ activation: { mode: "allowlist", include: [second.replace(/\\/g, "/")] } })
    utimesSync(configFile, fixed, fixed)
    expect(resolveScope(second).decision.active).toBe(true)
  })

  it("activation 字段类型非法时逐项告警并忽略", () => {
    writeGlobal({ activation: { mode: "all", include: "not-array", exclude: ["", 1], markers: "oops", skills: "oops" } })
    const text = resolveScope(project).warnings.join("\n")
    expect(text).toContain("activation.include 须为字符串数组")
    expect(text).toContain("activation.exclude 有非字符串或空项")
    expect(text).toContain("activation.markers 须为对象")
    expect(text).toContain("activation.skills 须为对象")
  })

  it("activation.skills 非法键与取值逐项告警", () => {
    writeGlobal({ activation: { mode: "all", skills: { "": { exclude: [] }, "re:(": { exclude: [] }, good: "oops" } } })
    const text = resolveScope(project).warnings.join("\n")
    expect(text).toContain("activation.skills 键「」已忽略")
    expect(text).toContain("activation.skills 键「re:(」已忽略")
    expect(text).toContain("activation.skills.good 须为对象")
  })

  it("非法路径规则告警并剔除，不参与判定", () => {
    writeGlobal({ activation: { mode: "allowlist", include: ["re:("] } })
    const report = resolveScope(project)
    expect(report.warnings.join("\n")).toContain("已忽略")
    expect(report.warnings.join("\n")).toContain("修正该通配符")
    expect(report.decision.active).toBe(false)
  })

  it("技能级规则按技能名生效，未命中的技能回落目录级", () => {
    writeGlobal({
      activation: {
        mode: "allowlist",
        include: [project.replace(/\\/g, "/")],
        skills: { "fxri-plan-review": { mode: "denylist", exclude: [project.replace(/\\/g, "/")] } },
      },
    })
    const review = resolveScope(project, "fxri-plan-review")
    expect(review.decision.active).toBe(false)
    expect(review.decision.reason).toContain("技能级规则")
    expect(resolveScope(project, "fxri-base-encoding").decision.active).toBe(true)
  })

  it("技能级规则随所在层整体生效，不跨层合并", () => {
    writeGlobal({ activation: { mode: "denylist", exclude: [`${home.replace(/\\/g, "/")}/work/**`] } })
    writeFileSync(
      join(project, ".toolkitrc.local.json"),
      JSON.stringify({ activation: { skills: { "fxri-plan-review": { mode: "all" } } } }),
    )
    resetToolkitConfigCache()
    const review = resolveScope(project, "fxri-plan-review")
    // 本地层整段覆盖全局层：全局的 exclude 不再参与，技能级规则生效
    expect(review.decision.sourceFile?.endsWith(".toolkitrc.local.json")).toBe(true)
    expect(review.decision.active).toBe(true)
    expect(review.decision.reason).toContain("技能级规则")
    expect(resolveScope(project, "fxri-base-encoding").decision.active).toBe(true)
  })
})

describe("findProjectRoot", () => {
  it("父目录只有 .tasks 时不作为项目根", () => {
    const parent = join(home, "work")
    const repo = join(parent, "repo")
    const sub = join(repo, "src")
    mkdirSync(sub, { recursive: true })
    mkdirSync(join(parent, ".tasks"), { recursive: true })
    expect(findProjectRoot(sub)).toBe(sub)
  })

  it("项目配置与项目产物可定位项目根", () => {
    const repo = join(home, "work", "repo")
    const sub = join(repo, "src")
    mkdirSync(sub, { recursive: true })
    writeFileSync(join(repo, ".toolkitrc.json"), "{}")
    expect(findProjectRoot(sub)).toBe(repo)
    rmSync(join(repo, ".toolkitrc.json"))
    mkdirSync(join(repo, ".agents", "skills"), { recursive: true })
    expect(findProjectRoot(sub)).toBe(repo)
  })

  it("git 根优先于项目标志", () => {
    const parent = join(home, "work")
    const repo = join(parent, "repo")
    const sub = join(repo, "src")
    mkdirSync(sub, { recursive: true })
    mkdirSync(join(parent, ".git"), { recursive: true })
    writeFileSync(join(repo, ".toolkitrc.json"), "{}")
    expect(findProjectRoot(sub)).toBe(parent)
  })

  it("盘根无项目标志时回落起点", () => {
    const root = resolve("/")
    expect(findProjectRoot(root)).toBe(root)
  })
})
