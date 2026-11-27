// 升级检查单测：配置频率 / 闸门 / registry 解析 / 缓存迁移 / 提示渠道 / 后台刷新
// 网络与子进程全部注入 mock，tmp 与 home 重定向到独立沙箱，全程不触网、不派生真实进程
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest"
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { resetToolkitConfigCache } from "../config"

const sandbox = vi.hoisted(() => {
  const base = (process.env.TEMP || process.env.TMP || "/tmp").replace(/[\\/]+$/, "")
  return `${base}/fxts-tk-upd-sandbox-${process.pid.toString(36)}`
})
const HOME = `${sandbox}/home`
const WORK = `${sandbox}/work`

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>()
  return { ...actual, tmpdir: () => sandbox, homedir: () => HOME }
})

vi.mock("../version", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../version")>()
  return { ...actual, fetchLatestVersion: vi.fn() }
})

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, spawn: vi.fn() }
})

import {
  buildRegistryUrl,
  dismissSkillAlerts,
  emitVersionHint,
  formatUpdateHint,
  isCiEnv,
  markNotified,
  readCachedLatest,
  readHintTiming,
  resolveNotify,
  resolveRegistry,
  runUpdateCheckWorker,
  shouldShowUpdateHint,
  UPDATE_CHECK_WORKER_ARG,
} from "../update-check"
import { fetchLatestVersion, versionGt } from "../version"
import { spawn } from "node:child_process"

mkdirSync(HOME, { recursive: true })
mkdirSync(join(HOME, ".toolkit", "cache"), { recursive: true })
mkdirSync(WORK, { recursive: true })

const mockedFetch = vi.mocked(fetchLatestVersion)
const mockedSpawn = vi.mocked(spawn)
const cacheFile = join(HOME, ".toolkit", "cache", "update-check.json")
// 旧版缓存落点：仅用于迁移用例，正常读取应落到 cacheFile
const legacyCacheFile = join(sandbox, ".toolkit-update-check.json")
const originalCwd = process.cwd()
const HOUR = 60 * 60 * 1000
let unrefSpy: (...args: unknown[]) => void

// 捕获 stdout / stderr / warn：提示渠道断言共用
function captureOutput(): { err: string[]; log: string[]; warn: string[] } {
  const err: string[] = []
  const log: string[] = []
  const warn: string[] = []
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => err.push(a.join(" ")))
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => log.push(a.join(" ")))
  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => warn.push(a.join(" ")))
  return { err, log, warn }
}

// 写缓存：默认带新鲜成功时间，避免用例意外触发后台刷新
function writeCache(data: Record<string, unknown>): void {
  writeFileSync(cacheFile, JSON.stringify({ latest: "", notifiedAt: {}, ...data }), "utf8")
}

function writeOkCache(latest: string, lastCheckedAt = Date.now()): void {
  writeCache({ latest, lastCheckedAt })
}

function useConfig(config: Record<string, unknown>): void {
  writeFileSync(join(WORK, ".toolkitrc.json"), JSON.stringify(config), "utf8")
  resetToolkitConfigCache()
}

function useProjectNpmrc(content: string): void {
  writeFileSync(join(WORK, ".npmrc"), content, "utf8")
}

// 全局层配置：可信名单只认个人层，测试必须写到 HOME 下的 .toolkitrc.json
function useGlobalConfig(config: Record<string, unknown>): void {
  writeFileSync(join(HOME, ".toolkitrc.json"), JSON.stringify(config), "utf8")
  resetToolkitConfigCache()
}

beforeEach(() => {
  unrefSpy = vi.fn()
  mockedSpawn.mockReturnValue({ unref: unrefSpy } as unknown as ReturnType<typeof spawn>)
  process.chdir(WORK)
  delete process.env.FX_TOOLKIT_NO_UPDATE_CHECK
  delete process.env.CI
  delete process.env.npm_lifecycle_event
  delete process.env.npm_config_registry
  delete process.env.NPM_TOKEN
  resetToolkitConfigCache()
  Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true })
  rmSync(cacheFile, { force: true })
  rmSync(legacyCacheFile, { force: true })
  for (const file of [join(WORK, ".toolkitrc.json"), join(WORK, ".npmrc"), join(HOME, ".npmrc"), join(HOME, ".toolkitrc.json")]) {
    rmSync(file, { force: true })
  }
})

