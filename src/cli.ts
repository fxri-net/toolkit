#!/usr/bin/env node

import { Command } from "commander"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { printTaskBoard } from "./tasks/list"
import { queryTasks } from "./tasks/query"
import { exportTasks, toJSON } from "./tasks/export"
import { importTasks } from "./tasks/import"
import { archiveTasks } from "./tasks/archive"
import { validateTasks } from "./tasks/validate"
import { checkArchive, fixArchive } from "./tasks/normalize"
import { listTaskFiles } from "./tasks/scan"
import type { TaskView, TaskFilter, ImportTarget } from "./tasks/types"
import { ALL_STATUSES } from "./tasks/types"
import { languages, DEFAULT_LANG, type ChangelogLanguage } from "./changelog/languages"
import { localDate, formatChangelogs } from "./changelog/format"
import { resolveRedactEnabled } from "./privacy/redact"
import { resolveEnabled } from "./switch"
import { getConfigSection, resolveTasksDir } from "./config"
import { initWorkspace, INIT_LINKS } from "./init"
import { startUpdateCheck } from "./update-check"

const require = createRequire(import.meta.url)

// 解析 @changesets/cli 的 bin 绝对路径（pnpm 下 bin 不提升到使用方，需显式定位）
const changesetBin = require.resolve("@changesets/cli/bin.js")
// 版本号从 package.json 读取，避免与 package.json 重复维护
const { version } = require("../package.json")

