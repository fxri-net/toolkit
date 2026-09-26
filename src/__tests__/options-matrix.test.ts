// 选项 × 子命令采纳矩阵（建议 ③）：逐条验证「显式传入的值要么被采纳、要么报错/告警」在总览与各子命令间口径一致
// ⚠️ cli.ts 顶层即执行主流程，无法被静态导入：每个用例重置模块注册表后动态 import ../cli 并 await 其导出的 cliReady
// 沙箱隔离：home 指向临时目录（skills 与配置），升级缓存经 mock 的 tmpdir 落沙箱，子进程派生注入 mock（不真跑进程）
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// 沙箱路径用 vi.hoisted 构造（mock 工厂早于模块顶层求值执行，不能引用未初始化的顶层变量）
const sandbox = vi.hoisted(() => {
  const base = (process.env.TEMP || process.env.TMP || "/tmp").replace(/[\\/]+$/, "")
  return `${base}/tk-matrix-sandbox-${process.pid.toString(36)}`
})

// tmpdir 重定向到沙箱：升级缓存文件落沙箱内，用例可精确预置 / 清理
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>()
  return { ...actual, tmpdir: () => sandbox }
})

// 子进程派生注入：避免单测真的拉起升级检查 worker
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, spawn: vi.fn() }
})

// 沙箱内固定路径
const homeDir = join(sandbox, "home")
// 始终不存在的任务目录：验证默认容错为空结果（--strict 才报错）
const missingTasksDir = join(sandbox, "missing-tasks")
// init 用例专用目录（会被真实创建，故与 missingTasksDir 分开）
const initTasksDir = join(sandbox, "init-tasks")
const cacheFile = join(sandbox, ".toolkit-update-check.json")

// CLI 单次运行结果：退出码 + 各输出通道（stdout 单独捕获，帮助/版本走 commander 的 writeOut）
interface CliRun {
  code: number
  log: string[]
  warn: string[]
  err: string[]
  out: string[]
}

const originalArgv = process.argv

// 跑一次 CLI：重置模块注册表 → 注入 home 与 argv → 动态导入 cli 并 await 主流程 → 收集输出
async function runCli(args: string[]): Promise<CliRun> {
  vi.resetModules()
  // 与 cli 内部共享同一模块实例：resetModules 后先导入 config，cli 的 import 会复用该实例
  const config = await import("../config")
  config.setHomeDirForTest(homeDir)
  config.resetToolkitConfigCache()
  const log: string[] = []
  const warn: string[] = []
  const err: string[] = []
  const out: string[] = []
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    log.push(a.join(" "))
  })
  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
    warn.push(a.join(" "))
  })
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    err.push(a.join(" "))
  })
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    out.push(typeof chunk === "string" ? chunk : String(chunk))
    return true
  }) as unknown as typeof process.stdout.write)
  process.argv = ["node", "toolkit", ...args]
  process.exitCode = 0
  const cli = await import("../cli")
  await cli.cliReady
  return { code: Number(process.exitCode ?? 0), log, warn, err, out }
}

beforeAll(() => {
  mkdirSync(sandbox, { recursive: true })
  mkdirSync(homeDir, { recursive: true })
})

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

beforeEach(() => {
  // CI 标记跳过技能链接自愈（skills.ts 的 autoLinkSkills），避免用例写盘到沙箱外
  process.env.CI = "1"
  // 默认关闭升级检查；缺陷 13 用例内单独删除该变量
  process.env.FX_NO_UPDATE_CHECK = "1"
})

afterEach(() => {
  delete process.env.CI
  delete process.env.FX_NO_UPDATE_CHECK
  process.argv = originalArgv
  process.exitCode = 0
  vi.restoreAllMocks()
  rmSync(cacheFile, { force: true })
})

describe("tasks 域 --status 取值采纳", () => {
  it("全部合法：采纳过滤，退出码 0 且无告警", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--status", "已完成,进行中"])
    expect(r.code).toBe(0)
    expect(r.err).toHaveLength(0)
    expect(r.warn.join("\n")).not.toContain("非法")
  })

  it("全部非法：报错退出且不产出结果", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--status", "bogus"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("全部取值非法")
    // 结果通道保持干净：报错后不再渲染总览
    expect(r.log).toHaveLength(0)
  })

  it("部分非法：告警剔除非法值后继续", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--status", "bogus,已完成"])
    expect(r.code).toBe(0)
    expect(r.warn.join("\n")).toContain("忽略非法状态值")
    expect(r.warn.join("\n")).toContain("bogus")
  })

  it("全部非法 + --format json：stdout 仍无结果输出", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--status", "bogus", "--format", "json"])
    expect(r.code).toBe(1)
    expect(r.log).toHaveLength(0)
  })

  it("stats 子命令与总览同口径：全部非法同样报错退出", async () => {
    const r = await runCli(["tasks", "stats", "--dir", missingTasksDir, "--status", "bogus"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("全部取值非法")
  })
})

