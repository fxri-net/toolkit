// 配置向上查找：从 cwd 逐级向上找最近的 .toolkitrc.json（E6）
import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadToolkitConfig, resetToolkitConfigCache } from "../config"

const cwd = process.cwd()

afterEach(() => {
  process.chdir(cwd)
  resetToolkitConfigCache()
})

describe("loadToolkitConfig 向上查找", () => {
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
