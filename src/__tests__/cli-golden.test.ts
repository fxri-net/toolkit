// CLI 行为基线：以快照锁定重构前的输出，供后续结构化重构逐任务比对
// ⚠️ cli.ts 顶层即执行主流程，无法静态导入：每个用例重置模块注册表后动态 import 并 await cliReady
// 归一化只允许「沙箱 / home / 仓库根路径」「当天日期」「路径分隔符」三类易变值，其余逐字比对
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"

// 沙箱路径用 vi.hoisted 构造（mock 工厂早于模块顶层求值执行）
// ⚠️ 分隔符必须与平台一致：join() 产出的路径只在同种分隔符下才能被归一化命中
const sandbox = vi.hoisted(() => {
  const base = (process.env.TEMP || process.env.TMP || "/tmp").replace(/[\\/]+$/, "")
  const sep = base.includes("\\") ? "\\" : "/"
  return `${base}${sep}tk-golden-sandbox-${process.pid.toString(36)}`
})

// 临时目录重定向到沙箱：升级缓存等落沙箱内
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>()
  return { ...actual, tmpdir: () => sandbox }
})

// 子进程派生注入：不真拉起升级检查 worker，也不真调用 changesets
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, spawn: vi.fn(), spawnSync: vi.fn(() => ({ status: 0 })) }
})

// 交互确认直接返回 true、多选默认空选：不开真实终端
vi.mock("@inquirer/prompts", () => ({ confirm: vi.fn(async () => true), checkbox: vi.fn(async () => [] as string[]) }))

// 仓库根：归一化时把绝对路径折叠为占位符
const repoRoot = process.cwd()
// 时区固定为 UTC：本地日期 / 周期统计的输出不随运行机器时区漂移（结束后还原）
const originalTz = process.env.TZ
process.env.TZ = "UTC"
// 沙箱内三个固定目录：home 隔离配置与状态、workspace 承载读类夹具、initDir 承载写类产物
const homeDir = join(sandbox, "home")
const workspace = join(sandbox, "workspace")
const initDir = join(sandbox, "init-target")

// 冻结系统时间：命令输出里的「今天」与周期计算固定到同一时刻，快照不随运行日漂移
const FROZEN_NOW = new Date("2026-11-12T04:00:00Z")

// 真实 home：即便个别路径绕过注入，也不把本机目录写进快照
const realHomes = [process.env.USERPROFILE, process.env.HOME, process.env.HOMEPATH]
  .filter((value): value is string => Boolean(value))
  .map((value) => value.replace(/[\\/]+$/, ""))

// 输出归一化：路径折叠 + 当天日期折叠 + 行尾与分隔符统一
function normalize(text: string): string {
  let out = text.replace(/\r\n/g, "\n")
  const replacements: Array<[string, string]> = [
    [sandbox, "<SANDBOX>"],
    [repoRoot, "<REPO>"],
    ...realHomes.map((home): [string, string] => [home, "<HOME>"]),
  ]
  for (const [from, to] of replacements) {
    // JSON 输出会把反斜杠转义为双反斜杠，三种形态都要折叠，否则分隔符归一后会出现 <SANDBOX> 未命中的 // 片段
    out = out.split(from).join(to)
    out = out.split(from.replace(/\\/g, "/")).join(to)
    out = out.split(from.replace(/\\/g, "\\\\")).join(to)
  }
  return out.replace(/\\/g, "/")
}

// 单次 CLI 运行的观测结果
interface CliRun {
  code: number
  stdout: string
  stderr: string
}

const originalArgv = process.argv
const originalCwd = process.cwd()

