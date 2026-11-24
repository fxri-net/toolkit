// 本机路径归一：默认关闭；开启后归一盘符与 POSIX 家目录，占位符不动且幂等
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { normalizeIfEnabled, normalizeLocalPaths, resolveLocalPathLevel } from "../privacy/paths"

let home = ""
let originalCwd = ""

// 写全局层配置：档位与其它用例互不影响
function writeConfig(config: unknown): void {
  writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify(config))
  resetToolkitConfigCache()
}

beforeEach(() => {
  originalCwd = process.cwd()
  home = mkdtempSync(join(tmpdir(), "fxts-tk-privacy-paths-"))
  setHomeDirForTest(home)
  // 切到临时目录：避免读到本仓 .toolkitrc.json 的项目层配置
  process.chdir(home)
  resetToolkitConfigCache()
})

afterEach(() => {
  vi.restoreAllMocks()
  process.chdir(originalCwd)
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  rmSync(home, { recursive: true, force: true })
})

describe("本机路径归一", () => {
  it("未配置时默认 off，写盘不做任何改动", () => {
    expect(resolveLocalPathLevel()).toBe("off")
    const text = "路径：D:\\Work\\demo\\toolkit，另见 /home/me/proj"
    expect(normalizeIfEnabled(text)).toEqual({ text, count: 0 })
  })

  it("开启后归一盘符与家目录路径，保留末段名", () => {
    writeConfig({ privacy: { localPaths: "warn" } })
    expect(resolveLocalPathLevel()).toBe("warn")
    const result = normalizeIfEnabled("D:\\Work\\demo\\toolkit 与 /home/me/proj 与 C:/Users/me/app")
    expect(result.text).toBe("<本机>/…/toolkit 与 ~/…/proj 与 <本机>/…/app")
    expect(result.count).toBe(3)
  })

  it("占位符与相对路径不命中", () => {
    const text = "见 <本机>/…/toolkit、~/…/proj、%USERPROFILE%\\app、docs/guide.md"
    expect(normalizeLocalPaths(text)).toEqual({ text, count: 0 })
  })

  it("通配规则与裸目录写法不归一", () => {
    const text = "规则示例：D:\\Work\\Dev-Space/**、/Users/*、/home/*、盘符、/Users/、home 实值"
    expect(normalizeLocalPaths(text)).toEqual({ text, count: 0 })
  })

  it("重复归一幂等：第二次不再命中", () => {
    const first = normalizeLocalPaths("D:\\Work\\demo\\toolkit")
    expect(first.count).toBe(1)
    expect(normalizeLocalPaths(first.text).count).toBe(0)
  })

  it("档位非法时告警并按 off 处理", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    writeConfig({ privacy: { localPaths: "strict" } })
    expect(resolveLocalPathLevel()).toBe("off")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("privacy.localPaths 取值非法"))
  })
})