afterEach(() => {
  process.chdir(originalCwd)
  resetToolkitConfigCache()
  vi.restoreAllMocks()
  mockedFetch.mockReset()
  mockedSpawn.mockReset()
  rmSync(cacheFile, { force: true })
  rmSync(legacyCacheFile, { force: true })
  for (const file of [join(WORK, ".toolkitrc.json"), join(WORK, ".npmrc"), join(HOME, ".npmrc"), join(HOME, ".toolkitrc.json")]) {
    rmSync(file, { force: true })
  }
})

afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

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

describe("isCiEnv 与 resolveNotify", () => {
  it("CI 真假口径：0/false/off/no 视为非 CI", () => {
    expect(isCiEnv()).toBe(false)
    process.env.CI = "1"
    expect(isCiEnv()).toBe(true)
    process.env.CI = "0"
    expect(isCiEnv()).toBe(false)
    process.env.CI = "false"
    expect(isCiEnv()).toBe(false)
  })

  it("频率默认 always，支持通道与来源覆盖，非法值告警回落", () => {
    expect(resolveNotify("cli")).toBe("always")
    useConfig({ updateCheck: { notify: "daily", channels: { cli: { notify: "weekly" }, externalSkills: { notify: "daily" } }, sources: { play: { notify: "off" } } } })
    expect(resolveNotify("cli")).toBe("weekly")
    expect(resolveNotify("external", "other")).toBe("daily")
    expect(resolveNotify("external", "play")).toBe("off")
    const out = captureOutput()
    useConfig({ updateCheck: { notify: "oops" } })
    expect(resolveNotify("cli")).toBe("always")
    expect(out.warn.join("\n")).toContain("updateCheck.notify")
  })
})

describe("resolveRegistry 与 buildRegistryUrl", () => {
  it("默认公网地址；项目 .npmrc、环境变量、配置逐级覆盖", () => {
    expect(resolveRegistry()).toMatchObject({ value: "https://registry.npmjs.org/", source: "default" })
    useProjectNpmrc("registry=https://project.example/\n")
    expect(resolveRegistry()).toMatchObject({ value: "https://project.example/", source: "npmrc-project" })
    rmSync(join(WORK, ".npmrc"), { force: true })
    writeFileSync(join(HOME, ".npmrc"), "registry=https://home.example/\n", "utf8")
    expect(resolveRegistry()).toMatchObject({ value: "https://home.example/", source: "npmrc-home" })
    process.env.npm_config_registry = "https://env.example/"
    expect(resolveRegistry()).toMatchObject({ value: "https://env.example/", source: "npm_config_registry" })
    useConfig({ updateCheck: { registry: "https://config.example/npm/" } })
    expect(resolveRegistry()).toMatchObject({ value: "https://config.example/npm/", source: "config" })
  })

  it("registry 接受明文 http 并告警，不再回落丢弃", () => {
    useProjectNpmrc("registry=http://insecure.example/\n")
    const out = captureOutput()
    expect(resolveRegistry()).toMatchObject({ value: "http://insecure.example/", source: "npmrc-project" })
    expect(out.warn.join("\n")).toContain("明文 HTTP")
  })

  it("registry 含账号密码时剥离并告警", () => {
    useConfig({ updateCheck: { registry: "https://user:pass@example.com/" } })
    const out = captureOutput()
    const info = resolveRegistry()
    expect(info.value).toBe("https://example.com/")
    expect(info.value).not.toContain("user")
    expect(out.warn.join("\n")).toContain("账号密码")
  })

  it("构造 latest 地址时保留 registry 路径前缀并编码 scoped 包名", () => {
    expect(buildRegistryUrl("https://example.com/npm/")).toBe("https://example.com/npm/@fxri%2Ftoolkit/latest")
  })
})

