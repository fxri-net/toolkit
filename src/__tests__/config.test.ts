// 配置查找与合并：项目级向上查找最近的 .toolkitrc.json（E6），全局 ~/.toolkitrc.json 段级合并
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  loadToolkitConfig,
  resetToolkitConfigCache,
  resolveTasksDir,
  getConfigSection,
  setHomeDirForTest,
  inspectConfigLayers,
  resolveLocalConfigPath,
  resolveLeafSource,
} from "../config"

const cwd = process.cwd()

// 每个用例前把全局配置目录指向独立临时 home，隔离真实用户 ~/.toolkitrc.json；结束后清理复位
let home = ""

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-home-"))
  setHomeDirForTest(home)
})

afterEach(() => {
  process.chdir(cwd)
  resetToolkitConfigCache()
  setHomeDirForTest(undefined)
  rmSync(home, { recursive: true, force: true })
})

// 建一个空项目目录并进入（不含 .toolkitrc.json）
function chdirIntoEmptyProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "tk-proj-"))
  process.chdir(dir)
  return dir
}

// 退出临时目录并删除（Windows 不允许删除当前工作目录，须先切回仓库根）
function cleanupTmpDir(dir: string): void {
  process.chdir(cwd)
  resetToolkitConfigCache()
  rmSync(dir, { recursive: true, force: true })
}

describe("loadToolkitConfig 向上查找", () => {
  it("带 UTF-8 BOM 的配置文件可正常解析（Windows PowerShell 写出场景）", () => {
    const dir = chdirIntoEmptyProject()
    // \uFEFF 前缀模拟 PowerShell Set-Content -Encoding utf8 的输出
    writeFileSync(join(dir, ".toolkitrc.json"), "\uFEFF" + JSON.stringify({ tasks: { dir: "../o" } }), "utf8")
    resetToolkitConfigCache()
    expect(loadToolkitConfig()?.tasks?.dir).toBe("../o")
    expect(resolveTasksDir()).toBe("../o")
    cleanupTmpDir(dir)
  })

  it("子目录能找到上级配置（E6）", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-cfg-up-"))
    mkdirSync(join(dir, "a", "b"), { recursive: true })
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ check: { up: true } }), "utf8")
    process.chdir(join(dir, "a", "b"))
    resetToolkitConfigCache()
    expect(loadToolkitConfig()?.check?.up).toBe(true)
    cleanupTmpDir(dir)
  })

  it("最近一层配置优先", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-cfg-up2-"))
    mkdirSync(join(dir, "a"), { recursive: true })
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ check: { root: true } }), "utf8")
    writeFileSync(join(dir, "a", ".toolkitrc.json"), JSON.stringify({ check: { child: true } }), "utf8")
    process.chdir(join(dir, "a"))
    resetToolkitConfigCache()
    const cfg = loadToolkitConfig()
    expect(cfg?.check?.child).toBe(true)
    expect(cfg?.check?.root).toBeUndefined()
    cleanupTmpDir(dir)
  })
})

describe("resolveTasksDir 任务目录三档解析", () => {
  it("CLI 显式传参优先于配置与默认值", () => {
    expect(resolveTasksDir("../my-tasks")).toBe("../my-tasks")
    expect(resolveTasksDir("D:/work/tasks-repo")).toBe("D:/work/tasks-repo")
  })

  it("无 CLI 传参时取配置 tasks.dir（含项目外路径）", () => {
    const dir = chdirIntoEmptyProject()
    writeFileSync(
      join(dir, ".toolkitrc.json"),
      JSON.stringify({ tasks: { dir: "../my-tasks-repo" } }),
      "utf8",
    )
    resetToolkitConfigCache()
    expect(resolveTasksDir()).toBe("../my-tasks-repo")
    cleanupTmpDir(dir)
  })

  it("均未配置时回落默认 .tasks", () => {
    expect(resolveTasksDir()).toBe(".tasks")
  })
})

