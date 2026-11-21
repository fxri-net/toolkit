// install --check：有漂移时退出码 1，收敛后退出码 0（供 CI 门禁消费）
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

// 沙箱路径：home 指向临时目录，产物不外溢
const sandbox = vi.hoisted(() => {
  const base = (process.env.TEMP || process.env.TMP || "/tmp").replace(/[\\/]+$/, "")
  return `${base}/tk-check-sandbox-${process.pid.toString(36)}`
})
const home = join(sandbox, "home")
const originalArgv = process.argv

// 跑一次 CLI：重置模块注册表 → 注入 home 与 argv → 动态导入 cli 并 await 主流程 → 收集退出码
async function runCli(args: string[]): Promise<{ code: number; log: string[] }> {
  vi.resetModules()
  const config = await import("../config")
  config.setHomeDirForTest(home)
  config.resetToolkitConfigCache()
  const log: string[] = []
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    log.push(a.join(" "))
  })
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(process.stdout, "write").mockImplementation((() => true) as unknown as typeof process.stdout.write)
  process.argv = ["node", "toolkit", ...args]
  process.exitCode = 0
  const cli = await import("../cli")
  await cli.cliReady
  return { code: Number(process.exitCode ?? 0), log }
}

beforeAll(() => {
  mkdirSync(home, { recursive: true })
})

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

beforeEach(() => {
  process.env.CI = "1"
  process.env.FX_TOOLKIT_NO_UPDATE_CHECK = "1"
})

afterEach(() => {
  delete process.env.CI
  delete process.env.FX_TOOLKIT_NO_UPDATE_CHECK
  process.argv = originalArgv
  process.exitCode = 0
  vi.restoreAllMocks()
})

describe("install --check", () => {
  it("存在漂移时退出码 1，收敛后退出码 0", async () => {
    const drifted = await runCli(["skills", "install", "--check", "--scope", "global", "--yes"])
    expect(drifted.code).toBe(1)
    expect(drifted.log.join("\n")).toContain("待收敛")

    const installed = await runCli(["skills", "install", "--scope", "global", "--yes", "--all"])
    expect(installed.code).toBe(0)

    const clean = await runCli(["skills", "install", "--check", "--scope", "global", "--yes"])
    expect(clean.code).toBe(0)
    expect(clean.log.join("\n")).toContain("无待收敛项")
  })
})