describe("缓存读取与提示闸门", () => {
  it("读取新结构与旧结构缓存；旧失败缓存无版本返回 null", () => {
    writeOkCache("9.9.9")
    expect(readCachedLatest()).toBe("9.9.9")
    writeFileSync(cacheFile, JSON.stringify({ ts: Date.now(), ok: true, latest: "8.8.8" }), "utf8")
    expect(readCachedLatest()).toBe("8.8.8")
    writeFileSync(cacheFile, JSON.stringify({ ts: Date.now(), ok: false, latest: "" }), "utf8")
    expect(readCachedLatest()).toBeNull()
  })

  it("旧 tmp 缓存惰性迁移到 ~/.toolkit/cache", () => {
    writeFileSync(legacyCacheFile, JSON.stringify({ latest: "9.9.9", notifiedAt: {}, lastCheckedAt: Date.now() }), "utf8")
    expect(readCachedLatest()).toBe("9.9.9")
    expect(existsSync(cacheFile)).toBe(true)
    expect(existsSync(legacyCacheFile)).toBe(false)
  })

  it("关闭开关时不读缓存", () => {
    writeOkCache("9.9.9")
    process.env.FX_TOOLKIT_NO_UPDATE_CHECK = "1"
    expect(readCachedLatest()).toBeNull()
    expect(shouldShowUpdateHint("cli", "1.0.0")).toBe(false)
  })

  it("CI / npm script 静默；CI=0 仍提示", () => {
    writeOkCache("9.9.9")
    process.env.CI = "1"
    expect(shouldShowUpdateHint("cli", "1.0.0")).toBe(false)
    process.env.CI = "0"
    expect(shouldShowUpdateHint("cli", "1.0.0")).toBe(true)
    process.env.npm_lifecycle_event = "test"
    expect(shouldShowUpdateHint("cli", "1.0.0")).toBe(false)
  })

  it("daily 首次提示后按窗口限频；always 不写 notifiedAt", () => {
    writeOkCache("9.9.9")
    useConfig({ updateCheck: { notify: "daily" } })
    expect(shouldShowUpdateHint("cli", "1.0.0")).toBe(true)
    markNotified("cli")
    expect(shouldShowUpdateHint("cli", "1.0.0")).toBe(false)
    useConfig({ updateCheck: { notify: "always" } })
    const before = JSON.parse(readFileSync(cacheFile, "utf8")).notifiedAt
    markNotified("cli")
    const after = JSON.parse(readFileSync(cacheFile, "utf8")).notifiedAt
    expect(after).toEqual(before)
  })

  it("builtin inherit：CLI 已落后时跳过，CLI 已最新时独立判断", () => {
    writeOkCache("9.9.9")
    expect(shouldShowUpdateHint("builtin", "1.0.0")).toBe(false)
    expect(shouldShowUpdateHint("builtin", "9.9.9")).toBe(true)
  })
})

