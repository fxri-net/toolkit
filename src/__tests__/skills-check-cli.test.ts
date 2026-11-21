// install --check：有漂移时退出码 1，收敛后退出码 0（供 CI 门禁消费）
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// 沙箱路径：home 指向临时目录，产物不外溢
const sandbox = vi.hoisted(() => {
  const base = (process.env.TEMP || process.env.TMP || "/tmp").replace(/[\\/]+$/, "")
  return `${base}/tk-check-sandbox-${process.pid.toString(36)}`
})
const home = join(sandbox, "home")
const originalArgv = process.argv

// 交互模块一旦被调用即失败：--check / --refresh 必须全程非交互
vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(async () => {
    throw new Error("不应触发交互")
  }),
  checkbox: vi.fn(async () => {
    throw new Error("不应触发交互")
  }),
}))

// 模拟 TTY：交互判据只看 stdin / stdout 的 isTTY
function setTty(value: boolean): void {
  for (const stream of [process.stdin, process.stdout]) Object.defineProperty(stream, "isTTY", { value, configurable: true })
}

function restoreTty(): void {
  for (const stream of [process.stdin, process.stdout]) Reflect.deleteProperty(stream, "isTTY")
}

// 跑一次 CLI：重置模块注册表 → 注入 home 与 argv → 动态导入 cli 并 await 主流程 → 收集退出码
async function runCli(args: string[]): Promise<{ code: number; log: string[]; warn: string[] }> {
  vi.resetModules()
  const config = await import("../config")
  config.setHomeDirForTest(home)
  config.resetToolkitConfigCache()
  const log: string[] = []
  const warn: string[] = []
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    log.push(a.join(" "))
  })
  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
    warn.push(a.join(" "))
  })
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(process.stdout, "write").mockImplementation((() => true) as unknown as typeof process.stdout.write)
  process.argv = ["node", "toolkit", ...args]
  process.exitCode = 0
  const cli = await import("../cli")
  await cli.cliReady
  return { code: Number(process.exitCode ?? 0), log, warn }
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
  restoreTty()
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

  it("TTY 下 --check / --refresh 不进入选择与确认交互", async () => {
    // 清掉上一用例安装的产物与选择集，制造「有漂移」现场
    rmSync(join(home, ".agents"), { recursive: true, force: true })
    rmSync(join(home, ".toolkitrc.json"), { force: true })
    setTty(true)
    const check = await runCli(["skills", "install", "--check", "--scope", "global"])
    expect(check.code).toBe(1)
    expect(check.log.join("\n")).toContain("待收敛")

    const refresh = await runCli(["skills", "install", "--scope", "project", "--refresh"])
    expect(refresh.code).toBe(0)
  })

  it("已登记但来源不可解析的条目计入待收敛，与 status 同口径", async () => {
    rmSync(join(home, ".agents"), { recursive: true, force: true })
    rmSync(join(home, ".toolkitrc.json"), { force: true })
    mkdirSync(join(home, ".agents"), { recursive: true })
    writeFileSync(
      join(home, ".agents", ".toolkit-skills.json"),
      JSON.stringify({
        format: "fxri.toolkit.skills-state",
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        sources: {
          ext: {
            kind: "local",
            version: "",
            temporary: false,
            root: "",
            targets: [
              {
                id: "primary",
                dir: join(home, ".agents", "skills"),
                label: "canonical",
                kind: "primary",
                entries: [{ name: "ghost-skill", version: "1.0.0", mode: "link" }],
              },
            ],
          },
        },
      }),
    )
    writeFileSync(
      join(home, ".toolkitrc.json"),
      JSON.stringify({ skillsInstall: { selection: { ext: ["ghost-skill"], toolkit: ["fxri-plan-to-task"] } } }),
    )

    const check = await runCli(["skills", "install", "--check", "--scope", "global"])
    expect(check.code).toBe(1)
    expect(check.log.join("\n")).toContain("ghost-skill")

    const status = await runCli(["skills", "status", "--scope", "global", "--format", "json"])
    const payload = JSON.parse(status.log.join("\n")) as { global: { pending: Array<{ name: string }> } }
    expect(payload.global.pending.some((item) => item.name === "ghost-skill")).toBe(true)
  })

  it("--refresh 忽略写选项时向 stderr 告警", async () => {
    const refresh = await runCli(["skills", "install", "--scope", "project", "--refresh", "--prune", "--force"])
    expect(refresh.code).toBe(0)
    const warnings = refresh.warn.join("\n")
    expect(warnings).toContain("已忽略")
    expect(warnings).toContain("--prune")
    expect(warnings).toContain("--force")
  })
})