// 跑一次 CLI：重置模块注册表 → 注入 home / argv / cwd → 动态 import cli 并 await 主流程 → 收集输出
async function runCli(args: string[], cwd = workspace): Promise<CliRun> {
  vi.resetModules()
  // 与 cli 内部共享同一模块实例：resetModules 后先导入 config，cli 的 import 会复用该实例
  const config = await import("../config")
  config.setHomeDirForTest(homeDir)
  config.resetToolkitConfigCache()
  const stdout: string[] = []
  const stderr: string[] = []
  // stdout / stderr 分别按调用顺序累积：console.* 与直接 write 的先后关系得以保留
  vi.spyOn(console, "log").mockImplementation((...items: unknown[]) => {
    stdout.push(items.join(" "))
  })
  vi.spyOn(console, "warn").mockImplementation((...items: unknown[]) => {
    stderr.push(items.join(" "))
  })
  vi.spyOn(console, "error").mockImplementation((...items: unknown[]) => {
    stderr.push(items.join(" "))
  })
  // commander 的帮助 / 版本输出走 process 写入，不经 console
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    stdout.push(typeof chunk === "string" ? chunk : String(chunk))
    return true
  }) as unknown as typeof process.stdout.write)
  vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    stderr.push(typeof chunk === "string" ? chunk : String(chunk))
    return true
  }) as unknown as typeof process.stderr.write)
  process.argv = ["node", "toolkit", ...args]
  process.exitCode = 0
  process.chdir(cwd)
  try {
    const cli = await import("../cli")
    await cli.cliReady
  } finally {
    process.chdir(originalCwd)
  }
  return { code: Number(process.exitCode ?? 0), stdout: normalize(stdout.join("\n")), stderr: normalize(stderr.join("\n")) }
}

// 渲染单次运行结果：退出码与两个通道一起纳入快照，避免只锁文案漏掉退出码变化
function render(run: CliRun): string {
  return [`退出码：${run.code}`, "--- stdout ---", run.stdout, "--- stderr ---", run.stderr].join("\n")
}

// 递归渲染目录产物：文件相对路径 + 归一化后的全文
function renderTree(root: string): string {
  const lines: string[] = []
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      lines.push(`### ${relative(root, full).replace(/\\/g, "/")}`, normalize(readFileSync(full, "utf8")), "")
    }
  }
  walk(root)
  return lines.join("\n")
}

