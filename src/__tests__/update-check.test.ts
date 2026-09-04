// 升级检查单测：版本比较、开关三档、缓存窗口与静默失败
// 网络请求注入 mock，tmp 目录重定向到独立沙箱目录，全程不触网
// 沙箱路径用 vi.hoisted 构造（mock 工厂早于模块顶层求值执行，不能引用未初始化的顶层变量）
import { describe, it, expect, vi, afterEach, afterAll } from "vitest"
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import { resetToolkitConfigCache } from "../config"

// 在系统临时目录下构造独立沙箱路径（仅字符串运算，不依赖被 mock 的模块）
const sandbox = vi.hoisted(() => {
  const base = (process.env.TEMP || process.env.TMP || "/tmp").replace(/[\\/]+$/, "")
  return `${base}/tk-upd-sandbox-${process.pid.toString(36)}`
})
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>()
  return { ...actual, tmpdir: () => sandbox }
})

// 网络请求注入：fetchLatestVersion 可控返回
vi.mock("../version", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../version")>()
  return { ...actual, fetchLatestVersion: vi.fn() }
})

import { startUpdateCheck } from "../update-check"
import { fetchLatestVersion, versionGt } from "../version"

// 建沙箱目录（update-check 写缓存时会经 mock 的 tmpdir() 落到沙箱内）
mkdirSync(sandbox, { recursive: true })

const mockedFetch = vi.mocked(fetchLatestVersion)
const cacheFile = join(sandbox, ".toolkit-update-check.json")

afterEach(() => {
  delete process.env.FX_NO_UPDATE_CHECK
  resetToolkitConfigCache()
  vi.restoreAllMocks()
  rmSync(cacheFile, { force: true })
  mockedFetch.mockReset()
})

afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

// 捕获 console.log 输出
function captureLog(): string[] {
  const lines: string[] = []
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => lines.push(a.join(" ")))
  return lines
}

// 写入缓存窗口内的缓存
function writeCache(latest: string): void {
  writeFileSync(cacheFile, JSON.stringify({ ts: Date.now(), latest }), "utf8")
}

describe("versionGt 版本比较", () => {
  it.each([
    ["2.0.0", "1.9.9", true],
    ["1.10.0", "1.9.0", true],
    ["1.6.5", "1.6.5", false],
    ["1.6.5", "2.0.0", false],
    ["1.7.0-beta.1", "1.6.9", true],
    ["abc", "1.0.0", false],
  ])("%s > %s → %s", (a, b, expected) => {
    expect(versionGt(a, b)).toBe(expected)
  })
})

describe("startUpdateCheck", () => {
  it("缓存窗口内命中且落后：直接提示，不请求网络", async () => {
    writeCache("9.9.9")
    const lines = captureLog()
    await startUpdateCheck("1.6.5")
    expect(lines.join("\n")).toContain("9.9.9")
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it("缓存窗口内命中且不落后：不提示不请求", async () => {
    writeCache("1.6.5")
    const lines = captureLog()
    await startUpdateCheck("1.6.5")
    expect(lines).toHaveLength(0)
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it("无缓存且查询到新版本：提示并写缓存", async () => {
    mockedFetch.mockResolvedValue("2.0.0")
    const lines = captureLog()
    await startUpdateCheck("1.6.5")
    expect(lines.join("\n")).toContain("2.0.0")
    expect(existsSync(cacheFile)).toBe(true)
  })

  it("查询失败（网络异常）：静默无输出", async () => {
    mockedFetch.mockRejectedValue(new Error("EAI_AGAIN"))
    const lines = captureLog()
    await expect(startUpdateCheck("1.6.5")).resolves.toBeUndefined()
    expect(lines).toHaveLength(0)
  })

  it("查询返回空（registry 异常）：静默无输出", async () => {
    mockedFetch.mockResolvedValue(null)
    const lines = captureLog()
    await startUpdateCheck("1.6.5")
    expect(lines).toHaveLength(0)
  })

  it("环境变量 FX_NO_UPDATE_CHECK=1：关闭检查不请求", async () => {
    process.env.FX_NO_UPDATE_CHECK = "1"
    const lines = captureLog()
    await startUpdateCheck("1.6.5")
    expect(lines).toHaveLength(0)
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it("配置 updateCheck.enabled=false：关闭检查不请求", async () => {
    const cwd = process.cwd()
    writeFileSync(join(sandbox, ".toolkitrc.json"), JSON.stringify({ updateCheck: { enabled: false } }), "utf8")
    process.chdir(sandbox)
    resetToolkitConfigCache()
    try {
      const lines = captureLog()
      await startUpdateCheck("1.6.5")
      expect(lines).toHaveLength(0)
      expect(mockedFetch).not.toHaveBeenCalled()
    } finally {
      process.chdir(cwd)
      rmSync(join(sandbox, ".toolkitrc.json"), { force: true })
    }
  })
})
