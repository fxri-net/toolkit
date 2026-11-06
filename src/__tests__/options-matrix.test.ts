// 选项 × 子命令采纳矩阵（建议 ③）：逐条验证「显式传入的值要么被采纳、要么报错/告警」在总览与各子命令间口径一致
// ⚠️ cli.ts 顶层即执行主流程，无法被静态导入：每个用例重置模块注册表后动态 import ../cli 并 await 其导出的 cliReady
// 沙箱隔离：home 指向临时目录（skills 与配置），升级缓存经 mock 的 tmpdir 落沙箱，子进程派生注入 mock（不真跑进程）
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

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

// 子进程派生注入：spawn 避免单测真的拉起升级检查 worker；spawnSync 避免 changelog 透传时真的调用 changesets 改仓库文件
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, spawn: vi.fn(), spawnSync: vi.fn(() => ({ status: 0 })) }
})

// 沙箱内固定路径
const homeDir = join(sandbox, "home")
// 始终不存在的任务目录：验证默认容错为空结果（--strict 才报错）
const missingTasksDir = join(sandbox, "missing-tasks")
// init 用例专用目录（会被真实创建，故与 missingTasksDir 分开）
const initTasksDir = join(sandbox, "init-tasks")
// config 用例专用起点目录（空目录，避免向上查找到仓库根）
const cfgDir = join(sandbox, "cfg-cwd")
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
  mkdirSync(cfgDir, { recursive: true })
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

  it("tasks export：写出文件并退出 0", async () => {
    const out = join(sandbox, "tasks-export.csv")
    const r = await runCli(["tasks", "export", out, "--dir", missingTasksDir])
    expect(r.code).toBe(0)
    expect(existsSync(out)).toBe(true)
  })

  it("--format 非 json：报错退出", async () => {
    const r = await runCli(["tasks", "--dir", missingTasksDir, "--format", "yaml"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("仅支持 json")
  })

  it("未知子命令：报错退出且不静默回落总览", async () => {
    const r = await runCli(["tasks", "bogus", "--dir", missingTasksDir])
    expect(r.code).toBe(1)
    expect(r.log).toHaveLength(0)
  })

  it("--strict 目录不存在报错退出；默认容错为空结果", async () => {
    const strict = await runCli(["tasks", "--dir", missingTasksDir, "--strict"])
    expect(strict.code).toBe(1)
    expect(strict.err.join("\n")).toContain("任务目录不存在")
    const lenient = await runCli(["tasks", "--dir", missingTasksDir])
    expect(lenient.code).toBe(0)
  })

  it("tasks import 非法目标：报错退出", async () => {
    const r = await runCli(["tasks", "import", join(sandbox, "a.csv"), "--dir", missingTasksDir, "--target", "bogus"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("非法导入目标")
  })

  it("tasks import 源文件不存在：报错退出", async () => {
    const r = await runCli(["tasks", "import", join(sandbox, "nope.csv"), "--dir", missingTasksDir])
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

  it("skills uninstall --dry-run：退出码 0", async () => {
    const r = await runCli(["skills", "uninstall", "--dry-run"])
    expect(r.code).toBe(0)
    expect(r.log.length).toBeGreaterThan(0)
  })

  it("conventions status：只读体检退出码 0", async () => {
    const r = await runCli(["conventions", "status", "--dir", missingTasksDir])
    expect(r.code).toBe(0)
  })

  it("conventions format --dir 不存在：报错并以非 0 退出码终止", async () => {
    const r = await runCli(["conventions", "format", "--dir", missingTasksDir])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("归一失败")
  })

  it("conventions format：预演不写盘 → 写盘归一 → 复跑返回 already-compact", async () => {
    const dir = join(sandbox, "fmt-tasks")
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(join(dir, "active", "202610"), { recursive: true })
    const file = join(dir, "active", "202610", "task.md")
    writeFileSync(file, "| a   | b |\n", "utf8")

    // 预演：报告改动但文件保持填充态
    const dry = await runCli(["conventions", "format", "--dir", dir, "--dry-run"])
    expect(dry.code).toBe(0)
    expect(dry.log.join("\n")).toContain("[预演]")
    expect(readFileSync(file, "utf8")).toBe("| a   | b |\n")

    // 写盘：填充收敛为紧凑形态
    const run = await runCli(["conventions", "format", "--dir", dir])
    expect(run.code).toBe(0)
    expect(readFileSync(file, "utf8")).toBe("| a | b |\n")

    // 复跑幂等：--format json 报告 already-compact
    const again = await runCli(["conventions", "format", "--dir", dir, "--format", "json"])
    expect(again.code).toBe(0)
    const payload = JSON.parse(again.log.join("\n")) as { status: string; changedFiles: number }
    expect(payload.status).toBe("already-compact")
    expect(payload.changedFiles).toBe(0)

    rmSync(dir, { recursive: true, force: true })
  })

  it("tasks normalize --help：--fix / --check 互斥说明可见", async () => {
    const group = await runCli(["tasks", "--help"])
    expect(group.code).toBe(0)
    // commander 按宽度折行，去掉全部空白后比对以规避换行差异
    expect(group.out.join("").replace(/\s+/g, "")).toContain("normalize[options]")

    const r = await runCli(["tasks", "normalize", "--help"])
    expect(r.code).toBe(0)
    const help = r.out.join("").replace(/\s+/g, "")
    expect(help).toContain("--fix")
    expect(help).toContain("只读检查（默认行为，与--fix互斥）")
  })

  it("changelog --lang 未知取值：告警回落默认语言，命令继续（F8）", async () => {
    const r = await runCli(["changelog", "--lang", "bogus"])
    expect(r.code).toBe(0)
    expect(r.warn.join("\n")).toContain("未知语言")
    expect(r.warn.join("\n")).toContain("bogus")
  })

  it("init：建出任务区骨架，且未安装全局技能时提示 toolkit skills install（N9）", async () => {
    // cwd 指到沙箱：init 以 process.cwd() 为 .gitignore 写入落点，不隔离会把忽略片段写进本仓库根
    vi.spyOn(process, "cwd").mockReturnValue(sandbox)
    const r = await runCli(["init", "--dir", initTasksDir])
    expect(r.code).toBe(0)
    expect(existsSync(join(initTasksDir, "active"))).toBe(true)
    expect(existsSync(join(initTasksDir, "archive"))).toBe(true)
    expect(r.log.join("\n")).toContain("toolkit skills install")
  })

  // ⚠️ 顺序约束：本例真实写入状态文件，须置于依赖「未安装」态的 init 用例之后
  it("skills install → status：健康目标折叠为「项正常」并点明「软链落点」（O7/F5）", async () => {
    const install = await runCli(["skills", "install"])
    expect(install.code).toBe(0)
    const status = await runCli(["skills", "status"])
    expect(status.code).toBe(0)
    const text = status.log.join("\n")
    expect(text).toContain("项正常")
    expect(text).toContain("软链落点")
  })
})

describe("tasks check 装配位：变更集缺前缀并入软告警", () => {
  it("缺前缀条目随 warn 清单输出且不阻断；--no-warn 时不计不报（装配位被摘除即失败）", async () => {
    // 对扫描函数打桩而非写真 .changeset 探针文件：探针文件会与并行执行的 warn-threshold.test.ts 抢同一目录造成偶发失败
    vi.doMock("../changelog/format", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../changelog/format")>()
      return { ...actual, findUntypedChangesetEntries: () => [{ file: ".changeset/probe.md", line: 1, count: 2 }] }
    })
    try {
      const on = await runCli(["tasks", "check", "--dir", missingTasksDir])
      expect(on.log.join("\n")).toContain("【warn】1 项")
      expect(on.log.join("\n")).toContain(".changeset/probe.md:1: 变更集条目缺类型前缀（本文件 2 条）")
      expect(on.code).toBe(0)

      const off = await runCli(["tasks", "check", "--dir", missingTasksDir, "--no-warn"])
      expect(off.log.join("\n")).not.toContain("缺类型前缀")
      expect(off.log.join("\n")).toContain("（软告警已关闭，warn 不展示）")
    } finally {
      vi.doUnmock("../changelog/format")
    }
  })
})

describe("升级检查提示收口（成功才提示，帮助 / 失败静默）", () => {
  beforeEach(() => {
    // 打开升级检查并清掉 CI / npm script 闸门：只验证命令路径规则
    delete process.env.FX_NO_UPDATE_CHECK
    delete process.env.CI
    delete process.env.npm_lifecycle_event
    delete process.env.npm_config_registry
    writeFileSync(cacheFile, JSON.stringify({ latest: "99.0.0", lastCheckedAt: Date.now(), notifiedAt: {} }), "utf8")
  })

  it("成功命令提示；帮助、业务失败、解析失败均不提示", async () => {
    const ok = await runCli(["tasks", "--dir", missingTasksDir])
    expect(ok.code).toBe(0)
    expect(ok.log.join("\n")).toContain("99.0.0")

    const helper = await runCli(["--help"])
    expect(helper.code).toBe(0)
    expect(helper.err.join("\n")).not.toContain("99.0.0")

    const bizFail = await runCli(["tasks", "--dir", missingTasksDir, "--status", "bogus"])
    expect(bizFail.code).toBe(1)
    expect(bizFail.err.join("\n")).not.toContain("99.0.0")

    const parseFail = await runCli(["tasks", "--dir", missingTasksDir, "--view", "bogus"])
    expect(parseFail.code).toBe(1)
    expect(parseFail.err.join("\n")).not.toContain("99.0.0")
  })

  it("--version 的 stdout 保持纯净，提示只走 stderr", async () => {
    const r = await runCli(["--version"])
    expect(r.code).toBe(0)
    expect(r.out.join("")).not.toContain("99.0.0")
    expect(r.err.join("\n")).toContain("99.0.0")
  })
})

describe("config 域只读体检", () => {
  it("config status --cwd：退出码 0 且文本含「查找起点」", async () => {
    const r = await runCli(["config", "status", "--cwd", cfgDir])
    expect(r.code).toBe(0)
    expect(r.log.join("\n")).toContain("查找起点")
  })

  it("config status --format json：可解析且带 schemaVersion 与公共字段", async () => {
    const r = await runCli(["config", "status", "--cwd", cfgDir, "--format", "json"])
    expect(r.code).toBe(0)
    const payload = JSON.parse(r.log.join("\n")) as { schemaVersion: number; warnings: number; levels: unknown[] }
    expect(payload.schemaVersion).toBe(1)
    expect(typeof payload.warnings).toBe("number")
    expect(Array.isArray(payload.levels)).toBe(true)
    // 顶层字段集合锁定：schemaVersion + 八个报告字段
    expect(Object.keys(JSON.parse(r.log.join("\n")))).toHaveLength(9)
  })

  it("--cwd 指向不存在路径：报错退出且不回落 process.cwd()", async () => {
    const r = await runCli(["config", "status", "--cwd", join(sandbox, "no-such-dir")])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("不存在或非目录")
    expect(r.log).toHaveLength(0)
  })

  it("--format 非 json：报错退出（复用 assertJsonFormat）", async () => {
    const r = await runCli(["config", "status", "--cwd", cfgDir, "--format", "yaml"])
    expect(r.code).toBe(1)
    expect(r.err.join("\n")).toContain("仅支持 json")
  })

  it("裸 config：打印本域帮助并列出 status 子命令", async () => {
    const r = await runCli(["config"])
    expect(r.code).toBe(0)
    expect(r.out.join("")).toContain("status")
  })
})

describe("skills sources 外部来源口径", () => {
  const stateFile = join(homeDir, ".agents", ".toolkit-skills.json")
  const configFile = join(homeDir, ".toolkitrc.json")
  const localSource = join(sandbox, "local-source")

  // 写沙箱内的状态 / 配置文件（父目录按需创建）
  function writeFixture(file: string, data: unknown): void {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(data), "utf8")
  }

  // 最小状态来源：一个目标、若干净名条目，版本按参数写入
  function sourceFixture(version: string, skillNames: string[]) {
    return {
      kind: "local",
      version,
      temporary: false,
      root: localSource,
      targets: [
        {
          id: "primary",
          dir: join(homeDir, ".agents", "skills"),
          label: "canonical",
          kind: "primary",
          entries: skillNames.map((name) => ({ name, version, mode: "link" })),
        },
      ],
    }
  }

  afterEach(() => {
    rmSync(stateFile, { force: true })
    rmSync(configFile, { force: true })
    rmSync(localSource, { recursive: true, force: true })
  })

  it("列表与 JSON 都不含内置源 toolkit", async () => {
    writeFixture(stateFile, {
      format: "fxri.toolkit.skills-state",
      schemaVersion: 1,
      updatedAt: "",
      sources: { toolkit: sourceFixture("", ["fxri-plan-to-task"]), play: sourceFixture("1.2.3", ["ext-alpha"]) },
    })
    const json = await runCli(["skills", "sources", "--format", "json"])
    const payload = JSON.parse(json.log.join("\n")) as { sources: Array<{ name: string }> }
    expect(payload.sources.map((item) => item.name)).toEqual(["play"])
    const text = await runCli(["skills", "sources"])
    expect(text.log.join("\n")).not.toContain("toolkit（")
  })

  it("refresh --dry-run 显示当前版本，未知版本显示未知 / null", async () => {
    writeFixture(configFile, { skillsInstall: { sources: { play: { root: join(sandbox, "play-src") } } } })
    writeFixture(stateFile, {
      format: "fxri.toolkit.skills-state",
      schemaVersion: 1,
      updatedAt: "",
      sources: { play: sourceFixture("1.2.3", ["ext-alpha"]) },
    })
    const json = await runCli(["skills", "sources", "refresh", "--dry-run", "--format", "json"])
    const payload = JSON.parse(json.log.join("\n")) as { sources: Array<{ status: string; version: string | null }> }
    expect(payload.sources[0]).toMatchObject({ status: "planned", version: "1.2.3" })
    const text = await runCli(["skills", "sources", "refresh", "--dry-run"])
    expect(text.log.join("\n")).toContain("当前版本：1.2.3")

    writeFixture(stateFile, {
      format: "fxri.toolkit.skills-state",
      schemaVersion: 1,
      updatedAt: "",
      sources: { play: sourceFixture("", ["ext-alpha"]) },
    })
    const unknown = await runCli(["skills", "sources", "refresh", "--dry-run", "--format", "json"])
    const unknownPayload = JSON.parse(unknown.log.join("\n")) as { sources: Array<{ version: string | null }> }
    expect(unknownPayload.sources[0]!.version).toBeNull()
  })

  it("本地来源无版本时刷新结果为 refreshed + version: null", async () => {
    mkdirSync(join(localSource, "skills", "ext-alpha"), { recursive: true })
    writeFileSync(join(localSource, "skills", "ext-alpha", "SKILL.md"), "---\nname: ext-alpha\ndescription: 本地无版本技能\n---\n", "utf8")
    writeFixture(configFile, { skillsInstall: { sources: { play: { root: localSource } } } })
    writeFixture(stateFile, {
      format: "fxri.toolkit.skills-state",
      schemaVersion: 1,
      updatedAt: "",
      sources: { play: sourceFixture("", ["ext-alpha"]) },
    })
    const json = await runCli(["skills", "sources", "refresh", "--format", "json"])
    const payload = JSON.parse(json.log.join("\n")) as { sources: Array<{ status: string; version: string | null }> }
    expect(payload.sources[0]).toMatchObject({ status: "refreshed", version: null })
  })
})