describe("emitVersionHint 提示渠道与例外", () => {
  it("非 TTY 走 stdout，TTY 走 stderr", () => {
    writeOkCache("9.9.9")
    let out = captureOutput()
    emitVersionHint("1.0.0", { argv: ["task"], exitCode: 0 })
    expect(out.log.join("\n")).toContain("9.9.9")
    expect(out.err).toHaveLength(0)

    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true })
    out = captureOutput()
    emitVersionHint("1.0.0", { argv: ["task"], exitCode: 0 })
    expect(out.err.join("\n")).toContain("9.9.9")
    expect(out.log).toHaveLength(0)
  })

  it("--version / --check 只写 stderr；帮助、裸命令、skills status、changelog 透传、JSON 全部跳过", () => {
    writeOkCache("9.9.9")
    for (const argv of [["--version"], ["release", "mirror", "--check"]]) {
      const out = captureOutput()
      emitVersionHint("1.0.0", { argv, exitCode: 0 })
      expect(out.err.join("\n")).toContain("9.9.9")
      expect(out.log).toHaveLength(0)
    }
    for (const argv of [
      [],
      ["--help"],
      ["help", "tasks"],
      ["skill", "status"],
      ["skill", "status", "--path"],
      ["release", "changeset", "add"],
      ["release", "audit"],
      ["release", "status"],
      ["task", "export", "out.csv"],
      ["docs", "theme", "check"],
      ["task", "--format", "json"],
    ]) {
      const out = captureOutput()
      emitVersionHint("1.0.0", { argv, exitCode: 0 })
      expect(out.err).toHaveLength(0)
      expect(out.log).toHaveLength(0)
    }
  })

  it("非 0 退出不提示；文案为单句", () => {
    writeOkCache("9.9.9")
    const out = captureOutput()
    emitVersionHint("1.0.0", { argv: ["task", "check"], exitCode: 1 })
    expect(out.err).toHaveLength(0)
    expect(out.log).toHaveLength(0)
    expect(formatUpdateHint("9.9.9", "1.0.0").split("\n")).toHaveLength(1)
  })

  it("v1 升 2.x 先给本地入口、在线升级页标为可选，不直接给安装命令", () => {
    const hint = formatUpdateHint("2.0.0", "1.17.8")
    expect(hint).toContain("CHANGELOG.md")
    expect(hint).toContain("toolkit --help")
    expect(hint).toContain("可选补充")
    expect(hint).toContain("破坏性变更")
    expect(hint).not.toContain("pnpm add -g")
  })

  it("不可提示的命令不触发技能取证（惰性）", () => {
    writeOkCache("9.9.9")
    const provider = vi.fn(() => [])
    for (const argv of [[], ["--help"], ["help", "tasks"], ["skill", "status"], ["task", "--format", "json"]]) {
      captureOutput()
      emitVersionHint("1.0.0", { argv, exitCode: 0, skillAlerts: provider })
    }
    captureOutput()
    emitVersionHint("1.0.0", { argv: ["task"], exitCode: 1, skillAlerts: provider })
    expect(provider).not.toHaveBeenCalled()
  })

  it("可提示的命令才求值技能取证，且仅一次", () => {
    writeOkCache("1.0.0")
    const provider = vi.fn(() => [])
    captureOutput()
    emitVersionHint("1.0.0", { argv: ["task"], exitCode: 0, skillAlerts: provider })
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it("提示给出「当前 → 最新」，已尝试修复同一版本后不再提示，版本变化或 CLI 升级后恢复", () => {
    writeOkCache("1.0.0")
    const alert = { channel: "external" as const, source: "play", name: "fxri-x", current: "1.0.0", latest: "2.0.0" }
    let out = captureOutput()
    emitVersionHint("1.0.0", { argv: ["task"], exitCode: 0, skillAlerts: [alert] })
    expect(out.log.join("\n")).toContain("fxri-x 1.0.0 → 2.0.0")

    dismissSkillAlerts([alert], "1.0.0")
    out = captureOutput()
    emitVersionHint("1.0.0", { argv: ["task"], exitCode: 0, skillAlerts: [alert] })
    expect(out.log.join("\n")).not.toContain("fxri-x")

    // 来源版本变化：自动恢复提示
    out = captureOutput()
    emitVersionHint("1.0.0", { argv: ["task"], exitCode: 0, skillAlerts: [{ ...alert, latest: "2.0.1" }] })
    expect(out.log.join("\n")).toContain("2.0.1")

    // CLI 版本变化：旧记录整体失效
    dismissSkillAlerts([alert], "1.0.0")
    out = captureOutput()
    emitVersionHint("1.0.1", { argv: ["task"], exitCode: 0, skillAlerts: [alert] })
    expect(out.log.join("\n")).toContain("fxri-x")
  })

  it("诊断开关输出判定依据到 stderr，且不改变提示结果", () => {
    writeOkCache("1.0.0")
    process.env.FX_TOOLKIT_DEBUG_UPDATE_CHECK = "1"
    const out = captureOutput()
    emitVersionHint("1.0.0", { argv: ["skill", "status"], exitCode: 0, skillAlerts: [] })
    expect(out.err.join("\n")).toContain("[update-check] CLI 当前 1.0.0")
    expect(out.log).toHaveLength(0)
    delete process.env.FX_TOOLKIT_DEBUG_UPDATE_CHECK
  })

  it("readHintTiming：无缓存尚未检查、always 随时、off 已关闭", () => {
    expect(readHintTiming()).toMatchObject({ checkedAt: null, nextHintAt: 0 })
    writeOkCache("1.0.0", 1700000000000)
    expect(readHintTiming().checkedAt).toBe(1700000000000)
    useConfig({ updateCheck: { channels: { cli: { notify: "off" } } } })
    expect(readHintTiming().nextHintAt).toBeNull()
  })
})