describe("全局配置段级合并", () => {
  it("无全局与项目配置返回 null", () => {
    process.chdir(home)
    resetToolkitConfigCache()
    expect(loadToolkitConfig()).toBeNull()
  })

  it("仅全局配置时生效（个人偏好不进项目）", () => {
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ updateCheck: { enabled: false } }), "utf8")
    const dir = chdirIntoEmptyProject()
    resetToolkitConfigCache()
    expect(loadToolkitConfig()?.updateCheck?.enabled).toBe(false)
    cleanupTmpDir(dir)
  })

  it("项目与全局不同段互补合并", () => {
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ updateCheck: { enabled: false } }), "utf8")
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ check: { warnings: false } }), "utf8")
    resetToolkitConfigCache()
    const cfg = loadToolkitConfig()
    expect(cfg?.updateCheck?.enabled).toBe(false)
    expect(cfg?.check?.warnings).toBe(false)
    cleanupTmpDir(dir)
  })

  it("同名段项目整体覆盖全局（非字段级深合并）", () => {
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ redact: { disable: ["phone"] } }), "utf8")
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ redact: { enabled: true } }), "utf8")
    resetToolkitConfigCache()
    const cfg = loadToolkitConfig()
    expect(cfg?.redact?.enabled).toBe(true)
    expect(cfg?.redact?.disable).toBeUndefined()
    cleanupTmpDir(dir)
  })

  it("全局文件非法 JSON 时忽略，仅剩项目配置", () => {
    writeFileSync(join(home, ".toolkitrc.json"), "{ 非法 json", "utf8")
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ check: { warnings: false } }), "utf8")
    resetToolkitConfigCache()
    const cfg = loadToolkitConfig()
    expect(cfg?.check?.warnings).toBe(false)
    expect(cfg?.updateCheck).toBeUndefined()
    cleanupTmpDir(dir)
  })

  it("全局文件带 UTF-8 BOM 可正常解析", () => {
    writeFileSync(
      join(home, ".toolkitrc.json"),
      "\uFEFF" + JSON.stringify({ updateCheck: { enabled: false } }),
      "utf8",
    )
    const dir = chdirIntoEmptyProject()
    resetToolkitConfigCache()
    expect(loadToolkitConfig()?.updateCheck?.enabled).toBe(false)
    cleanupTmpDir(dir)
  })

  it("项目未配 tasks.dir 时回落全局；项目配了则覆盖全局", () => {
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ tasks: { dir: "../global-tasks" } }), "utf8")
    const dir = chdirIntoEmptyProject()
    resetToolkitConfigCache()
    expect(resolveTasksDir()).toBe("../global-tasks")
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ tasks: { dir: "./project-tasks" } }), "utf8")
    resetToolkitConfigCache()
    expect(resolveTasksDir()).toBe("./project-tasks")
    cleanupTmpDir(dir)
  })

  it("全局文件改动后 resetToolkitConfigCache 重新生效", () => {
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ updateCheck: { enabled: true } }), "utf8")
    resetToolkitConfigCache()
    expect(loadToolkitConfig()?.updateCheck?.enabled).toBe(true)
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ updateCheck: { enabled: false } }), "utf8")
    resetToolkitConfigCache()
    expect(loadToolkitConfig()?.updateCheck?.enabled).toBe(false)
    cleanupTmpDir(dir)
  })
})

// 缺陷 12：显式配置无法采纳时须 stderr 告警（保留回落行为，不阻断）
describe("配置降级告警", () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  // 汇总 console.warn 收到的告警文本
  function warnTexts(): string[] {
    return warn.mock.calls.map((c) => String(c[0]))
  }

  it("配置段类型不符：告警一次并视为未配置", () => {
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ tasks: "oops" }), "utf8")
    resetToolkitConfigCache()
    expect(getConfigSection("tasks")).toBeUndefined()
    // 同一键重复读取不刷屏
    expect(getConfigSection("tasks")).toBeUndefined()
    expect(warnTexts()).toHaveLength(1)
    expect(warnTexts()[0]).toContain("配置段须为对象")
    cleanupTmpDir(dir)
  })

  it("tasks.dir 类型不符：告警并回落默认值", () => {
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ tasks: { dir: 123 } }), "utf8")
    resetToolkitConfigCache()
    expect(resolveTasksDir()).toBe(".tasks")
    expect(warnTexts()).toHaveLength(1)
    expect(warnTexts()[0]).toContain("tasks.dir")
    cleanupTmpDir(dir)
  })

  it("顶层非对象：告警并视为未配置", () => {
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(dir, ".toolkitrc.json"), "null", "utf8")
    resetToolkitConfigCache()
    expect(loadToolkitConfig()).toBeNull()
    expect(warnTexts()[0]).toContain("顶层须为对象")
    cleanupTmpDir(dir)
  })

  it("JSON 解析失败：告警并视为未配置", () => {
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(dir, ".toolkitrc.json"), "{ 非法 json", "utf8")
    resetToolkitConfigCache()
    expect(loadToolkitConfig()).toBeNull()
    expect(warnTexts()[0]).toContain("JSON 解析失败")
    cleanupTmpDir(dir)
  })

  it("tasks.dir 为空字符串：告警并按未配置回落默认值", () => {
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ tasks: { dir: "" } }), "utf8")
    resetToolkitConfigCache()
    expect(resolveTasksDir()).toBe(".tasks")
    expect(warnTexts()).toHaveLength(1)
    expect(warnTexts()[0]).toContain("tasks.dir")
    expect(warnTexts()[0]).toContain("空字符串")
    cleanupTmpDir(dir)
  })
})

