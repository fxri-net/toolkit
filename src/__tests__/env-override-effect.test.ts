// 环境变量覆盖组「生效」锚点：逐项验证 CONFIG_ENV_OVERRIDES 声明的 env 名确实改变其目标键的解析结果
// 既有不变式只锚「覆盖组目标键 ⊆ 展示键清单」的集合关系，env 名与真实消费点脱钩（改名、换键）不会被发现，故逐项走真实消费点
// 现场：项目层配置写反值作对照，再置 env 断言结果翻转——证明 env 优先于文件且确被消费
// 沙箱：cwd 与 home 均指向临时目录（不读真实用户配置），tmpdir 重定向（升级检查缓存），子进程派生注入 mock
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// 沙箱路径用 vi.hoisted 构造（mock 工厂早于模块顶层求值执行，不能引用未初始化的顶层变量）
const sandbox = vi.hoisted(() => {
  const base = (process.env.TEMP || process.env.TMP || "/tmp").replace(/[\\/]+$/, "")
  return `${base}/tk-envfx-sandbox-${process.pid.toString(36)}`
})

// tmpdir 重定向：升级检查缓存落沙箱内，对照组的「无缓存即派生 worker」不被宿主机残留缓存干扰
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>()
  return { ...actual, tmpdir: () => sandbox }
})

// 子进程派生注入：只观测是否派生后台 worker，不真拉起进程
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, spawn: vi.fn() }
})

import { spawn } from "node:child_process"
import { CONFIG_ENV_OVERRIDES, getConfigSection, resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { resolveEnabled } from "../switch"
import { resolveRedactEnabled } from "../privacy/redact"
import { startUpdateCheck } from "../update-check"

// 会被本文件读到的环境变量：逐条清空 / 还原，避免宿主机环境串味
const ENV_KEYS = ["FX_REDACT", "FX_NO_UPDATE_CHECK", "FX_CHECK_WARN"]
const savedEnv: Record<string, string | undefined> = {}
const originalCwd = process.cwd()
// 项目层配置落点（cwd 即配置查找起点）与全局层 home 落点，两者互为兄弟目录，避免相互命中
const projectDir = join(sandbox, "project")
const homeDir = join(sandbox, "home")
const mockedSpawn = vi.mocked(spawn)

// 取覆盖组内某目标键的条目：env 名从真源常量取，测试内不重写映射
function overrideOf(key: string): { env: string; key: string } {
  const item = CONFIG_ENV_OVERRIDES.find((i) => i.key === key)
  if (!item) throw new Error(`CONFIG_ENV_OVERRIDES 缺少目标键：${key}`)
  return item
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  mkdirSync(projectDir, { recursive: true })
  mkdirSync(homeDir, { recursive: true })
  setHomeDirForTest(homeDir)
  process.chdir(projectDir)
  resetToolkitConfigCache()
  mockedSpawn.mockReset()
  mockedSpawn.mockReturnValue({ unref: vi.fn() } as unknown as ReturnType<typeof spawn>)
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  process.chdir(originalCwd)
  setHomeDirForTest(undefined)
  rmSync(join(projectDir, ".toolkitrc.json"), { force: true })
  resetToolkitConfigCache()
})

afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

// 写项目层配置并失效缓存：使随后的解析读到本次写入的文件值
function useProjectConfig(config: object): void {
  writeFileSync(join(projectDir, ".toolkitrc.json"), JSON.stringify(config), "utf8")
  resetToolkitConfigCache()
}

describe("环境变量覆盖组：置 env 后目标键解析结果确实改变", () => {
  it("FX_REDACT 覆盖 redact.enabled：文件写开启、env 置 0 则解析为关闭", () => {
    const { env } = overrideOf("redact.enabled")
    useProjectConfig({ redact: { enabled: true } })
    // 对照组：无 env 时取文件值
    expect(resolveRedactEnabled(undefined)).toBe(true)
    process.env[env] = "0"
    expect(resolveRedactEnabled(undefined)).toBe(false)
  })

  it("FX_CHECK_WARN 覆盖 check.warnings：文件写关闭、env 置 1 则解析为开启", () => {
    const { env } = overrideOf("check.warnings")
    useProjectConfig({ check: { warnings: false } })
    // 与 cli.ts 同形调用：env 名取自覆盖组，文件值取自配置层
    const configured = (): boolean | undefined => getConfigSection("check")?.warnings as boolean | undefined
    expect(resolveEnabled(undefined, env, configured(), true)).toBe(false)
    process.env[env] = "1"
    expect(resolveEnabled(undefined, env, configured(), true)).toBe(true)
  })

  it("FX_NO_UPDATE_CHECK 覆盖 updateCheck.enabled：文件写开启、env 置 1 则关闭升级检查", () => {
    const { env } = overrideOf("updateCheck.enabled")
    useProjectConfig({ updateCheck: { enabled: true } })
    // 对照组：无 env 时检查照常跑（无缓存 → 派生后台 worker）
    startUpdateCheck("1.0.0")
    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    mockedSpawn.mockClear()
    process.env[env] = "1"
    startUpdateCheck("1.0.0")
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  it("覆盖组逐项均有生效断言：新增条目未补用例即失败", () => {
    const covered = ["FX_REDACT", "FX_NO_UPDATE_CHECK", "FX_CHECK_WARN"].sort()
    expect(CONFIG_ENV_OVERRIDES.map((item) => item.env).sort()).toEqual(covered)
  })
})
