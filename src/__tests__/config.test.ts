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

  it("均未配置时回落默认 .tasks；配置为空字符串视为未配置", () => {
    expect(resolveTasksDir()).toBe(".tasks")
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ tasks: { dir: "" } }), "utf8")
    resetToolkitConfigCache()
    expect(resolveTasksDir()).toBe(".tasks")
    cleanupTmpDir(dir)
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

  it("空字符串仍按未配置静默处理（不告警）", () => {
    const dir = chdirIntoEmptyProject()
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ tasks: { dir: "" } }), "utf8")
    resetToolkitConfigCache()
    expect(resolveTasksDir()).toBe(".tasks")
    expect(warn).not.toHaveBeenCalled()
    cleanupTmpDir(dir)
  })
})
