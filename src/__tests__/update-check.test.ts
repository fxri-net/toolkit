// 升级检查单测：版本比较、父进程同步分支（缓存命中提示 / 缓存过期派生 worker）、后台 worker 写缓存、开关与静默失败
// 网络请求与子进程派生均注入 mock，tmp 目录重定向到独立沙箱目录，全程不触网、不派生真实进程
// 沙箱路径用 vi.hoisted 构造（mock 工厂早于模块顶层求值执行，不能引用未初始化的顶层变量）
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest"
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs"
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

// 子进程派生注入：避免单测真的拉起 node 进程
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, spawn: vi.fn() }
})

import { startUpdateCheck, runUpdateCheckWorker, UPDATE_CHECK_WORKER_ARG } from "../update-check"
import { fetchLatestVersion, versionGt } from "../version"
import { spawn } from "node:child_process"

// 建沙箱目录（update-check 写缓存时会经 mock 的 tmpdir() 落到沙箱内）
mkdirSync(sandbox, { recursive: true })

const mockedFetch = vi.mocked(fetchLatestVersion)
const mockedSpawn = vi.mocked(spawn)
const cacheFile = join(sandbox, ".toolkit-update-check.json")
// 成功/负缓存的有效窗口
const HOUR = 60 * 60 * 1000
// 子进程 unref 的观测点：父进程必须解除对 worker 的引用，否则自身无法立即退出
let unrefSpy: (...args: unknown[]) => void

// spawn 返回伪子进程对象，避免单测触碰真实进程
beforeEach(() => {
  unrefSpy = vi.fn()
  mockedSpawn.mockReturnValue({ unref: unrefSpy } as unknown as ReturnType<typeof spawn>)
})

afterEach(() => {
  delete process.env.FX_NO_UPDATE_CHECK
  resetToolkitConfigCache()
  vi.restoreAllMocks()
  rmSync(cacheFile, { force: true })
  mockedFetch.mockReset()
  mockedSpawn.mockReset()
})

afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

// 捕获诊断输出（stderr）与 stdout：升级提示必须只走 stderr，stdout 留给机器可读输出
function captureOutput(): { err: string[]; log: string[] } {
  const err: string[] = []
  const log: string[] = []
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => err.push(a.join(" ")))
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => log.push(a.join(" ")))
  return { err, log }
}

// 写入成功缓存（ts 可指定以模拟过期）
function writeOkCache(latest: string, ts = Date.now()): void {
  writeFileSync(cacheFile, JSON.stringify({ ts, ok: true, latest }), "utf8")
}