describe("tasks 域其余选项与互斥", () => {
  it("--view 非法：总览与 stats 均报错退出", async () => {
    const overview = await runCli(["tasks", "--dir", missingTasksDir, "--view", "bogus"])
    expect(overview.code).toBe(1)
    expect(overview.err.join("\n")).toContain("非法视图")
    const stats = await runCli(["tasks", "stats", "--dir", missingTasksDir, "--view", "bogus"])
    expect(stats.code).toBe(1)
    expect(stats.err.join("\n")).toContain("非法视图")
  })

  it("--date 与 --since 互斥：报错退出", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--date", "2026-01-01", "--since", "2026-01-01"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("不能与")
  })

  it("--export 与 --format 互斥：报错退出", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--export", join(sandbox, "out.csv"), "--format", "json"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("不能同时使用")
  })

  it("--format 非 json：报错退出", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--format", "yaml"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("仅支持 json")
  })

  it("非法子命令：报错退出且不静默回落总览", async () => {
    const r = await runCli(["tasks", "bogus", "--dir", missingTasksDir])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("非法子命令")
    expect(r.log).toHaveLength(0)
  })

  it("--strict 目录不存在报错退出；默认容错为空结果", async () => {
    const strict = await runCli(["tasks", "--dir", missingTasksDir, "--strict"])
    expect(strict.code).toBe(1)
    expect(strict.err.join("\n")).toContain("任务目录不存在")
    const lenient = await runCli(["tasks", "--dir", missingTasksDir])
    expect(lenient.code).toBe(0)
  })

  it("--import 独立模式：与 --export 同用报错退出", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--import", join(sandbox, "a.csv"), "--export", join(sandbox, "b.csv")])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("独立模式")
  })

  it("--import 非法目标：报错退出", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--import", join(sandbox, "a.csv"), "--target", "bogus"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("非法导入目标")
  })

  it("--import 源文件不存在：报错退出", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--import", join(sandbox, "nope.csv")])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("导入失败")
  })
})

describe("顶层命令与外部域", () => {
  it("--version：退出码 0 且输出版本号", async () => {
    const r = await runCli(["--version"])
    expect(r.code).toBe(0)
    expect(r.out.join("")).toMatch(/\d+\.\d+\.\d+/)
  })

  it("--help：退出码 0 且输出中文帮助", async () => {
    const r = await runCli(["--help"])
    expect(r.code).toBe(0)
    expect(r.out.join("")).toContain("显示帮助")
  })

  it("未知选项：退出码 1 且中文提示", async () => {
    const r = await runCli(["--bogus"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("未知选项")
  })

  it("未知命令：退出码 1 且中文提示", async () => {
    const r = await runCli(["boguscmd"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("未知命令")
  })

  it("skills path：输出存在的包根目录", async () => {
    const r = await runCli(["skills", "path"])
    expect(r.code).toBe(0)
    expect(existsSync(r.log.join(""))).toBe(true)
  })

  it("skills path --format json：带 schemaVersion 与技能清单", async () => {
    const r = await runCli(["skills", "path", "--format", "json"])
    expect(r.code).toBe(0)
    const payload = JSON.parse(r.log.join("\n")) as { schemaVersion: number; skills: string[] }
    expect(payload.schemaVersion).toBe(1)
    expect(Array.isArray(payload.skills)).toBe(true)
  })

  it("skills status：退出码 0", async () => {
    const r = await runCli(["skills", "status"])
    expect(r.code).toBe(0)
  })

  it("skills install --dry-run：退出码 0 且标注预演", async () => {
    const r = await runCli(["skills", "install", "--dry-run"])
    expect(r.code).toBe(0)
    expect(r.log.join("\n")).toContain("[预演]")
  })

  it("skills remove --dry-run：退出码 0", async () => {
    const r = await runCli(["skills", "remove", "--dry-run"])
    expect(r.code).toBe(0)
    expect(r.log.length).toBeGreaterThan(0)
  })

  it("conventions status：只读体检退出码 0", async () => {
    const r = await runCli(["conventions", "status", "--dir", missingTasksDir])
    expect(r.code).toBe(0)
  })

  it("init：在指定目录建出任务区骨架", async () => {
    const r = await runCli(["init", "--dir", initTasksDir])
    expect(r.code).toBe(0)
    expect(existsSync(join(initTasksDir, "active"))).toBe(true)
    expect(existsSync(join(initTasksDir, "archive"))).toBe(true)
  })
})

describe("升级检查在所有路径一致触发（缺陷 13）", () => {
  beforeEach(() => {
    // 打开升级检查：其余路径（帮助 / 解析失败 / 业务失败）都应读到缓存并提示
    delete process.env.FX_NO_UPDATE_CHECK
  })

  it("帮助 / 业务失败 / 解析失败三条路径均读到升级提示", async () => {
    writeFileSync(cacheFile, JSON.stringify({ ts: Date.now(), ok: true, latest: "99.0.0" }), "utf8")
    const helper = await runCli(["--help"])
    expect(helper.code).toBe(0)
    expect(helper.err.join("\n")).toContain("99.0.0")

    const bizFail = await runCli(["tasks", "--dir", missingTasksDir, "--status", "bogus"])
    expect(bizFail.code).toBe(1)
    expect(bizFail.err.join("\n")).toContain("99.0.0")

    const parseFail = await runCli(["tasks", "--dir", missingTasksDir, "--view", "bogus"])
    expect(parseFail.code).toBe(1)
    expect(parseFail.err.join("\n")).toContain("99.0.0")
  })
})