// 本地配置层：.toolkitrc.local.json 与 .toolkitrc.json 各自独立向上查找，后者与结果段内字段级浅合并
describe("本地配置层", () => {
  // 全部用 startDir 参数注入起点（不 chdir，避开 Windows 目录锁）；本例自建目录自清
  const created: string[] = []

  afterEach(() => {
    resetToolkitConfigCache()
    while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
  })

  // 建独立临时树并登记清理；返回树根
  function makeTree(): string {
    const dir = mkdtempSync(join(tmpdir(), "tk-local-"))
    created.push(dir)
    return dir
  }

  // 写配置文件（内容序列化为 JSON）
  function writeCfg(dir: string, name: string, body: unknown): string {
    const file = join(dir, name)
    writeFileSync(file, JSON.stringify(body), "utf8")
    return file
  }

  it("两层各自独立向上查找：项目层与本地层可命中不同目录的文件", () => {
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    const projectFile = writeCfg(root, ".toolkitrc.json", { tasks: { dir: "team-tasks" } })
    const localFile = writeCfg(sub, ".toolkitrc.local.json", { redact: { enabled: false } })

    const layers = inspectConfigLayers(sub)
    expect(layers.project.file).toBe(projectFile)
    expect(layers.local.file).toBe(localFile)
    expect(layers.local.hit).toBe(true)
  })

  it("本地层字段级覆盖：只覆盖显式字段，团队未写字段保留", () => {
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    writeCfg(root, ".toolkitrc.json", { redact: { enabled: true, disable: ["phone"] } })
    writeCfg(sub, ".toolkitrc.local.json", { redact: { enabled: false } })

    const merged = inspectConfigLayers(sub).merged as Record<string, unknown>
    const redact = merged.redact as Record<string, unknown>
    expect(redact.enabled).toBe(false)
    // 数组字段未在本地层写出：保留团队值（覆盖为整段替换而非合并，但未写的键仍来自团队层）
    expect(redact.disable).toEqual(["phone"])
  })

  it("本地层段值非对象：整段按未写处理并记录降级，团队段保留", () => {
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    writeCfg(root, ".toolkitrc.json", { tasks: { dir: "team-tasks" } })
    writeCfg(sub, ".toolkitrc.local.json", { tasks: "oops" })

    const layers = inspectConfigLayers(sub)
    const merged = layers.merged as Record<string, unknown>
    expect((merged.tasks as Record<string, unknown>).dir).toBe("team-tasks")
    expect(layers.fallbacks.some((f) => f.key === "tasks" && f.detail.includes("配置段须为对象"))).toBe(true)
  })

  it("本地层字段值为 null：按未写处理，保留团队值", () => {
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    writeCfg(root, ".toolkitrc.json", { tasks: { dir: "team-tasks" } })
    writeCfg(sub, ".toolkitrc.local.json", { tasks: { dir: null } })

    const merged = inspectConfigLayers(sub).merged as Record<string, unknown>
    expect((merged.tasks as Record<string, unknown>).dir).toBe("team-tasks")
  })

  it("本地层字段类型不符：按未写处理并记录一条降级，保留团队值", () => {
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    writeCfg(root, ".toolkitrc.json", { tasks: { dir: "team-tasks" } })
    writeCfg(sub, ".toolkitrc.local.json", { tasks: { dir: 123 } })

    const layers = inspectConfigLayers(sub)
    const merged = layers.merged as Record<string, unknown>
    expect((merged.tasks as Record<string, unknown>).dir).toBe("team-tasks")
    expect(layers.fallbacks.filter((f) => f.key === "tasks.dir")).toHaveLength(1)
  })

  it("同键在两文件各写错一次：各记一条降级且各带来源文件", () => {
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    const projectFile = writeCfg(root, ".toolkitrc.json", { tasks: { dir: 123 } })
    const localFile = writeCfg(sub, ".toolkitrc.local.json", { tasks: { dir: 456 } })

    const hits = inspectConfigLayers(sub).fallbacks.filter((f) => f.key === "tasks.dir")
    expect(hits).toHaveLength(2)
    expect(new Set(hits.map((f) => f.file)).size).toBe(2)
    expect(hits.map((f) => f.file)).toContain(projectFile)
    expect(hits.map((f) => f.file)).toContain(localFile)
  })

  it("本地文件读盘异常（同名目录）：记为降级且该层未命中", () => {
    const root = makeTree()
    writeCfg(root, ".toolkitrc.json", { tasks: { dir: "team-tasks" } })
    // 用同名目录造 EISDIR：existsSync 为真但读取抛错
    mkdirSync(join(root, ".toolkitrc.local.json"))

    const layers = inspectConfigLayers(root)
    expect(layers.local.file).not.toBeNull()
    expect(layers.local.hit).toBe(false)
    expect(layers.fallbacks.some((f) => f.detail.includes("文件读取失败"))).toBe(true)
  })

  it("home 边界：本地层查找止于 home，home 自身只作边界不作候选", () => {
    const root = makeTree()
    const sub = join(root, "a", "b")
    mkdirSync(sub, { recursive: true })
    writeCfg(root, ".toolkitrc.local.json", { tasks: { dir: "at-home" } })
    setHomeDirForTest(root)

    // root 即 home：自 sub 向上遇到 home 先截断，不把 ~/.toolkitrc.local.json 当本地层命中
    expect(resolveLocalConfigPath(sub)).toBeNull()

    // home 之下存在本地文件时仍可命中
    const inner = writeCfg(sub, ".toolkitrc.local.json", { tasks: { dir: "mine" } })
    expect(resolveLocalConfigPath(sub)).toBe(inner)
  })

  it("现算不缓存：两次 inspectConfigLayers 之间新增本地文件即被读取", () => {
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    expect(inspectConfigLayers(sub).local.hit).toBe(false)
    writeCfg(sub, ".toolkitrc.local.json", { tasks: { dir: "mine" } })
    expect(inspectConfigLayers(sub).local.hit).toBe(true)
  })

  it("定位与忽略判定同源：resolveLocalConfigPath 与 inspectConfigLayers 的本地层路径一致", () => {
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    writeCfg(sub, ".toolkitrc.local.json", { tasks: { dir: "mine" } })
    expect(resolveLocalConfigPath(sub)).toBe(inspectConfigLayers(sub).local.file)
  })

  it("叶子键来源层：混合段按各字段实际来源标注", () => {
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    writeCfg(root, ".toolkitrc.json", { tasks: { dir: "team" }, check: { warnings: true } })
    writeCfg(sub, ".toolkitrc.local.json", { tasks: { dir: "mine" } })

    const layers = inspectConfigLayers(sub)
    expect(resolveLeafSource(layers, "tasks.dir")).toBe("本地层")
    expect(resolveLeafSource(layers, "check.warnings")).toBe("项目层")
    expect(resolveLeafSource(layers, "updateCheck.enabled")).toBeNull()
  })

  it("降级告警去重键含来源文件：两文件各写错一次时各报一条且各带路径", () => {
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    const projectFile = writeCfg(root, ".toolkitrc.json", { tasks: { dir: 123 } })
    const localFile = writeCfg(sub, ".toolkitrc.local.json", { tasks: { dir: 456 } })

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      loadToolkitConfig(sub)
      const texts = warn.mock.calls.map((c) => String(c[0])).filter((t) => t.includes("tasks.dir"))
      expect(texts).toHaveLength(2)
      expect(texts.some((t) => t.includes(projectFile))).toBe(true)
      expect(texts.some((t) => t.includes(localFile))).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })

  it("来源判定与合并结果一致：项目层写了该段则段内未写字段不再落全局", () => {
    writeFileSync(
      join(home, ".toolkitrc.json"),
      JSON.stringify({ redact: { enabled: true }, updateCheck: { enabled: true } }),
      "utf8",
    )
    const root = makeTree()
    const sub = join(root, "sub")
    mkdirSync(sub, { recursive: true })
    writeCfg(root, ".toolkitrc.json", { redact: { disable: ["phone"] } })
    writeCfg(sub, ".toolkitrc.local.json", { redact: { disable: ["id"] } })

    const layers = inspectConfigLayers(sub)
    const merged = layers.merged as Record<string, unknown>
    const redact = merged.redact as Record<string, unknown>
    // 项目层写了 redact 段即整段覆盖全局，全局的 enabled 不再落入合并结果
    expect(redact.enabled).toBeUndefined()
    expect(redact.disable).toEqual(["id"])
    expect((merged.updateCheck as Record<string, unknown>).enabled).toBe(true)

    // 来源判定与合并结果一致：段级覆盖后该字段不存在，来源须为 null 而非误报全局层
    expect(resolveLeafSource(layers, "redact.enabled")).toBeNull()
    expect(resolveLeafSource(layers, "redact.disable")).toBe("本地层")
    expect(resolveLeafSource(layers, "updateCheck.enabled")).toBe("全局层")
  })
})
