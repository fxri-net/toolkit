// 整体状态聚合单测：健康 / 有问题 / 未初始化三种现场，以及 --check 退出码与统一信封
// 各域取数一律 mock 真实实现的导出函数，只验证聚合层的问题映射与计数，不在测试内复刻域内规则
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const stubs = vi.hoisted(() => ({
  skillsStatus: vi.fn(),
  configStatus: vi.fn(),
  checkDocsNav: vi.fn(),
  checkDocsDist: vi.fn(),
  detectUpgradeItems: vi.fn(),
  countAutoResidue: vi.fn(),
  legacyShapeHints: vi.fn(),
}))

vi.mock("../skills/status", () => ({ skillsStatus: stubs.skillsStatus }))
// 保留 config-status 的真实辅助函数（foldHome / foldHomeInText），只替换体检取数
vi.mock("../config-status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config-status")>()
  return { ...actual, configStatus: stubs.configStatus }
})
vi.mock("../docs/nav", () => ({ NAV_RULES_VERSION: "test", checkDocsNav: stubs.checkDocsNav }))
vi.mock("../docs/dist", () => ({ DIST_RULES_VERSION: "test", checkDocsDist: stubs.checkDocsDist }))
vi.mock("../docs/config", () => ({ resolveDocsCheckConfig: () => ({ nav: { dir: "docs" }, dist: {}, rules: {} }) }))
// 迁移检测取数与升级命令共用同一实现，聚合层只验证区块映射，不在此复刻检测规则
vi.mock("../upgrade/detect", () => ({ detectUpgradeItems: stubs.detectUpgradeItems, countAutoResidue: stubs.countAutoResidue }))
// 旧作用域 / 分发配置提示由 skills 域给出：健康现场固定为空，避免读到开发者本机全局配置
vi.mock("../skills/matrix", () => ({ legacyShapeHints: stubs.legacyShapeHints }))
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>()
  return { ...actual, resolveTasksDir: () => ".tasks" }
})
// 弃用命中读本机缓存：健康现场固定为空，避免开发者跑过旧命令后本地门禁误红
vi.mock("../command-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../command-registry")>()
  return { ...actual, takeDeprecationHits: () => [] }
})

import { collectStatus } from "../status"
import { runStatus } from "../commands/status"

// 健康现场的各域返回值：只含聚合层读取的字段
function healthyDomains(): void {
  stubs.skillsStatus.mockReturnValue({ selection: ["a", "b"], targets: [{ dir: "t1" }], pending: [], versionMismatches: [] })
  stubs.configStatus.mockReturnValue({ summary: "共命中 1 层：项目层", items: [] })
  stubs.checkDocsNav.mockReturnValue({ ok: true, problems: [], navCount: 1, sidebarCount: 1, localeCount: 1 })
  stubs.checkDocsDist.mockReturnValue({ ok: true, skipped: false, searchChecked: true, problems: [] })
  stubs.legacyShapeHints.mockReturnValue([])
}

const dirs: string[] = []
const originalCwd = process.cwd()

// 建现场目录：withTasks 为真时创建 .tasks/active 与 docs，模拟已初始化项目
function makeDir(withTasks: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "fxts-tk-status-"))
  dirs.push(dir)
  if (withTasks) {
    mkdirSync(join(dir, ".tasks", "active"), { recursive: true })
    mkdirSync(join(dir, "docs"), { recursive: true })
  }
  return dir
}

beforeEach(() => {
  stubs.skillsStatus.mockReset()
  stubs.configStatus.mockReset()
  stubs.checkDocsNav.mockReset()
  stubs.checkDocsDist.mockReset()
  stubs.detectUpgradeItems.mockReset()
  stubs.countAutoResidue.mockReset()
  healthyDomains()
  stubs.detectUpgradeItems.mockReturnValue([])
  stubs.countAutoResidue.mockReturnValue(0)
  process.exitCode = 0
})