// 写入负缓存（查询失败记录，无版本号）
function writeFailCache(ts = Date.now()): void {
  writeFileSync(cacheFile, JSON.stringify({ ts, ok: false, latest: "" }), "utf8")
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

describe("startUpdateCheck 父进程分支", () => {
  it("命中成功缓存且落后：提示走 stderr、stdout 干净，不派生 worker", () => {
    writeOkCache("9.9.9")
    const out = captureOutput()
    startUpdateCheck("1.6.5")
    expect(out.err.join("\n")).toContain("9.9.9")
    expect(out.log).toHaveLength(0)
    expect(mockedSpawn).not.toHaveBeenCalled()
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it("命中成功缓存且不落后：不提示不派生", () => {
    writeOkCache("1.6.5")
    const out = captureOutput()
    startUpdateCheck("1.6.5")
    expect(out.err).toHaveLength(0)
    expect(out.log).toHaveLength(0)
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  it("缓存带 BOM 时仍能识别：按命中处理，不派生 worker", () => {
    writeFileSync(cacheFile, `\uFEFF${JSON.stringify({ ts: Date.now(), ok: true, latest: "9.9.9" })}`, "utf8")
    const out = captureOutput()
    startUpdateCheck("1.6.5")
    expect(out.err.join("\n")).toContain("9.9.9")
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  it("无缓存：同步返回不提示，派生后台 worker 且解除引用（父进程零网络）", () => {
    const out = captureOutput()
    startUpdateCheck("1.6.5")
    expect(out.err).toHaveLength(0)
    // 父进程不参与联网，联网只发生在派生出的 worker 中
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    expect(mockedSpawn.mock.calls[0][1]).toContain(UPDATE_CHECK_WORKER_ARG)
    expect(mockedSpawn.mock.calls[0][2]).toMatchObject({ detached: true, stdio: "ignore", windowsHide: true })
    expect(unrefSpy).toHaveBeenCalledTimes(1)
  })

  it("成功缓存过期：清理缓存并派生 worker", () => {
    writeOkCache("9.9.9", Date.now() - 25 * HOUR)
    const out = captureOutput()
    startUpdateCheck("1.6.5")
    expect(out.err).toHaveLength(0)
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    expect(existsSync(cacheFile)).toBe(false)
  })

  it("负缓存未过期：不提示且不重复派生（抑制离线环境频繁联网）", () => {
    writeFailCache(Date.now() - 30 * 60 * 1000)
    const out = captureOutput()
    startUpdateCheck("1.6.5")
    expect(out.err).toHaveLength(0)
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  it("负缓存过期：派生 worker 重试", () => {
    writeFailCache(Date.now() - 2 * HOUR)
    startUpdateCheck("1.6.5")
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
  })

  it("缓存损坏：不抛错并按无缓存处理，派生 worker", () => {
    writeFileSync(cacheFile, "{ 不是合法 JSON", "utf8")
    const out = captureOutput()
    expect(() => startUpdateCheck("1.6.5")).not.toThrow()
    expect(out.err).toHaveLength(0)
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
  })

  it("环境变量 FX_NO_UPDATE_CHECK=1：关闭检查，不提示不派生", () => {
    process.env.FX_NO_UPDATE_CHECK = "1"
    writeOkCache("9.9.9")
    const out = captureOutput()
    startUpdateCheck("1.6.5")
    expect(out.err).toHaveLength(0)
    expect(out.log).toHaveLength(0)
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  it("配置 updateCheck.enabled=false：关闭检查，不提示不派生", () => {
    const cwd = process.cwd()
    writeFileSync(join(sandbox, ".toolkitrc.json"), JSON.stringify({ updateCheck: { enabled: false } }), "utf8")
    process.chdir(sandbox)
    resetToolkitConfigCache()
    try {
      writeOkCache("9.9.9")
      const out = captureOutput()
      startUpdateCheck("1.6.5")
      expect(out.err).toHaveLength(0)
      expect(out.log).toHaveLength(0)
      expect(mockedSpawn).not.toHaveBeenCalled()
    } finally {
      process.chdir(cwd)
      rmSync(join(sandbox, ".toolkitrc.json"), { force: true })
    }
  })
})

describe("runUpdateCheckWorker 后台刷新", () => {
  it("查询成功：写成功缓存（带版本号）且不产生输出", async () => {
    mockedFetch.mockResolvedValue("2.0.0")
    const out = captureOutput()
    await runUpdateCheckWorker()
    expect(out.err).toHaveLength(0)
    expect(out.log).toHaveLength(0)
    const data = JSON.parse(readFileSync(cacheFile, "utf8")) as { ok: boolean; latest: string }
    expect(data).toMatchObject({ ok: true, latest: "2.0.0" })
  })

  it("查询返回空（registry 异常）：写负缓存，抑制短期重复请求", async () => {
    mockedFetch.mockResolvedValue(null)
    await runUpdateCheckWorker()
    const data = JSON.parse(readFileSync(cacheFile, "utf8")) as { ok: boolean; latest: string }
    expect(data).toMatchObject({ ok: false, latest: "" })
  })

  it("查询异常（网络失败）：静默写负缓存，不抛错", async () => {
    mockedFetch.mockRejectedValue(new Error("EAI_AGAIN"))
    await expect(runUpdateCheckWorker()).resolves.toBeUndefined()
    const data = JSON.parse(readFileSync(cacheFile, "utf8")) as { ok: boolean }
    expect(data.ok).toBe(false)
  })
})