// 写夹具文件：自动建父目录
function putFile(root: string, rel: string, content: string): void {
  const file = join(root, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

// 环境变量快照：清掉可能影响输出的外部变量（包管理器会把 npm_config_* 注入子进程），结束后还原
const environmentBackup = new Map<string, string | undefined>()
const ENV_TO_CLEAR = /^(CLAUDE|CODEX|COPILOT|CURSOR|DSH|TRAE|TOOLKIT|FX_|AGENTS|npm_|NPM_)/i

// 夹具任务文件：进行中
const ACTIVE_TASK = `---
owner: 唐启云
status: 进行中
created: 20261110
updated: 20261111
completed: ''
depends_on: []
scope: toolkit
---

# 基线示例进行中任务

> 计划位置：第 1 个（共 2 个）；前置：无；后继：无

## 背景

基线夹具。

## 实施方案

1. 示例步骤。

## 影响范围

- 无。

## 验证方式

- 无。
`

// 夹具任务文件：已完成（带完成时间）
const DONE_TASK = `---
owner: 唐启云
status: 已完成
created: 20261109
updated: 20261111
completed: '2026-11-11 10:00'
depends_on: []
scope: toolkit
---

# 基线示例已完成任务

> 计划位置：第 2 个（共 2 个）；前置：基线示例进行中任务；后继：无

## 背景

基线夹具。

## 实施方案

1. 示例步骤。

## 影响范围

- 无。

## 验证方式

- 无。
`

// 夹具归档文件：一个合法任务块
const ARCHIVE_FILE = `# 20261030 归档

## 20261030-唐启云-基线示例归档任务

> 负责人：唐启云　状态：已完成　范围：toolkit　完成时间：2026-10-30 09:00

## 背景

基线夹具。
`

beforeAll(() => {
  // 记录并清空可能干扰输出的外部变量
  for (const key of Object.keys(process.env)) {
    if (!ENV_TO_CLEAR.test(key)) continue
    environmentBackup.set(key, process.env[key])
    delete process.env[key]
  }
  rmSync(sandbox, { recursive: true, force: true })
  mkdirSync(homeDir, { recursive: true })
  mkdirSync(workspace, { recursive: true })
  // workspace 夹具：包描述、配置、任务区、归档、变更集
  putFile(workspace, "package.json", `${JSON.stringify({ name: "golden-workspace", private: true }, null, 2)}\n`)
  putFile(workspace, ".toolkitrc.json", `${JSON.stringify({ tasks: { dir: ".tasks" } }, null, 2)}\n`)
  putFile(workspace, ".tasks/active/202611/20261110-唐启云-基线示例进行中任务.md", ACTIVE_TASK)
  putFile(workspace, ".tasks/active/202611/20261111-唐启云-基线示例已完成任务.md", DONE_TASK)
  putFile(workspace, ".tasks/archive/202610/20261030.md", ARCHIVE_FILE)
  putFile(workspace, ".changeset/golden-change.md", '---\n"@fxri/toolkit": patch\n---\n\n- 优化：基线夹具示例条目\n')
})

beforeEach(() => {
  // 只伪造 Date：不动定时器，避免影响异步流程
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(FROZEN_NOW)
  // CI 标记跳过技能链接自愈；升级检查关闭，避免网络与随机提示
  process.env.CI = "1"
  process.env.FX_NO_UPDATE_CHECK = "1"
})

afterEach(() => {
  delete process.env.CI
  delete process.env.FX_NO_UPDATE_CHECK
  process.argv = originalArgv
  process.exitCode = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
})

afterAll(() => {
  process.chdir(originalCwd)
  rmSync(sandbox, { recursive: true, force: true })
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
  for (const [key, value] of environmentBackup) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("帮助与版本口径", () => {
  const cases: Array<[string, string[]]> = [
    ["根帮助", ["--help"]],
    ["无参默认帮助", []],
    ["版本号", ["--version"]],
    ["help 子命令", ["help"]],
    ["help tasks", ["help", "tasks"]],
    ["tasks 帮助", ["tasks", "--help"]],
    ["skills 帮助", ["skills", "--help"]],
    ["skills install 帮助", ["skills", "install", "--help"]],
    ["changelog 帮助", ["changelog", "--help"]],
    ["changelog version 帮助", ["changelog", "version", "--help"]],
    ["conventions 帮助", ["conventions", "--help"]],
    ["conventions format 帮助", ["conventions", "format", "--help"]],
    ["config 帮助", ["config", "--help"]],
    ["rules 帮助", ["rules", "--help"]],
    ["rules compose 帮助", ["rules", "compose", "--help"]],
    ["usage 帮助", ["usage", "--help"]],
    ["usage stats 帮助", ["usage", "stats", "--help"]],
    ["docs 帮助", ["docs", "--help"]],
    ["docs theme 帮助", ["docs", "theme", "--help"]],
    ["docs nav 帮助", ["docs", "nav", "--help"]],
    ["docs dist 帮助", ["docs", "dist", "--help"]],
    ["init 帮助", ["init", "--help"]],
  ]
  for (const [name, args] of cases) {
    it(name, async () => {
      expect(render(await runCli(args))).toMatchSnapshot()
    })
  }
})

describe("各域行为与错误路径", () => {
  const cases: Array<[string, string[]]> = [
    ["tasks 总览", ["tasks"]],
    ["tasks 总览 JSON", ["tasks", "--format", "json"]],
    ["tasks 状态过滤全部非法", ["tasks", "--status", "bogus"]],
    ["tasks 状态过滤部分非法", ["tasks", "--status", "bogus,已完成"]],
    ["tasks 未知选项", ["tasks", "--bogus"]],
    ["tasks check", ["tasks", "check"]],
    ["tasks normalize", ["tasks", "normalize"]],
    ["tasks stats", ["tasks", "stats"]],
    ["tasks 导出缺参数", ["tasks", "export"]],
    ["changelog audit", ["changelog", "audit"]],
    ["changelog doc 校验", ["changelog", "doc", "--check"]],
    ["conventions status", ["conventions", "status"]],
    ["conventions status JSON", ["conventions", "status", "--format", "json"]],
    ["conventions format 预演", ["conventions", "format", "--dry-run"]],
    ["conventions upgrade 预演", ["conventions", "upgrade", "--dry-run"]],
    ["config status", ["config", "status"]],
    ["config status JSON", ["config", "status", "--format", "json"]],
    ["rules list", ["rules", "list"]],
    ["rules list JSON", ["rules", "list", "--format", "json"]],
    ["rules compose 单模块", ["rules", "compose", "--module", "common", "--no-cache"]],
    ["rules compose 未知预设", ["rules", "compose", "--preset", "bogus", "--no-cache"]],
    ["rules reset", ["rules", "reset"]],
    ["skills status", ["skills", "status", "--scope", "global"]],
    ["skills path", ["skills", "path"]],
    ["docs theme 校验", ["docs", "theme", "check"]],
    ["usage info", ["usage", "info"]],
    ["usage stats", ["usage", "stats"]],
    ["usage doctor", ["usage", "doctor"]],
    ["usage rule", ["usage", "rule"]],
    ["usage 导出空数据", ["usage", "export"]],
    ["usage 补录预演", ["usage", "log", "--skill", "fxri-plan-to-task", "--session", "golden", "--dry-run"]],
    ["usage 去重", ["usage", "dedupe"]],
    ["usage 清理预演", ["usage", "purge", "--dry-run"]],
    ["usage 重建索引", ["usage", "rebuild"]],
    ["tasks 导出 JSON", ["tasks", "export", "out/tasks.json", "--format", "json"]],
    ["usage 通道", ["usage", "channel"]],
    ["usage 来源", ["usage", "origins"]],
    ["usage 范围", ["usage", "scope"]],
    ["usage 字段", ["usage", "capture"]],
    ["usage 存储", ["usage", "storage"]],
    ["usage 开启", ["usage", "enable"]],
    ["usage 关闭", ["usage", "disable"]],
    ["rules compose 预设", ["rules", "compose", "--preset", "recommended", "--no-cache"]],
    ["tasks stats JSON", ["tasks", "stats", "--format", "json"]],
    ["tasks normalize 修复", ["tasks", "normalize", "--fix"]],
    ["config status 非法格式", ["config", "status", "--format", "xml"]],
    ["conventions format", ["conventions", "format"]],
    ["conventions upgrade", ["conventions", "upgrade"]],
    ["docs theme 写入", ["docs", "theme", "write"]],
    ["skills install 预演", ["skills", "install", "--scope", "global", "--dry-run", "--yes", "--all"]],
    ["skills 来源列表", ["skills", "sources"]],
    ["skills 项目面状态", ["skills", "status", "--scope", "project"]],
    ["skills 项目面预演", ["skills", "install", "--scope", "project", "--dry-run", "--yes", "--all"]],
    ["skills 全局卸载预演", ["skills", "uninstall", "--scope", "global", "--dry-run", "--yes"]],
    ["docs 导航校验", ["docs", "nav", "check"]],
    ["docs 产物校验", ["docs", "dist", "check"]],
    ["changelog 版本", ["changelog", "version"]],
    ["changelog 格式化", ["changelog", "format"]],
  ]
  for (const [name, args] of cases) {
    it(name, async () => {
      expect(render(await runCli(args))).toMatchSnapshot()
    })
  }
})

describe("写盘产物", () => {
  it("init 生成任务区骨架与入口壳", async () => {
    rmSync(initDir, { recursive: true, force: true })
    mkdirSync(initDir, { recursive: true })
    putFile(initDir, "package.json", `${JSON.stringify({ name: "init-target", private: true }, null, 2)}\n`)
    const run = await runCli(["init"], initDir)
    expect(render(run)).toMatchSnapshot()
    expect(renderTree(initDir)).toMatchSnapshot()
  })
})