afterEach(() => {
  process.chdir(originalCwd)
  process.exitCode = 0
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("collectStatus 三现场", () => {
  it("健康现场：五个区块齐备、无问题、结论为整体健康", () => {
    const report = collectStatus("1.2.3", makeDir(true))
    expect(report.initialized).toBe(true)
    expect(report.ok).toBe(true)
    expect(report.summary).toBe("整体健康")
    expect(report.sections.map((section) => section.id)).toEqual(["tasks", "skills", "config", "docs", "version"])
    expect(report.issues).toEqual([])
    expect(report.errorCount).toBe(0)
    expect(report.warnCount).toBe(0)
    // 版本与弃用项取自注册表静态登记
    expect(report.deprecated.length).toBeGreaterThan(0)
    expect(report.runtimeHits).toEqual([])
  })

  it("有问题现场：各域问题按 scope 汇总，error 决定整体结论", () => {
    stubs.skillsStatus.mockReturnValue({
      selection: ["a"],
      targets: [{ dir: "t1" }],
      pending: [{ name: "a", dir: "t1", target: "full", action: "full" }],
      versionMismatches: [{ name: "b", frontmatter: "1.0.0", body: "1.0.1" }],
    })
    stubs.configStatus.mockReturnValue({
      summary: "共命中 1 层：本地层",
      items: [
        { level: "warn", scope: "本地层", message: "本地配置文件未纳入 git 忽略" },
        { level: "info", scope: "本地层", message: "检测到 home 目录下的本地配置文件" },
      ],
    })
    stubs.checkDocsNav.mockReturnValue({
      ok: false,
      problems: [{ id: "nav/first-item", level: "error", message: "顶栏首项不符", file: "docs/site-nav.json" }],
      navCount: 1,
      sidebarCount: 1,
      localeCount: 1,
    })
    stubs.checkDocsDist.mockReturnValue({
      ok: false,
      skipped: false,
      searchChecked: true,
      problems: [{ id: "dist/sitemap-404", level: "warn", message: "sitemap 含 404 页", file: "docs/dist/sitemap.xml" }],
    })

    const report = collectStatus("1.2.3", makeDir(true))
    expect(report.ok).toBe(false)
    expect(report.summary).toBe("存在 1 项需处理")
    expect(report.errorCount).toBe(1)
    expect(report.warnCount).toBe(4)
    expect(report.infoCount).toBe(1)
    expect(report.sections.find((section) => section.id === "docs")?.ok).toBe(false)
    expect(report.issues.map((issue) => issue.scope)).toEqual(["技能现场", "技能现场", "配置层", "配置层", "文档站", "文档站"])
    expect(report.issues.some((issue) => issue.message.includes("nav/first-item"))).toBe(true)
  })

  it("迁移提示：存在 v1 形态时追加 migrate 区块，不计入问题清单", () => {
    stubs.detectUpgradeItems.mockReturnValue([
      { id: "config:project", surface: "config", layers: ["project"], action: "旧段名", risk: "low", files: [], reason: "", status: "planned" },
      { id: "project:package", surface: "project-file", layers: ["project"], action: "旧 prepare", risk: "low", files: [], reason: "", status: "manual" },
    ])
    stubs.countAutoResidue.mockReturnValue(1)

    const report = collectStatus("1.2.3", makeDir(true))
    const section = report.sections.find((item) => item.id === "migrate")
    expect(section?.summary).toContain("2 项")
    expect(section?.details).toContain("可自动 1 项 / 需人工 1 项")
    expect(report.issues).toEqual([])
    expect(report.errorCount).toBe(0)
    expect(report.warnCount).toBe(0)
    // 只查项目与本地层，不因 status 去扫全局目录
    expect(stubs.detectUpgradeItems).toHaveBeenCalledWith(expect.any(String), ["project", "local"])
  })

  it("未初始化现场：只提示 init，不逐域报错", () => {
    const report = collectStatus("1.2.3", makeDir(false))
    expect(report.initialized).toBe(false)
    expect(report.ok).toBe(true)
    expect(report.sections).toEqual([])
    expect(report.issues).toEqual([])
    expect(report.tasksDir).toBe(".tasks")
    // 未初始化时不应触达任何域取数
    expect(stubs.skillsStatus).not.toHaveBeenCalled()
    expect(stubs.checkDocsNav).not.toHaveBeenCalled()
  })
})

describe("runStatus 输出与退出码", () => {
  it("--check 仅在 error 级问题存在时退出 1", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const dir = makeDir(true)
    process.chdir(dir)

    // 健康现场：--check 不置退出码
    runStatus({ check: true }, "1.2.3")
    expect(process.exitCode).toBe(0)

    // 文档站 error 现场：--check 退出 1
    stubs.checkDocsNav.mockReturnValue({
      ok: false,
      problems: [{ id: "nav/first-item", level: "error", message: "顶栏首项不符", file: "docs/site-nav.json" }],
      navCount: 1,
      sidebarCount: 1,
      localeCount: 1,
    })
    runStatus({ check: true }, "1.2.3")
    expect(process.exitCode).toBe(1)
    expect(log).toHaveBeenCalled()
  })

  it("--format json 输出统一信封：schemaVersion / command / code / message / data / extend / debug / issues", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const dir = makeDir(true)
    process.chdir(dir)

    runStatus({ format: "json" }, "1.2.3")
    const payload = JSON.parse(log.mock.calls.map((call) => call.join(" ")).join("\n")) as Record<string, unknown>
    expect(payload.schemaVersion).toBe(1)
    expect(payload.command).toBe("status")
    expect(payload.code).toBe(200)
    expect(payload.message).toBe("成功")
    expect(payload.extend).toEqual({ exitCode: 0 })
    expect(payload.debug).toEqual({})
    expect(payload.issues).toEqual([])
    const data = payload.data as { version: string; initialized: boolean; sections: unknown[] }
    expect(data.version).toBe("1.2.3")
    expect(data.initialized).toBe(true)
    expect(data.sections).toHaveLength(5)
  })

  it("--format json：迁移项进入 sections，顶层键与 issues 不变", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    process.chdir(makeDir(true))
    stubs.detectUpgradeItems.mockReturnValue([
      { id: "config:project", surface: "config", layers: ["project"], action: "旧段名", risk: "low", files: [], reason: "", status: "planned" },
    ])
    stubs.countAutoResidue.mockReturnValue(1)

    runStatus({ format: "json" }, "1.2.3")
    const payload = JSON.parse(log.mock.calls.map((call) => call.join(" ")).join("\n")) as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(["code", "command", "data", "debug", "extend", "issues", "message", "schemaVersion"])
    expect(payload.issues).toEqual([])
    const data = payload.data as { sections: Array<{ id: string }> }
    expect(data.sections.map((section) => section.id)).toContain("migrate")
  })

  it("非法 --format 报错退出 1，不做聚合", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    runStatus({ format: "xml" }, "1.2.3")
    expect(process.exitCode).toBe(1)
    expect(error).toHaveBeenCalledWith("⚠️ 不支持的输出格式「xml」，仅支持 json")
    expect(stubs.skillsStatus).not.toHaveBeenCalled()
  })
})
