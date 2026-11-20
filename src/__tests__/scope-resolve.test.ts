// 作用域配置加载：三层就近覆盖、来源文件与非法值告警
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { resolveScope } from "../scope"

let home = ""
let project = ""
let other = ""

// 写入全局层配置（目录级作用域示例）
function writeGlobal(config: unknown): void {
  writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify(config))
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "scope-home-"))
  project = join(home, "work", "repo")
  other = join(home, "personal")
  mkdirSync(project, { recursive: true })
  mkdirSync(other, { recursive: true })
  setHomeDirForTest(home)
  resetToolkitConfigCache()
})

afterEach(() => {
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
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
    mkdirSync(join(project, ".tasks"), { recursive: true })
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
    const real = join(home, "real-project")
    mkdirSync(join(real, ".git"), { recursive: true })
    const link = join(home, "link-project")
    try {
      symlinkSync(real, link, "dir")
    } catch {
      // Windows 无符号链接权限时跳过该用例
      return
    }
    writeGlobal({ activation: { mode: "allowlist", include: [real.replace(/\\/g, "/")] } })
    const report = resolveScope(link)
    // 字符串口径：按真实路径写的规则不再命中链接路径，结论不生效
    expect(report.decision.active).toBe(false)
    expect(report.migrationHint ?? "").toContain("真实路径")

    // 规则按链接路径书写时本就命中，不应触发迁移提示
    writeGlobal({ activation: { mode: "allowlist", include: [link.replace(/\\/g, "/")] } })
    resetToolkitConfigCache()
    const matched = resolveScope(link)
    expect(matched.decision.active).toBe(true)
    expect(matched.migrationHint).toBeNull()

    // 只有技能级规则按真实路径书写时同样给出提示
    writeGlobal({
      activation: {
        mode: "allowlist",
        include: [link.replace(/\\/g, "/")],
        skills: { "fxri-plan-review": { exclude: [real.replace(/\\/g, "/")] } },
      },
    })
    resetToolkitConfigCache()
    const skillHint = resolveScope(link, "fxri-plan-review")
    expect(skillHint.migrationHint ?? "").toContain("真实路径")
  })

  it("非法路径规则告警并剔除，不参与判定", () => {
    writeGlobal({ activation: { mode: "allowlist", include: ["re:("] } })
    const report = resolveScope(project)
    expect(report.warnings.join("\n")).toContain("已忽略")
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
    expect(resolveScope(project, "fxri-text-encoding").decision.active).toBe(true)
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
    expect(resolveScope(project, "fxri-text-encoding").decision.active).toBe(true)
  })
})
