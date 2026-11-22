// tasks 命令：任务总览 / 归档 / 校验 / 归一化 / 统计 / 导入导出的注册入口与打印
import { existsSync, readdirSync } from "node:fs"
import type { Command } from "commander"
import { renderTaskBoard } from "../tasks/list"
import { queryTasks } from "../tasks/query"
import { exportTasks, toJSONData } from "../tasks/export"
import { importTasks } from "../tasks/import"
import { archiveTasks } from "../tasks/archive"
import { computeStats, renderStats } from "../tasks/stats"
import { validateTasks, type CheckIssue } from "../tasks/validate"
import { checkArchive, fixArchive } from "../tasks/normalize"
import { createTask, defaultOwner, updateTask } from "../tasks/edit"
import { isInteractive, loadPrompts, runInteractive } from "../prompts"
import { EXIT } from "../exit-codes"
import type { TaskView, TaskFilter, ImportTarget } from "../tasks/types"
import { ALL_STATUSES } from "../tasks/types"
import { findUntypedChangesetEntries, findUnbulletedChangesetEntries } from "../changelog/format"
import { resolveEnabled } from "../switch"
import { resolveTasksDir, getConfigSection } from "../config"
import { resolveRedactEnabled } from "../privacy/redact"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { getCheckWarnings, printJson, resolveLanguages, splitMulti } from "./shared"
import { line, style } from "../term-style"

// tasks 域公共选项：目录、脱敏、软告警与严格模式
interface TasksCommonOptions {
  dir?: string
  redact?: boolean
  warn?: boolean
  strict?: boolean
}