// 调用 changesets（子进程执行，继承 stdio）
const runChangeset = (cmd: string[]) => {
  const res = spawnSync(process.execPath, [changesetBin, ...cmd], { stdio: "inherit" })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

// Windows 控制台 UTF-8 输出（best-effort：避免中文在 GBK 控制台下乱码）
function ensureUtf8() {
  if (process.platform === "win32") {
    try {
      process.stdout.setDefaultEncoding("utf8")
      process.stderr.setDefaultEncoding("utf8")
    } catch {
      // 流编码设置失败忽略，不影响主流程
    }
  }
}

// 读取 .toolkitrc.json 的 check.warnings 开关（软告警配置档）
function getCheckWarnings(): boolean | undefined {
  const section = getConfigSection("check")
  return typeof section?.warnings === "boolean" ? section.warnings : undefined
}

// 合并 .toolkitrc.json 配置的语言到内置（配置同名 key 覆盖内置，新 key 追加，实现全语言支持）
function resolveLanguages(): Record<string, ChangelogLanguage> {
  const section = getConfigSection("changelog")
  const custom = section?.languages
  if (!custom || typeof custom !== "object") return languages
  const merged: Record<string, ChangelogLanguage> = { ...languages }
  for (const [key, value] of Object.entries(custom)) {
    if (value && typeof value === "object") merged[key] = value as ChangelogLanguage
  }
  return merged
}

// 检测 .changeset 下是否有待发布变更集（排除 README/config）
function hasPendingChangeset(dir = ".changeset"): boolean {
  if (!existsSync(dir)) return false
  try {
    return readdirSync(dir).some((f) => f.endsWith(".md") && f !== "README.md")
  } catch {
    return false
  }
}

// 检测 active 是否有未归档任务
function hasActiveTasks(dir = ".tasks"): boolean {
  return listTaskFiles(join(dir, "active")).length > 0
}

// 打印校验结果（check / normalize --check 共用）
function printIssues(issues: Array<{ file: string; message: string }>) {
  if (issues.length === 0) {
    console.log("未发现问题")
    return
  }
  for (const i of issues) {
    console.log(`  ${i.file}: ${i.message}`)
  }
}

// tasks 子命令与查询/导出/导入的选项集合
interface TasksOptions {
  dir?: string
  redact: boolean | undefined
  warn: boolean | undefined
  dryRun: boolean
  fix: boolean
  check: boolean
  view?: string
  owner?: string
  scope?: string
  status?: string
  date?: string
  since?: string
  until?: string
  export?: string
  format?: string
  import?: string
  target?: string
  strict?: boolean
}

const program = new Command()

program
  .name("toolkit")
  .description("专为多人 + AI 跨项目协作打造：任务管理 + 多语言 CHANGELOG")
  .version(version, "-v, --version", "显示版本号")
  .enablePositionalOptions(true)

// help footer：指向文档站，降低新用户查找成本
program.addHelpText(
  "after",
  [
    "",
    "文档站：",
    `  新手指南 ${INIT_LINKS.gettingStarted}`,
    `  完整攻略 ${INIT_LINKS.guide}`,
    `  全部文档 ${INIT_LINKS.site}`,
  ].join("\n"),
)

// init：初始化项目任务区（生成 .tasks/ 骨架与 .gitignore 片段，幂等可重复执行）
program
  .command("init")
  .description("初始化项目任务区（生成 .tasks/ 骨架与 .gitignore 片段）")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
  .action((options: { dir?: string }) => {
    try {
      // 与 tasks 命令同口径：初始化时也尊重配置中已声明的外置任务目录
      const dir = resolveTasksDir(options.dir)
      initWorkspace(dir)
      console.log(`已初始化任务区：${dir}/active/{YYYYMM}/、${dir}/archive/（已存在的目录保持不变）`)
      console.log("已确保 .gitignore 含 .archive.lock 忽略片段（已存在或无 .gitignore 时自动处理）")
      console.log("")
      console.log("下一步：")
      console.log(`  新手指南：${INIT_LINKS.gettingStarted}`)
      console.log(`  完整攻略：${INIT_LINKS.guide}`)
    } catch (e) {
      console.error(`⚠️ 初始化失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// tasks 域：任务总览 / 归档 / 校验 / 归一化
program
  .command("tasks")
  .description("任务管理")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
  .option("--redact", "开启隐私脱敏")
  .option("--no-redact", "关闭隐私脱敏")
  .option("--warn", "开启软告警")
  .option("--no-warn", "关闭软告警")
  .option("--dry-run", "预演（archive 归档 / import 导入只预览，不落盘）")
  .option("--fix", "归一化修复（仅 normalize 有效）")
  .option("--check", "归一化只读检查（normalize 默认行为，可显式声明；不能与 --fix 同用）")
  .option("--view <view>", "任务视图：active / archived / all（默认 active）")
  .option("--owner <name>", "按负责人过滤（逗号分隔多值）")
  .option("--scope <scope>", "按范围过滤（逗号分隔多值）")
  .option("--status <status>", "按状态过滤（逗号分隔多值）")
  .option("--date <date>", "按单日过滤（YYYY-MM-DD，与 --since/--until 互斥）")
  .option("--since <date>", "起始日期（含当天）")
  .option("--until <date>", "结束日期（含当天）")
  .option("--export <path>", "导出到文件（.csv / .xlsx / .json）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .option("--import <file>", "从文件导入任务（.csv / .xlsx / .json）")
  .option("--target <target>", "导入目标：active / archive（默认 active）")
  .option("--strict", "任务目录不存在时报错退出（默认容错为空结果）")
  .argument("[command]", "子命令：archive / check / normalize，留空为总览（含导入用 --import）")
  .action(
    async (
      command: string | undefined,
      options: TasksOptions,
    ) => {
      const redact = resolveRedactEnabled(options.redact)
      const warn = resolveEnabled(options.warn, "FX_CHECK_WARN", getCheckWarnings(), true)
      // 任务目录三档解析：CLI --dir > 配置 tasks.dir > 默认 .tasks
      const dir = resolveTasksDir(options.dir)

      // 严格模式：任务目录不存在时直接报错（默认容错为空结果）
      if (options.strict && !existsSync(dir)) {
        console.error(`⚠️ 任务目录不存在：${dir}`)
        process.exitCode = 1
        return
      }

      // 导入模式：独立于归档/校验/归一化与查询导出
      if (options.import) {
        if (command || options.export || options.format) {
          console.error("⚠️ --import 为独立模式，不能与子命令、--export、--format 同时使用")
          process.exitCode = 1
          return
        }
        const section = getConfigSection("tasks")
        const custom = section?.importColumns && typeof section.importColumns === "object" ? (section.importColumns as Record<string, string>) : undefined
        const target = (options.target ?? "active") as string
        if (!["active", "archive"].includes(target)) {
          console.error(`⚠️ 非法导入目标「${target}」，仅支持 active / archive`)
          process.exitCode = 1
          return
        }
        try {
          await importTasks(options.import, dir, {
            owner: options.owner,
            scope: options.scope,
            target: target as ImportTarget,
            dryRun: options.dryRun,
            importColumns: custom,
          })
        } catch (e) {
          console.error(`⚠️ 导入失败：${(e as Error).message}`)
          process.exitCode = 1
        }
        return
      }

      if (command === "archive") {
        try {
          const result = archiveTasks(dir, redact, { dryRun: options.dryRun, warn })
          // 软告警：归档了任务但无待发布变更集（仅真实归档时提示，预演不提示）
          if (warn && !options.dryRun && result.archived > 0 && !hasPendingChangeset()) {
            console.warn("⚠️ 本次归档了任务，但 .changeset 无待发布变更集，如需发版请先创建变更集")
          }
        } catch (e) {
          console.error(`⚠️ 操作失败：${(e as Error).message}`)
          process.exitCode = 1
        }
      } else if (command === "check") {
        try {
          const result = validateTasks(dir)
          console.log("任务校验：")
          console.log(`【error】${result.errorCount} 项`)
          printIssues(result.issues.filter((i) => i.level === "error"))
          if (warn) {
            console.log(`【warn】${result.warnCount} 项`)
            printIssues(result.issues.filter((i) => i.level === "warn"))
          } else {
            console.log("（软告警已关闭，warn 不展示）")
          }
          if (result.errorCount > 0) process.exitCode = 1
        } catch (e) {
          console.error(`⚠️ 操作失败：${(e as Error).message}`)
          process.exitCode = 1
        }
      } else if (command === "normalize") {
        try {
          if (options.fix && options.check) {
            console.error("⚠️ --fix 与 --check 不能同时使用")
            process.exitCode = 1
          } else if (options.fix) {
            const result = fixArchive(dir)
            console.log(`已修复 ${result.fixed} 处`)
            if (result.issues.length > 0) {
              console.log("以下问题需人工确认：")
              printIssues(result.issues)
            }
          } else {
            const issues = checkArchive(dir)
            console.log(`归档归一化检查：发现 ${issues.length} 处问题`)
            printIssues(issues)
          }
        } catch (e) {
          console.error(`⚠️ 操作失败：${(e as Error).message}`)
          process.exitCode = 1
        }
      } else {
        // 总览：视图 + 过滤 + 终端表格 / 导出
        const view = (options.view ?? "active") as string
        if (!["active", "archived", "all"].includes(view)) {
          console.error(`⚠️ 非法视图「${view}」，仅支持 active / archived / all`)
          process.exitCode = 1
          return
        }
        if (options.date && (options.since || options.until)) {
          console.error("⚠️ --date 不能与 --since / --until 同时使用")
          process.exitCode = 1
          return
        }
        if (options.export && options.format) {
          console.error("⚠️ --export 与 --format 不能同时使用（--format json 输出到 stdout）")
          process.exitCode = 1
          return
        }
        if (options.format && options.format !== "json") {
          console.error(`⚠️ 不支持的输出格式「${options.format}」，仅支持 json`)
          process.exitCode = 1
          return
        }
        const filter: TaskFilter = {}
        const multi = (v?: string): string[] | undefined => (v ? v.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : undefined)
        filter.owner = multi(options.owner)
        filter.scope = multi(options.scope)
        const rawStatus = multi(options.status)
        if (rawStatus) {
          // 非法状态值告警并忽略（不静默、不中断）
          const invalid = rawStatus.filter((s) => !(ALL_STATUSES as readonly string[]).includes(s))
          if (invalid.length > 0) {
            console.warn(`⚠️ 忽略非法状态值：${invalid.join("、")}（合法：待办/进行中/已完成/阻塞/已放弃）`)
          }
          filter.status = rawStatus.filter((s) => (ALL_STATUSES as readonly string[]).includes(s))
        }
        if (options.date) filter.date = options.date
        if (options.since) filter.since = options.since
        if (options.until) filter.until = options.until
        try {
          const { rows, summary } = queryTasks(dir, view as TaskView, filter)
          if (options.export) {
            await exportTasks(options.export, rows, summary, redact)
            console.log(`已导出 ${rows.length} 个任务 → ${options.export}`)
          } else if (options.format === "json") {
            console.log(toJSON(rows, summary, redact))
          } else {
            printTaskBoard(dir, view as TaskView, filter, redact)
            // 默认视图提示：带过滤但落在待完成视图无结果时，提示归档需要显式 --view（避免误以为过滤不生效）
            const hasFilter = Boolean(options.owner || options.scope || options.status || options.date || options.since || options.until)
            if (!options.view && hasFilter && rows.length === 0) {
              console.log("（提示：过滤默认作用于待完成视图，查看归档请加 --view archived 或 --view all）")
            }
          }
        } catch (e) {
          console.error(`⚠️ 操作失败：${(e as Error).message}`)
          process.exitCode = 1
        }
      }
    },
  )

// changelog 域：version/format 自处理，其余子命令透传给 changesets
program
  .command("changelog")
  .description("多语言 CHANGELOG（封装 changesets）")
  .option("--lang <lang>", "语言 zh/en", DEFAULT_LANG)
  .option("--redact", "开启隐私脱敏")
  .option("--no-redact", "关闭隐私脱敏")
  .option("--warn", "开启软告警")
  .option("--no-warn", "关闭软告警")
  .argument("[command...]", "子命令及参数（透传给 changesets）")
  .passThroughOptions(true)
  .action(
    (
      operands: string[],
      options: { lang: string; redact: boolean | undefined; warn: boolean | undefined },
    ) => {
      const redact = resolveRedactEnabled(options.redact)
      const warn = resolveEnabled(options.warn, "FX_CHECK_WARN", getCheckWarnings(), true)
      // 合并配置语言（支持自定义语言与覆盖内置），实现全语言
      const merged = resolveLanguages()
      // languages 始终内置 DEFAULT_LANG（zh），此处仅收窄 undefined 联合类型
      const lang = (merged[options.lang] ?? merged[DEFAULT_LANG] ?? languages[DEFAULT_LANG]) as ChangelogLanguage
      const command = operands[0]
      if (command === "version") {
        // 软告警：发版前存在未归档任务
        if (warn && hasActiveTasks()) {
          console.warn("⚠️ 存在未归档的 active 任务，建议先归档再发版")
        }
        runChangeset(["version"])
        formatChangelogs(".", localDate(), lang, redact)
      } else if (command === "format") {
        formatChangelogs(".", localDate(), lang, redact)
      } else if (command) {
        runChangeset(operands)
      } else {
        runChangeset([])
      }
    },
  )

ensureUtf8()
// main 包装：兼容 CJS 产物（顶层 await 仅 ESM 支持）；主命令完成后 fire-and-forget 升级检查（不阻塞输出、不影响退出码）
async function main(): Promise<void> {
  await program.parseAsync(process.argv)
  void startUpdateCheck(version)
}
void main()
