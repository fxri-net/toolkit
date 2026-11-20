// 作用域配置加载：三层就近覆盖、来源文件与非法值告警
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
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

  it("非法路径规则告警并剔除，不参与判定", () => {
    writeGlobal({ activation: { mode: "allowlist", include: ["re:("] } })
    const report = resolveScope(project)
    expect(report.warnings.join("\n")).toContain("已忽略")
    expect(report.decision.active).toBe(false)
  })
})