// 任务查询选项：总览、统计与导出共用
interface TasksQueryOptions extends TasksCommonOptions {
  view?: string
  owner?: string
  scope?: string
  status?: string
  date?: string
  since?: string
  until?: string
  format?: string
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

// 变更集写法检测（tasks check 早期检测）：扫 .changeset 下待发布变更集，缺类型前缀 / 未加列表标记的文件各转一条 warn 级问题
// 前缀识别遍历全部配置语言，自定义语言不误报；与 changelog 侧 warnUntypedEntries 互补，不在同一命令内重复触发
function changesetPrefixIssues(): CheckIssue[] {
  const langs = Object.values(resolveLanguages())
  return [
    ...findUntypedChangesetEntries(".changeset", langs).map((entry) => ({
      level: "warn" as const,
      file: entry.file,
      line: entry.line,
      message: `变更集条目缺类型前缀（本文件 ${entry.count} 条），建议按「类型：描述」撰写`,
    })),
    ...findUnbulletedChangesetEntries(".changeset").map((entry) => ({
      level: "warn" as const,
      file: entry.file,
      line: entry.line,
      message: `变更集含未加「- 」列表标记的正文行（本文件 ${entry.count} 行），changesets 会并入上一条目；说明性内容请并入条目，逐条写成「- 类型：描述」`,
    })),
  ]
}

// 打印校验结果（check / normalize --check 共用）；带行号的问题输出 file:line 便于编辑器跳转
// emptyMessage=false 时由调用方统一输出结论，避免 error / warn 分段各打一次「未发现问题」
function printIssues(issues: Array<{ file: string; line?: number; message: string }>, options: { emptyMessage?: boolean } = {}) {
  if (issues.length === 0) {
    if (options.emptyMessage !== false) console.log(line.ok("未发现问题"))
    return
  }
  for (const i of issues) {
    console.log(`  ${i.file}${i.line ? `:${i.line}` : ""}: ${i.message}`)
  }
}

// 状态过滤解析与应用：未传 → 跳过；部分非法 → stderr 告警并剔除；全部非法 → 报错退出（返回 false 由调用方 return）
// 合法清单与 ALL_STATUSES 同源，避免两处漂移；告警走 stderr，stdout 留给机器可读输出
function applyStatusFilter(filter: TaskFilter, v?: string): boolean {
  const raw = splitMulti(v)
  if (!raw) return true
  const legal = ALL_STATUSES as readonly string[]
  const values = raw.filter((s) => legal.includes(s))
  const invalid = raw.filter((s) => !legal.includes(s))
  if (values.length === 0) {
    console.error(`⚠️ --status 全部取值非法：${invalid.join("、")}（合法：${ALL_STATUSES.join("/")}）`)
    process.exitCode = 1
    return false
  }
  if (invalid.length > 0) {
    console.warn(`⚠️ 忽略非法状态值：${invalid.join("、")}（合法：${ALL_STATUSES.join("/")}）`)
  }
  filter.status = values
  return true
}

// 注册 tasks 命令：装配点只负责按序调用
export function registerTasksCommands(program: Command): void {
  // tasks 域：任务总览 / 归档 / 校验 / 归一化 / 统计 / 导入导出

  // 任务子命令公共选项：目录、脱敏、软告警与严格模式
  function addTasksCommonOptions(command: Command): Command {
    return command
      .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 task.dir > 默认 .tasks）")
      .option("--redact", "开启隐私脱敏")
      .option("--no-redact", "关闭隐私脱敏")
      .option("--warn", "开启软告警")
      .option("--no-warn", "关闭软告警")
      .option("--strict", "任务目录不存在时报错退出（默认容错为空结果）")
  }

  // 任务过滤选项：总览、统计与导出共用
  function addTasksFilterOptions(command: Command): Command {
    return command
      .option("--view <view>", "任务视图：active / archived / all（总览与导出默认 active，stats 默认 all）")
      .option("--owner <name>", "按负责人过滤（逗号分隔多值）")
      .option("--scope <scope>", "按范围过滤（逗号分隔多值）")
      .option("--status <status>", "按状态过滤（逗号分隔多值）")
      .option("--date <date>", "按单日过滤（YYYY-MM-DD，与 --since/--until 互斥）")
      .option("--since <date>", "起始日期（含当天）")
      .option("--until <date>", "结束日期（含当天）")
  }

  // 解析任务上下文：严格模式下目录缺失即报错，返回 null 由调用方退出
  function resolveTasksContext(options: TasksCommonOptions): { redact: boolean; warn: boolean; dir: string } | null {
    const dir = resolveTasksDir(options.dir)
    if (options.strict && !existsSync(dir)) {
      console.error(`⚠️ 任务目录不存在：${dir}`)
      process.exitCode = 1
      return null
    }
    return {
      redact: resolveRedactEnabled(options.redact),
      warn: resolveEnabled(options.warn, "FX_TOOLKIT_CHECK_WARN", getCheckWarnings(), true),
      dir,
    }
  }

  // 解析视图：非法取值置退出码并返回 null
  function resolveTaskView(value: string | undefined, fallback: TaskView): TaskView | null {
    const view = value ?? fallback
    if (!["active", "archived", "all"].includes(view)) {
      console.error(`⚠️ 非法视图「${view}」，仅支持 active / archived / all`)
      process.exitCode = 1
      return null
    }
    return view as TaskView
  }

  // 构造查询过滤：日期互斥与状态逐个校验，非法时返回 null
  function buildTaskFilter(options: TasksQueryOptions): TaskFilter | null {
    if (options.date && (options.since || options.until)) {
      console.error("⚠️ --date 不能与 --since / --until 同时使用")
      process.exitCode = 1
      return null
    }
    const filter: TaskFilter = {}
    filter.owner = splitMulti(options.owner)
    filter.scope = splitMulti(options.scope)
    if (!applyStatusFilter(filter, options.status)) return null
    if (options.date) filter.date = options.date
    if (options.since) filter.since = options.since
    if (options.until) filter.until = options.until
    return filter
  }

  // 总览：视图 + 过滤 + 终端表格 / JSON；command 由调用点给出，区分裸 task 与 task list
  async function runTasksOverview(options: TasksQueryOptions, command: string): Promise<void> {
    const ctx = resolveTasksContext(options)
    if (!ctx) return
    if (!assertJsonFormat(options.format)) return
    const view = resolveTaskView(options.view, "active")
    if (!view) return
    const filter = buildTaskFilter(options)
    if (!filter) return
    try {
      const { rows, summary } = queryTasks(ctx.dir, view, filter)
      if (options.format === "json") {
        printJson(jsonEnvelope(command, true, toJSONData(rows, summary, ctx.redact)))
        return
      }
      renderTaskBoard(rows, summary, view, filter, ctx.redact)
      // 默认视图提示：带过滤但落在待完成视图无结果时，提示归档需要显式 --view（避免误以为过滤不生效）
      const hasFilter = Boolean(options.owner || options.scope || options.status || options.date || options.since || options.until)
      if (!options.view && hasFilter && rows.length === 0) {
        console.log(line.hint("（提示：过滤默认作用于待完成视图，查看归档请加 --view archived 或 --view all）"))
      }
    } catch (e) {
      console.error(`⚠️ 操作失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  }

  // 归档：只归档终结态任务，--dry-run 只预览
  function runTasksArchive(options: TasksCommonOptions & { dryRun?: boolean; task?: string }): void {
    const ctx = resolveTasksContext(options)
    if (!ctx) return
    const dryRun = Boolean(options.dryRun)
    try {
      const result = archiveTasks(ctx.dir, ctx.redact, { dryRun, warn: ctx.warn, task: options.task })
      // 软告警：归档了任务但无待发布变更集（仅真实归档时提示，预演不提示）
      if (ctx.warn && !dryRun && result.archived > 0 && !hasPendingChangeset()) {
        console.warn(`⚠️ ${style.warn("本次归档了任务，但 .changeset 无待发布变更集，")}${style.hint("如需发版请先创建变更集")}`)
      }
    } catch (e) {
      console.error(`⚠️ 操作失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  }

  // 校验：任务区 error / warn 双报，存在 error 时退出码 1
  function runTasksCheck(options: TasksCommonOptions): void {
    const ctx = resolveTasksContext(options)
    if (!ctx) return
    try {
      const result = validateTasks(ctx.dir)
      // 变更集缺前缀检测并入同一份问题清单（软告警关闭时不计不报）
      const issues = ctx.warn ? [...result.issues, ...changesetPrefixIssues()] : result.issues
      const errorCount = issues.filter((i) => i.level === "error").length
      console.log("任务校验：")
      console.log(`【error】${errorCount} 项`)
      printIssues(issues.filter((i) => i.level === "error"), { emptyMessage: false })
      if (ctx.warn) {
        console.log(`【warn】${issues.length - errorCount} 项`)
        printIssues(issues.filter((i) => i.level === "warn"), { emptyMessage: false })
      } else {
        console.log(line.hint("（软告警已关闭，warn 不展示）"))
      }
      if (issues.length === 0) console.log(line.ok("未发现问题"))
      if (errorCount > 0) process.exitCode = 1
    } catch (e) {
      console.error(`⚠️ 操作失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  }

  // 统计：复用查询过滤参数，输出周期 / 滞留 / 吞吐三类指标
  function runTasksStats(options: TasksQueryOptions): void {
    const ctx = resolveTasksContext(options)
    if (!ctx) return
    if (!assertJsonFormat(options.format)) return
    const view = resolveTaskView(options.view, "all")
    if (!view) return
    const filter = buildTaskFilter(options)
    if (!filter) return
    try {
      const stats = computeStats(ctx.dir, filter, view)
      if (options.format === "json") printJson(jsonEnvelope("task stats", true, stats))
      else for (const line of renderStats(stats)) console.log(line)
    } catch (e) {
      console.error(`⚠️ 操作失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  }

  // 归一化：默认只读检查，--fix 修复，--check 显式声明只读
  function runTasksNormalize(options: TasksCommonOptions & { fix?: boolean; check?: boolean }): void {
    const ctx = resolveTasksContext(options)
    if (!ctx) return
    try {
      if (options.fix && options.check) {
        console.error("⚠️ --fix 与 --check 不能同时使用")
        process.exitCode = 1
        return
      }
      if (options.fix) {
        const result = fixArchive(ctx.dir)
        const bom = result.bomFixed ? `，去除 BOM ${result.bomFixed} 个文件` : ""
        console.log(line.ok(`已修复 ${result.fixed} 处${bom}`))
        if (result.issues.length > 0) {
          console.log(line.hint("以下问题需人工确认："))
          printIssues(result.issues)
        }
        return
      }
      const issues = checkArchive(ctx.dir)
      console.log(`归档归一化检查：发现 ${issues.length} 处问题`)
      printIssues(issues)
    } catch (e) {
      console.error(`⚠️ 操作失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  }

  // 导出：按视图与过滤导出到文件，格式由扩展名决定
  async function runTasksExport(path: string, options: TasksQueryOptions): Promise<void> {
    const ctx = resolveTasksContext(options)
    if (!ctx) return
    const view = resolveTaskView(options.view, "active")
    if (!view) return
    const filter = buildTaskFilter(options)
    if (!filter) return
    try {
      const { rows, summary } = queryTasks(ctx.dir, view, filter)
      await exportTasks(path, rows, summary, ctx.redact)
      console.log(line.ok(`已导出 ${rows.length} 个任务 → ${style.accent(path)}`))
    } catch (e) {
      console.error(`⚠️ 操作失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  }

  // 导入：独立动作，兼容自定义列映射与目标视图
  async function runTasksImport(
    file: string,
    options: TasksCommonOptions & { target?: string; dryRun?: boolean; owner?: string; scope?: string },
  ): Promise<void> {
    const ctx = resolveTasksContext(options)
    if (!ctx) return
    const section = getConfigSection("task")
    const custom = section?.importColumns && typeof section.importColumns === "object" ? (section.importColumns as Record<string, string>) : undefined
    const target = options.target ?? "active"
    if (!["active", "archive"].includes(target)) {
      console.error(`⚠️ 非法导入目标「${target}」，仅支持 active / archive`)
      process.exitCode = 1
      return
    }
    try {
      await importTasks(file, ctx.dir, {
        owner: options.owner,
        scope: options.scope,
        target: target as ImportTarget,
        dryRun: Boolean(options.dryRun),
        importColumns: custom,
      })
    } catch (e) {
      console.error(`⚠️ 导入失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  }

  const tasksCmd = program.command("task").description("任务管理")

  addTasksCommonOptions(tasksCmd)
  addTasksFilterOptions(tasksCmd)
  tasksCmd
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action(async (options: TasksQueryOptions) => {
      await runTasksOverview(options, "task")
    })

  // list 为隐式子命令：`toolkit task list` 等价于裸 `tasks` 看板，补命令名与直觉不一致的入口
  const tasksListCmd = tasksCmd.command("list", { hidden: true })
  addTasksCommonOptions(tasksListCmd)
  addTasksFilterOptions(tasksListCmd)
  tasksListCmd.option("--format <format>", "输出格式（json，输出到 stdout）").action(async (options: TasksQueryOptions) => {
    await runTasksOverview(options, "task list")
  })

  // 新建任务：TTY 无参进入交互，非 TTY 须显式标题与 --yes
  tasksCmd
    .command("add")
    .description("新建任务档（TTY 无参会交互补齐；非 TTY 须 --title 与 --yes）")
    .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 task.dir > 默认 .tasks）")
    .option("--title <text>", "任务标题")
    .option("--owner <name>", "负责人（默认 git user.name / 系统用户名）")
    .option("--scope <scope>", "影响范围（单值，如 cli / docs / skills）")
    .option("--depends-on <keys...>", "依赖的任务唯一键（可多个）")
    .option("--plan <text>", "计划位置行文案")
    .option("--dry-run", "只预览文件路径，不写盘")
    .option("--yes", "非交互确认写入")
    .action(async (options: { dir?: string; title?: string; owner?: string; scope?: string; dependsOn?: string[]; plan?: string; dryRun?: boolean; yes?: boolean }) => {
      const dir = resolveTasksDir(options.dir)
      let title = options.title?.trim()
      let owner = options.owner?.trim()
      let scope = options.scope?.trim()
      if (isInteractive() && !title) {
        await runInteractive(async () => {
          const { input } = await loadPrompts()
          title = (await input({ message: "任务标题" })).trim()
          owner = (await input({ message: "负责人", default: owner ?? defaultOwner() })).trim()
          scope = (await input({ message: "影响范围（单值）", default: scope ?? "cli" })).trim()
        })
      }
      if (!title) {
        console.error("⚠️ 非交互环境须用 --title 指定任务标题")
        process.exitCode = EXIT.INTERACTIVE
        return
      }
      // 非交互环境才要求 --yes：TTY 下已在提示中完成全部字段，直接写入
      if (!options.dryRun && !options.yes && !isInteractive()) {
        console.error("⚠️ 非交互环境写入任务档须显式加 --yes")
        process.exitCode = EXIT.INTERACTIVE
        return
      }
      try {
        const result = createTask({ dir, title, owner, scope: scope ?? "cli", dependsOn: options.dependsOn, plan: options.plan, dryRun: options.dryRun })
        if (options.dryRun) console.log(line.hint(`[预演] 将创建任务档：${result.file}`))
        else {
          console.log(line.ok(`已创建任务档：${result.file}`))
          console.log(line.hint("下一步：补齐背景 / 实施方案 / 影响范围 / 验证方式，再运行 toolkit task check"))
        }
      } catch (e) {
        console.error(`⚠️ ${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  // 更新任务：只改 frontmatter 字段，正文原样保留
  tasksCmd
    .command("update <key>")
    .description("更新任务字段与状态（非交互写入须 --yes）")
    .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 task.dir > 默认 .tasks）")
    .option("--status <status>", "状态：待办 / 进行中 / 已完成 / 阻塞 / 已放弃 / 搁置")
    .option("--owner <name>", "负责人")
    .option("--scope <scope>", "影响范围（单值）")
    .option("--depends-on <keys...>", "依赖的任务唯一键（可多个；传空清除）")
    .option("--completed <time>", "完成时间 YYYY-MM-DD HH:mm（终态必填）")
    .option("--dry-run", "只预览将改动的字段，不写盘")
    .option("--yes", "非交互确认写入")
    .action((key: string, options: { dir?: string; status?: string; owner?: string; scope?: string; dependsOn?: string[]; completed?: string; dryRun?: boolean; yes?: boolean }) => {
      const dir = resolveTasksDir(options.dir)
      // 非交互环境才要求 --yes：TTY 下直接按显式参数写入
      if (!options.dryRun && !options.yes && !isInteractive()) {
        console.error("⚠️ 非交互环境写入任务档须显式加 --yes")
        process.exitCode = EXIT.INTERACTIVE
        return
      }
      try {
        const result = updateTask({
          dir,
          key,
          status: options.status,
          owner: options.owner,
          scope: options.scope,
          dependsOn: options.dependsOn,
          completed: options.completed,
          dryRun: options.dryRun,
        })
        if (options.dryRun) console.log(line.hint(`[预演] 将更新：${result.file}${result.changes.length > 0 ? `（${result.changes.join("、")}）` : "（无变化）"}`))
        else console.log(line.ok(`已更新任务：${result.file}${result.changes.length > 0 ? `（${result.changes.join("、")}）` : "（无变化）"}`))
      } catch (e) {
        console.error(`⚠️ ${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  addTasksCommonOptions(tasksCmd.command("archive").description("归档已完成任务"))
    .option("--dry-run", "预演（只预览，不落盘）")
    .option("--task <key>", "只归档指定任务（唯一键）")
    .action((options: TasksCommonOptions & { dryRun?: boolean; task?: string }) => {
      runTasksArchive(options)
    })

  addTasksCommonOptions(tasksCmd.command("check").description("校验任务区：规则与变更集写法，存在 error 时退出码 1"))
    .action((options: TasksCommonOptions) => {
      runTasksCheck(options)
    })

  addTasksCommonOptions(tasksCmd.command("normalize").description("任务区归一化：默认只读检查，--fix 修复（含去 BOM）"))
    .option("--fix", "修复归档块问题与文件 BOM")
    .option("--check", "只读检查（默认行为，与 --fix 互斥）")
    .action((options: TasksCommonOptions & { fix?: boolean; check?: boolean }) => {
      runTasksNormalize(options)
    })

  addTasksFilterOptions(addTasksCommonOptions(tasksCmd.command("stats").description("任务统计：周期 / 滞留 / 吞吐")))
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: TasksQueryOptions) => {
      runTasksStats(options)
    })

  addTasksFilterOptions(addTasksCommonOptions(tasksCmd.command("export").description("导出任务到文件（.csv / .xlsx / .json）")))
    .argument("<path>", "导出文件路径")
    .action(async (path: string, options: TasksQueryOptions) => {
      await runTasksExport(path, options)
    })

  addTasksCommonOptions(tasksCmd.command("import").description("从文件导入任务（.csv / .xlsx / .json）"))
    .argument("<file>", "导入文件路径")
    .option("--target <target>", "导入目标：active / archive（默认 active）")
    .option("--owner <name>", "导入时统一赋值负责人")
    .option("--scope <scope>", "导入时统一赋值范围")
    .option("--dry-run", "预演（只预览，不落盘）")
    .action(async (file: string, options: TasksCommonOptions & { target?: string; dryRun?: boolean; owner?: string; scope?: string }) => {
      await runTasksImport(file, options)
    })
}
