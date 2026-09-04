// 配置向上查找：从 cwd 逐级向上找最近的 .toolkitrc.json（E6）
import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadToolkitConfig, resetToolkitConfigCache, resolveTasksDir } from "../config"

const cwd = process.cwd()

afterEach(() => {
  process.chdir(cwd)
  resetToolkitConfigCache()
})

describe("loadToolkitConfig 向上查找", () => {
  it("带 UTF-8 BOM 的配置文件可正常解析（Windows PowerShell 写出场景）", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-cfg-bom-"))
    // \uFEFF 前缀模拟 PowerShell Set-Content -Encoding utf8 的输出
    writeFileSync(join(dir, ".toolkitrc.json"), "\uFEFF" + JSON.stringify({ tasks: { dir: "../o" } }), "utf8")
    process.chdir(dir)
    resetToolkitConfigCache()
    expect(loadToolkitConfig()?.tasks?.dir).toBe("../o")
    expect(resolveTasksDir()).toBe("../o")
    process.chdir(cwd)
    resetToolkitConfigCache()
    rmSync(dir, { recursive: true, force: true })
  })

  it("子目录能找到上级配置（E6）", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-cfg-up-"))
    mkdirSync(join(dir, "a", "b"), { recursive: true })
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ check: { up: true } }), "utf8")
    process.chdir(join(dir, "a", "b"))
    resetToolkitConfigCache()
    expect(loadToolkitConfig()?.check?.up).toBe(true)
    process.chdir(cwd)
    resetToolkitConfigCache()
    rmSync(dir, { recursive: true, force: true })
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
    process.chdir(cwd)
    resetToolkitConfigCache()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("resolveTasksDir 任务目录三档解析", () => {
  it("CLI 显式传参优先于配置与默认值", () => {
    expect(resolveTasksDir("../my-tasks")).toBe("../my-tasks")
    expect(resolveTasksDir("D:/work/tasks-repo")).toBe("D:/work/tasks-repo")
  })

  it("无 CLI 传参时取配置 tasks.dir（含项目外路径）", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-cfg-dir-"))
    writeFileSync(
      join(dir, ".toolkitrc.json"),
      JSON.stringify({ tasks: { dir: "../my-tasks-repo" } }),
      "utf8",
    )
    process.chdir(dir)
    resetToolkitConfigCache()
    expect(resolveTasksDir()).toBe("../my-tasks-repo")
    process.chdir(cwd)
    resetToolkitConfigCache()
    rmSync(dir, { recursive: true, force: true })
  })

  it("均未配置时回落默认 .tasks；配置为空字符串视为未配置", () => {
    expect(resolveTasksDir()).toBe(".tasks")
    const dir = mkdtempSync(join(tmpdir(), "tk-cfg-dir2-"))
    writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify({ tasks: { dir: "" } }), "utf8")
    process.chdir(dir)
    resetToolkitConfigCache()
    expect(resolveTasksDir()).toBe(".tasks")
    process.chdir(cwd)
    resetToolkitConfigCache()
    rmSync(dir, { recursive: true, force: true })
  })
})