describe("runUpdateCheckWorker 后台刷新", () => {
  it("查询成功：写 latest 与 lastCheckedAt", async () => {
    mockedFetch.mockResolvedValue("2.0.0")
    const out = captureOutput()
    await runUpdateCheckWorker()
    expect(out.err).toHaveLength(0)
    const data = JSON.parse(readFileSync(cacheFile, "utf8")) as { latest: string; lastCheckedAt?: number }
    expect(data.latest).toBe("2.0.0")
    expect(typeof data.lastCheckedAt).toBe("number")
  })

  it("查询失败：保留上次成功版本，只更新 lastFailedAt", async () => {
    writeOkCache("1.5.0", Date.now() - 25 * HOUR)
    mockedFetch.mockResolvedValue(null)
    await runUpdateCheckWorker()
    const data = JSON.parse(readFileSync(cacheFile, "utf8")) as { latest: string; lastFailedAt?: number }
    expect(data.latest).toBe("1.5.0")
    expect(typeof data.lastFailedAt).toBe("number")
  })

  it("无缓存且查询失败：写空版本与失败时间，不抛错", async () => {
    mockedFetch.mockRejectedValue(new Error("EAI_AGAIN"))
    await expect(runUpdateCheckWorker()).resolves.toBeUndefined()
    const data = JSON.parse(readFileSync(cacheFile, "utf8")) as { latest: string; lastFailedAt?: number }
    expect(data.latest).toBe("")
    expect(typeof data.lastFailedAt).toBe("number")
  })

  it("项目 .npmrc 控制的 registry 不附带任何凭据", async () => {
    useProjectNpmrc("registry=https://evil.example/\n//evil.example/:_authToken=planted\n")
    process.env.NPM_TOKEN = "secret"
    mockedFetch.mockResolvedValue("2.0.0")
    await runUpdateCheckWorker()
    expect(mockedFetch.mock.calls[0]?.[0]).toBe("https://evil.example/@fxri%2Ftoolkit/latest")
    expect(mockedFetch.mock.calls[0]?.[1]).toBeUndefined()
  })

  it("可信名单命中时附带凭据；项目层写入的名单被忽略", async () => {
    process.env.NPM_TOKEN = "secret"
    useGlobalConfig({ updateCheck: { trustedRegistries: ["npm.example"] } })
    useProjectNpmrc("registry=https://npm.example/\n")
    mockedFetch.mockResolvedValue("2.0.0")
    await runUpdateCheckWorker()
    expect(mockedFetch.mock.calls[0]?.[1]).toBe("secret")

    // 项目层把自己加入名单：忽略并告警，未命中个人层名单 → 不发
    useGlobalConfig({ updateCheck: { trustedRegistries: ["other.example"] } })
    useConfig({ updateCheck: { trustedRegistries: ["npm.example"] } })
    const out = captureOutput()
    await runUpdateCheckWorker()
    expect(mockedFetch.mock.calls[1]?.[1]).toBeUndefined()
    expect(out.warn.join("\n")).toContain("项目层")
  })

  it("用户主目录 .npmrc 的同 host 令牌在命中名单时可用", async () => {
    useGlobalConfig({ updateCheck: { trustedRegistries: ["home.example"] } })
    delete process.env.NPM_TOKEN
    writeFileSync(join(HOME, ".npmrc"), "registry=https://home.example/\n//home.example/:_authToken=home-token\n", "utf8")
    mockedFetch.mockResolvedValue("2.0.0")
    await runUpdateCheckWorker()
    expect(mockedFetch.mock.calls[0]?.[1]).toBe("home-token")
  })

  it("名单为 * 时任意地址都附带凭据，作为显式放行口子", async () => {
    useGlobalConfig({ updateCheck: { trustedRegistries: ["*"] } })
    process.env.NPM_TOKEN = "secret"
    useProjectNpmrc("registry=https://any.example/\n")
    mockedFetch.mockResolvedValue("2.0.0")
    await runUpdateCheckWorker()
    expect(mockedFetch.mock.calls[0]?.[1]).toBe("secret")
  })

  it("名单类型不符（非数组）时告警并忽略", async () => {
    useGlobalConfig({ updateCheck: { trustedRegistries: "npm.example" } })
    delete process.env.NPM_TOKEN
    useProjectNpmrc("registry=https://npm.example/\n")
    mockedFetch.mockResolvedValue("2.0.0")
    const out = captureOutput()
    await runUpdateCheckWorker()
    expect(out.warn.join("\n")).toContain("须为字符串数组")
    expect(mockedFetch.mock.calls[0]?.[1]).toBeUndefined()
  })

  it("名单含非法条目时告警并忽略", async () => {
    useGlobalConfig({ updateCheck: { trustedRegistries: ["", 123] } })
    process.env.NPM_TOKEN = "secret"
    useProjectNpmrc("registry=https://any.example/\n")
    mockedFetch.mockResolvedValue("2.0.0")
    const out = captureOutput()
    await runUpdateCheckWorker()
    expect(out.warn.join("\n")).toContain("非法条目")
    expect(mockedFetch.mock.calls[0]?.[1]).toBeUndefined()
  })

  it("latest 查询不跟随重定向，3xx 按失败处理", async () => {
    const actual = await vi.importActual<typeof import("../version")>("../version")
    const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } }),
    )
    vi.stubGlobal("fetch", fetchMock)
    try {
      await expect(actual.fetchLatestVersion("https://registry.npmjs.org/@fxri%2Ftoolkit/latest", "secret")).resolves.toBeNull()
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("worker 参数常量保持不变", () => {
    expect(UPDATE_CHECK_WORKER_ARG).toBe("--fxri-update-check-worker")
  })
})

describe("versionGt 版本比较口径", () => {
  it("段数不等按补零比较", () => {
    expect(versionGt("0.2", "0.2.0")).toBe(false)
    expect(versionGt("0.2.1", "0.2")).toBe(true)
    expect(versionGt("1.10.0", "1.9.9")).toBe(true)
  })

  it("预发布低于同号正式版，预发布之间按标识符比较", () => {
    expect(versionGt("0.2.6-beta", "0.2.6")).toBe(false)
    expect(versionGt("0.2.6", "0.2.6-beta")).toBe(true)
    expect(versionGt("0.2.6-beta.2", "0.2.6-beta.1")).toBe(true)
    expect(versionGt("0.2.6-beta", "0.2.6-alpha")).toBe(true)
  })

  it("忽略构建元数据", () => {
    expect(versionGt("0.2.6+build.2", "0.2.6")).toBe(false)
    expect(versionGt("0.2.7+build", "0.2.6")).toBe(true)
  })

  it("无法解析的版本一律不可比", () => {
    expect(versionGt("abc", "1.0.0")).toBe(false)
    expect(versionGt("1.0.0", "abc")).toBe(false)
  })
})
