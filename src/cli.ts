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
import { computeStats, renderStats } from "./tasks/stats"
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
import {
  autoLinkSkills,
  installSkills,
  listPackageSkills,
  removeSkills,
  skillsPackageDir,
  skillsSourceDir,
  skillsStateFile,
  skillsStatus,
  type InstallReport,
  type SkillItemState,
  type SkillsRemoveReport,
  type SkillsStatusReport,
} from "./skills"
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

// 收集可多次出现的 --dir（commander collect 范式：默认 [] 逐个累积）
function collectDir(value: string, previous: string[]): string[] {
  return [...previous, value]
}

// 技能现场状态的中文文案（status 逐项输出用）
const SKILL_STATE_LABEL: Record<SkillItemState, string> = {
  link: "软链正常",
  dangling: "软链悬空（真源缺失或升级后旧路径失效）",
  wrong: "软链指向别处",
  copy: "副本已同步",
  "copy-drift": "副本已漂移（与真源不一致）",
  missing: "缺失",
  conflict: "同名冲突（非本包产物）",
}

// 需要处理的异常状态：status 汇总提示与 install 修复范围
const SKILL_PROBLEM_STATES: SkillItemState[] = ["dangling", "wrong", "copy-drift", "missing", "conflict"]

// 打印安装报告：按目标分组列出新建/更新/跳过/降级/失败，并给出未纳入目标的处理入口
function printInstallReport(report: InstallReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  console.log(`${tag}技能源：${report.source}`)
  console.log(`${tag}包内技能（${report.skills.length}）：${report.skills.join("、") || "无"}`)
  for (const t of report.targets) {
    console.log("")
    console.log(`${t.label}：${t.dir}`)
    if (t.created.length > 0) console.log(`  新建：${t.created.join("、")}`)
    if (t.updated.length > 0) console.log(`  重建/更新：${t.updated.join("、")}`)
    if (t.skipped.length > 0) console.log(`  跳过（已就绪）：${t.skipped.join("、")}`)
    if (t.conflicts.length > 0) console.log(`  跳过（同名非本包产物，如需覆盖加 --force）：${t.conflicts.join("、")}`)
    for (const d of t.degraded) console.log(`  ⚠️ 降级为副本：${d.name}（链接创建失败：${d.reason}）`)
    for (const f of t.failed) console.log(`  ⚠️ 失败：${f.name}（${f.reason}）`)
    const modes: string[] = []
    if (t.links.length > 0) modes.push(`软链 ${t.links.length} 个`)
    if (t.copies.length > 0) modes.push(`副本 ${t.copies.length} 个`)
    if (modes.length > 0) console.log(`  产物形态：${modes.join(" / ")}`)
  }
  console.log("")
  if (report.skippedTargets.length > 0) {
    console.log(
      `未安装的 agent ${report.skippedTargets.length} 个已跳过（不在用户机器上凭空造目录）；如需装到未识别的 agent：toolkit skills install --dir <其全局技能目录>`,
    )
  }
  console.log(`${tag}状态文件：${report.stateFile}`)
  if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
}

// 打印现场状态：逐目标逐技能标注状态，末尾汇总需处理的条目
function printStatusReport(report: SkillsStatusReport): void {
  console.log(`技能源：${report.source}`)
  console.log(`状态文件：${report.stateFile}${report.stateExists ? "" : "（未记录，尚未执行过 toolkit skills install）"}`)
  let problems = 0
  for (const t of report.targets) {
    console.log("")
    console.log(`${t.label}：${t.dir}${t.dirExists ? "" : "（目录未创建）"}`)
    for (const item of t.items) {
      if (SKILL_PROBLEM_STATES.includes(item.state)) problems += 1
      console.log(`  ${item.name}：${SKILL_STATE_LABEL[item.state]}`)
    }
  }
  if (report.pendingAgents.length > 0) {
    console.log("")
    console.log(`未安装的 agent ${report.pendingAgents.length} 个未纳入分发（需要时用 toolkit skills install --dir <路径> 指定）`)
  }
  console.log("")
  console.log(problems > 0 ? `共 ${problems} 处需处理：执行 toolkit skills install 可补齐缺失、重建悬空或指向错误的链接` : "所有已纳入的目标均正常")
}

// 打印卸载报告：按目标区分已移除 / 已不存在 / 需人工确认三类，并说明状态文件处置
function printRemoveReport(report: SkillsRemoveReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  if (!report.stateExists) {
    console.log("未找到本包的状态文件，没有由本包安装的产物需要清理（其他方式安装的技能不受影响）")
    return
  }
  console.log(`${tag}状态文件：${report.stateFile}`)
  for (const t of report.targets) {
    console.log("")
    console.log(`${t.dir}`)
    if (t.removed.length > 0) console.log(`  ${dryRun ? "将移除" : "已移除"}：${t.removed.join("、")}`)
    if (t.missing.length > 0) console.log(`  已不存在：${t.missing.join("、")}`)
    if (t.skippedForeign.length > 0) console.log(`  ⚠️ 跳过（非本包产物或内容已被改动，请人工确认）：${t.skippedForeign.join("、")}`)
  }
  console.log("")
  if (dryRun) console.log("[预演] 未执行删除；无遗留条目时将同时删除状态文件")
  else if (report.stateRemoved) console.log("状态文件已删除，本包产物清理完毕")
  else console.log("状态文件已保留（存在需人工确认或未移除的条目）")
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

// skills 域：把包内 skills/ 分发到各 agent 的全局技能目录（真源唯一，默认软链以便升级自动跟随）
const skillsCmd = program
  .command("skills")
  .description("AI 技能包分发：安装 / 状态 / 卸载 / 路径（包内 skills/ 为唯一真源）")

// 安装：默认软链真源，链接创建失败自动降级副本；只写入「已安装」的 agent 目录，不凭空造目录
skillsCmd
  .command("install")
  .description("安装包内技能到全局技能目录（默认软链真源，链接失败自动降级副本）")
  .option("--copy", "强制以副本形式写入（不建软链）")
  .option("--dir <path>", "额外目标目录（可多次指定，兜底内置表未收录的 agent）", collectDir, [])
  .option("--dry-run", "预演（只预览将要执行的动作，不写文件）")
  .option("--force", "覆盖同名非本包产物（默认跳过，避免破坏用户自装技能）")
  .action((options: { copy?: boolean; dir: string[]; dryRun?: boolean; force?: boolean }) => {
    try {
      const report = installSkills({ copy: options.copy, dirs: options.dir, dryRun: options.dryRun, force: options.force })
      printInstallReport(report, Boolean(options.dryRun))
    } catch (e) {
      console.error(`⚠️ 安装失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 状态：报告悬空 / 指向错误 / 副本漂移 / 同名冲突 / 缺失，供人工决定是否重跑 install
skillsCmd
  .command("status")
  .description("查看各全局技能目录的现场状态（悬空 / 指向错误 / 副本漂移 / 缺失 / 冲突）")
  .action(() => {
    try {
      printStatusReport(skillsStatus())
    } catch (e) {
      console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 卸载：只清理状态文件记载的本包产物，绝不触碰用户自装技能或其他方式安装的技能
skillsCmd
  .command("remove")
  .description("卸载由本包安装的技能产物（只清理状态文件记载的条目，不碰用户自装技能）")
  .option("--dry-run", "预演（只预览将要移除的条目，不删文件）")
  .action((options: { dryRun?: boolean }) => {
    try {
      printRemoveReport(removeSkills({ dryRun: options.dryRun }), Boolean(options.dryRun))
    } catch (e) {
      console.error(`⚠️ 卸载失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 路径：输出包根（内含 skills/），便于委托上游安装器覆盖内置表未收录的 agent
skillsCmd
  .command("path")
  .description("输出包根路径（内含 skills/，可委托上游安装器安装到表外 agent）")
  .option("--json", "以 JSON 输出（包根、技能源目录、技能清单）")
  .action((options: { json?: boolean }) => {
    try {
      if (options.json) {
        console.log(
          JSON.stringify({ package: skillsPackageDir(), source: skillsSourceDir(), skills: listPackageSkills().map((s) => s.name) }, null, 2),
        )
      } else {
        console.log(skillsPackageDir())
      }
    } catch (e) {
      console.error(`⚠️ 定位包路径失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 裸 `toolkit skills`：打印本域帮助，列出 4 个子命令
skillsCmd.action(() => {
  skillsCmd.help()
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
  .argument("[command]", "子命令：archive / check / normalize / stats，留空为总览（含导入用 --import）")
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
      } else if (command === "stats") {
        // 统计视图：复用查询过滤参数，输出周期 / 滞留 / 吞吐三类指标
        try {
          const filter: TaskFilter = {}
          const multi = (v?: string): string[] | undefined => (v ? v.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : undefined)
          filter.owner = multi(options.owner)
          filter.scope = multi(options.scope)
          if (options.date) filter.date = options.date
          if (options.since) filter.since = options.since
          if (options.until) filter.until = options.until
          const stats = computeStats(dir, filter)
          if (options.format === "json") {
            console.log(JSON.stringify(stats, null, 2))
          } else {
            for (const line of renderStats(stats)) console.log(line)
          }
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
  // 链接自愈先于命令执行：升级后旧链接悬空时本次命令即复位（开关 skills.autoLink，CI 环境自动跳过）
  const repaired = autoLinkSkills()
  if (repaired > 0) console.log(`已自动修复 ${repaired} 个技能链接（如不需要可配置 .toolkitrc.json 的 skills.autoLink: false 关闭）`)
  await program.parseAsync(process.argv)
  void startUpdateCheck(version)
}
void main()
