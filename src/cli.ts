#!/usr/bin/env node

import { Command, CommanderError } from "commander"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { renderTaskBoard } from "./tasks/list"
import { queryTasks } from "./tasks/query"
import { exportTasks, toJSON } from "./tasks/export"
import { importTasks } from "./tasks/import"
import { archiveTasks } from "./tasks/archive"
import { computeStats, renderStats } from "./tasks/stats"
import { validateTasks, type CheckIssue } from "./tasks/validate"
import { checkArchive, fixArchive } from "./tasks/normalize"
import { listTaskFiles } from "./tasks/scan"
import type { TaskView, TaskFilter, ImportTarget } from "./tasks/types"
import { ALL_STATUSES } from "./tasks/types"
import { languages, DEFAULT_LANG, resolveLang, type ChangelogLanguage } from "./changelog/languages"
import { localDate, formatChangelogs, countUntypedEntries, findUntypedChangesetEntries, findUnbulletedChangesetEntries } from "./changelog/format"
import { auditChangesets, formatAuditReport } from "./changelog/audit"
import { checkDoc, resolveDocOptions, syncDoc, syncDocAfterVersion } from "./changelog/doc"
import { checkDocsTheme, writeDocsTheme } from "./docs/theme"
import { checkDocsDist, DIST_RULES_VERSION } from "./docs/dist"
import { checkDocsNav, NAV_RULES_VERSION } from "./docs/nav"
import type { DocsProblem } from "./docs/types"
import { resolveRedactEnabled } from "./privacy/redact"
import { resolveEnabled } from "./switch"
import { getConfigSection, resolveTasksDir } from "./config"
import { configStatus, foldHome, foldHomeInText, type ConfigStatusReport } from "./config-status"
import type { LocalConfigIgnoreState } from "./git-ignore"
import { INIT_LINKS } from "./init"
import { upgradeConventions, type UpgradeReport } from "./conventions/upgrade"
import { formatConventions, type FormatReport } from "./conventions/compact"
import { conventionsStatus, resolveCarrierRoot, type ConventionsStatusReport } from "./conventions/status"
import { toJsonText, assertJsonFormat } from "./json-output"
import { registerUsageCommands, setToolkitVersion } from "./usage"
import { composeRules, listRules, loadRuleset } from "./rules"
import { clearRulesSelection, readRulesSelection, writeRulesSelection } from "./rules/cache"
import { copyToClipboard } from "./rules/clipboard"
import { writeFileAtomic } from "./write-atomic"
import { autoLinkSkills } from "./skills"
import { emitVersionHint, runUpdateCheckWorker, UPDATE_CHECK_WORKER_ARG } from "./update-check"
import { collectSkillVersionUpdates } from "./skills/version-status"
import { setupHelp } from "./help"
import { formatCommanderError } from "./errors"
import { DESCRIPTION } from "./about"
import { registerInitCommands } from "./commands/init"
import { registerSkillsCommands } from "./commands/skills"
import { printJson, splitMulti } from "./commands/shared"

const require = createRequire(import.meta.url)

// 解析 @changesets/cli 的 bin 绝对路径（pnpm 下 bin 不提升到使用方，需显式定位）
const changesetBin = require.resolve("@changesets/cli/bin.js")
// 版本号从 package.json 读取，避免与 package.json 重复维护
const { version } = require("../package.json")
// 使用情况事件记录当前 toolkit 版本：库形态不依赖包路径，由入口统一注入
setToolkitVersion(version)

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

// changelog 软告警：提示缺类型前缀的变更集条目（须在归类前取数，归类后前缀缺失信息即丢失）
// 传全部配置语言，前缀识别与 tasks check 侧 changesetPrefixIssues 同一并集口径
function warnUntypedEntries(langs: ChangelogLanguage[]) {
  const count = countUntypedEntries(".", langs)
  if (count > 0) {
    console.warn(`⚠️ ${count} 条变更集条目缺类型前缀，建议按「类型：描述」撰写`)
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
    ...findUnbulletedChangesetEntries(".changeset", langs).map((entry) => ({
      level: "warn" as const,
      file: entry.file,
      line: entry.line,
      message: `变更集条目未加「- 」列表标记（本文件 ${entry.count} 行），changesets 会并入单一条目，请逐条写成「- 类型：描述」`,
    })),
  ]
}

// 打印校验结果（check / normalize --check 共用）；带行号的问题输出 file:line 便于编辑器跳转
function printIssues(issues: Array<{ file: string; line?: number; message: string }>) {
  if (issues.length === 0) {
    console.log("未发现问题")
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

const program = new Command()

// commander 解析失败时会自行把英文错误写到 stderr 后才抛异常，此处先缓存：
// 命中中文映射时丢弃原文案改由 main 统一输出，未命中（帮助/版本/未收录 code）则原样放行
let commanderErrBuffer = ""

program
  .name("toolkit")
  .description(DESCRIPTION)
  .version(version, "-v, --version", "显示版本号")
  .enablePositionalOptions(true)
  // 交回解析错误的控制权（否则 commander 自行 process.exit，异常捕不到）
  // ⚠️ 须在声明任何子命令之前调用：_exitCallback 只在 .command() 建子命令时按引用复制，之后再设不回溯
  .exitOverride()
  .configureOutput({ writeErr: (str) => { commanderErrBuffer += str } })

// help footer：指向文档站，降低新用户查找成本
program.addHelpText(
  "after",
  [
    "",
    "文档站：",
    `  快速开始 ${INIT_LINKS.gettingStarted}`,
    `  完整攻略 ${INIT_LINKS.guide}`,
    `  全部文档 ${INIT_LINKS.site}`,
  ].join("\n"),
)



// init 与 skills 域：命令注册与打印移入 ./commands 下的独立模块
registerInitCommands(program)
registerSkillsCommands(program)

// 打印升级报告：ID 映射（不落盘）+ 逐项结构动作 + 内部引用改写清单，风格与 skills install 预演一致
function printUpgradeReport(report: UpgradeReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  console.log(`${tag}任务区：${report.tasksDir}`)
  console.log(`${tag}载体：${report.dir}（形态 ${report.form}）`)
  if (report.status === "already-v3") {
    console.log(`${tag}已是 v3 形态，无需升级`)
    return
  }
  console.log("")
  if (report.idMap.length > 0) {
    console.log(`${tag}ID 映射（序号 → 稳定 ID，仅随报告输出，不落盘）：`)
    for (const row of report.idMap) console.log(`  ${row.seq} → ${row.id}  ${row.name}`)
    console.log("")
  }
  console.log(`${tag}结构动作：`)
  for (const c of report.changes) console.log(`  ${c.target}：${c.detail}`)
  if (report.refs.length > 0) {
    console.log("")
    console.log(`${tag}内部引用改写：`)
    for (const r of report.refs) console.log(`  ${r.file}：${r.from} → ${r.to}`)
  }
  if (report.reviews.length > 0) {
    console.log("")
    console.log(`${tag}待人工复核（只报不改）：`)
    for (const msg of report.reviews) console.log(`  ⚠️ ${msg}`)
  }
  console.log("")
  if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
  else console.log("已写入；升级前原件可由本次迁移提交的父提交复现")
}

// 打印体检报告：先给一句话结论，再列载体 / 入口壳现场与逐项待处理项（warn 带 ⚠️，info 带 ·）
function printConventionsStatus(report: ConventionsStatusReport): void {
  console.log(report.summary)
  if (!report.initialized) return
  const marker = report.carrierVersion === null ? "无" : `v${report.carrierVersion}`
  console.log(`任务区：${report.tasksDir}`)
  console.log(`载体：${report.dir}（形态 ${report.form}，形态标记 ${marker}，条目 ${report.entries}）`)
  console.log(
    `入口壳：${
      report.shells.length > 0
        ? report.shells.map((s) => `${s.file}（标记 ${s.version === null ? "无" : `v${s.version}`}${s.ignored ? "，被 gitignore 覆盖" : ""}）`).join("、")
        : "无"
    }`,
  )
  console.log("")
  if (report.items.length === 0) {
    console.log("无待处理项")
    return
  }
  for (const item of report.items) console.log(`${item.level === "warn" ? "⚠️" : "·"} [${item.scope}] ${foldHomeInText(item.message)}`)
}

// 打印归一报告：先给一句话结论，再列发生改动的文件与行号（风格与 upgrade 预演一致）
function printConventionsFormat(report: FormatReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  console.log(`${tag}任务区：${report.tasksDir}（扫描 ${report.files} 个 .md）`)
  if (report.status === "already-compact") {
    console.log(`${tag}表格已全部为紧凑形态，无需归一`)
    return
  }
  console.log("")
  console.log(`${tag}归一改动：${report.changedFiles} 个文件 / ${report.changedLines} 行`)
  for (const c of report.changes) {
    const shown = c.lines.slice(0, 6).join("、")
    console.log(`  ${c.file}：${c.lines.length} 行（${shown}${c.lines.length > 6 ? " …" : ""}）`)
  }
  console.log("")
  if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
  else console.log("已写入；紧凑形态即规范形态，重复执行不改动")
}

// conventions 域：规范载体的结构升级、表格形态归一与只读体检（载体细则见 skills/fxri-plan-to-task/references/conventions-spec.md）
const conventionsCmd = program
  .command("conventions")
  .description("项目协作规范载体：结构升级（v1 / v2 → v3）、表格形态归一（紧凑形态）与只读体检（形态 / 索引 / 入口层）")

// 升级：纯机械结构升级，先判后写；形态异常或未初始化时拒绝执行并给非 0 退出码（异常态不写任何文件）
conventionsCmd
  .command("upgrade")
  .description("把 v1 / v2 规范载体升级为 v3（v2：删「状态」「确立来源任务」两列、退休条目迁入 retired.md 并删分册小节；v1 链式升级；幂等，先判后写）")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
  .option("--dry-run", "预演（只预览将要执行的动作，不写文件）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { dir?: string; dryRun?: boolean; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const report = upgradeConventions(resolveTasksDir(options.dir), { dryRun: options.dryRun })
      if (options.format === "json") printJson({ dryRun: Boolean(options.dryRun), ...report })
      else printUpgradeReport(report, Boolean(options.dryRun))
    } catch (e) {
      console.error(`⚠️ 升级失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 归一：把格式化器填充出的表格收敛回紧凑形态（只动空白层与分隔行横线长度、不改语义；幂等，跳过代码块，先判后写）
conventionsCmd
  .command("format")
  .description("归一表格形态为紧凑形态（只动单元格间距、分隔行横线长度与列对齐填充；幂等、跳过 fenced code block，先报后写）")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
  .option("--dry-run", "预演（只预览将要归一的行，不写文件）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { dir?: string; dryRun?: boolean; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const report = formatConventions(resolveTasksDir(options.dir), { dryRun: options.dryRun })
      if (options.format === "json") printJson(report)
      else printConventionsFormat(report, Boolean(options.dryRun))
    } catch (e) {
      console.error(`⚠️ 归一失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 状态：只读体检，只报不改（不给 --fix）；体检本身不阻断、退出码恒 0，仅 --format 传非法值时按参数错误报错退出
conventionsCmd
  .command("status")
  .alias("check")
  .description("规范载体只读体检：形态 / 索引 / 入口层三块（只报不改，体检不阻断、退出码恒 0；仅 --format 传非法值时按参数错误报错退出）")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）；入口壳与检测入口按该目录所属仓库扫描")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { dir?: string; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const tasksDir = resolveTasksDir(options.dir)
      const report = conventionsStatus(tasksDir, resolveCarrierRoot(tasksDir))
      if (options.format === "json") printJson(report)
      else printConventionsStatus(report)
    } catch (e) {
      console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
    }
  })

// 裸 `toolkit conventions`：打印本域帮助，列出 3 个子命令
conventionsCmd.action(() => {
  conventionsCmd.help()
})

// 本地配置文件忽略状态的文本态文案（键集合与 src/git-ignore.ts 的 LocalConfigIgnoreState 对齐）
const CONFIG_IGNORE_LABEL: Record<LocalConfigIgnoreState, string> = {
  ignored: "已忽略",
  tracked: "已跟踪（需 git rm --cached）",
  "not-ignored": "未忽略",
  "not-a-repo": "不适用（非 git 仓库）",
  "outside-repo": "不适用（位于仓库工作树之外）",
  unavailable: "忽略判定不可用",
}

// 打印配置分层报告：先给一句话结论，再列三层现场 / 展示键来源 / 环境变量层 / 能力旁路 / 其余已配置段 / 待处理项
// 一律不打印配置值（redact 段含个人脱敏规则、skills 段含本机路径，落到终端 / CI 日志即外泄）
// 路径一律走 foldHome / foldHomeInText 折叠为 ~（层级路径与待处理项文案内嵌的路径同等处理），避免共享日志泄露本机目录结构
function printConfigStatus(report: ConfigStatusReport): void {
  console.log(report.summary)
  console.log(`查找起点：${foldHome(report.cwd)}`)
  console.log("")
  console.log("层级：")
  for (const level of report.levels) {
    const file = level.file === null ? "无" : foldHome(level.file)
    const ignore = level.ignored === null ? "" : `，${CONFIG_IGNORE_LABEL[level.ignored.state]}`
    console.log(`  ${level.layer}：${file}${ignore}`)
  }
  console.log("")
  console.log("展示键来源：")
  for (const item of report.displayKeys) console.log(`  ${item.key}：${item.source ?? "默认值"}`)
  console.log("")
  const pairs = (hits: Array<{ env: string; key: string }>) => (hits.length > 0 ? hits.map((h) => `${h.env} → ${h.key}`).join("、") : "无")
  console.log(`环境变量层：${pairs(report.env)}`)
  console.log(`能力旁路：${pairs(report.bypass)}`)
  console.log("")
  const groups = report.levels.filter((level) => level.otherSections.length > 0)
  if (groups.length === 0) {
    console.log("其余已配置段：无")
  } else {
    console.log("其余已配置段：")
    for (const level of groups) console.log(`  ${level.layer}：${level.otherSections.join("、")}`)
  }
  console.log("")
  if (report.items.length === 0) {
    console.log("无待处理项")
    return
  }
  for (const item of report.items) console.log(`${item.level === "warn" ? "⚠️" : "·"} [${item.scope}] ${item.message}`)
}

// config 域：三层配置文件的只读体检（层级 / 来源 / 忽略状态；载体细则见 docs/config.md）
const configCmd = program
  .command("config")
  .description("配置分层：只读查看三层配置文件（全局层 / 项目层 / 本地层）的生效情况与来源")

// 状态：只读体检，只报不改（不给 --fix）；体检本身不阻断、退出码恒 0，仅 --format 非法与 --cwd 非法时按参数错误报错退出
configCmd
  .command("status")
  .description("配置分层只读体检：三层命中 / 来源层 / 环境变量层（只读、退出码恒 0；无 --dir，可用 --cwd 指定查找起点）")
  .option("--cwd <path>", "向上查找的起始目录（缺省当前工作目录）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { cwd?: string; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const cwd = options.cwd === undefined ? process.cwd() : resolve(options.cwd)
      // 降级不静默：--cwd 非法时不回落 process.cwd()（回落会给出起点错误的报告，比报错更危险）
      if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
        console.error(`⚠️ --cwd 指向的路径不存在或非目录：${options.cwd}`)
        process.exitCode = 1
        return
      }
      const report = configStatus(cwd)
      if (options.format === "json") printJson(report)
      else printConfigStatus(report)
    } catch (e) {
      // 体检失败不置退出码：与 conventions status 对齐，「只读体检不阻断」是本命令的设计意图
      console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
    }
  })

// 裸 `toolkit config`：打印本域帮助，列出 1 个子命令
configCmd.action(() => {
  configCmd.help()
})

// docs 域：文档站工具，提供主题、导航与构建产物的校验与写入
const docsCmd = program.command("docs").description("文档站工具：主题、导航与产物的校验与写入")

// 默认主题目录：VitePress 约定的 docs/.vitepress/theme
const THEME_DIR = "docs/.vitepress/theme"

const themeCmd = docsCmd.command("theme").description("统一文档站主题：校验或写入（公共规则随包分发，品牌段由各站自留）")
themeCmd.action(() => {
  themeCmd.help()
})

themeCmd
  .command("check")
  .description("校验主题与模板是否一致（默认动作）")
  .option("--dir <path>", `主题目录（默认 ${THEME_DIR}）`)
  .action((options: { dir?: string }) => {
    const themeDir = resolve(options.dir ?? THEME_DIR)
    try {
      const result = checkDocsTheme(themeDir)
      if (result.ok) {
        console.log(`主题一致：${themeDir}`)
        return
      }
      console.error(`⚠️ 主题与模板不一致（${result.problems.length} 项）`)
      for (const problem of result.problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    } catch (e) {
      console.error(`⚠️ ${(e as Error).message}`)
      process.exitCode = 1
    }
  })

themeCmd
  .command("write")
  .description("写入或刷新模板，保留既有品牌段")
  .option("--dir <path>", `主题目录（默认 ${THEME_DIR}）`)
  .option("--force", "缺少品牌标记也覆盖")
  .action((options: { dir?: string; force?: boolean }) => {
    const themeDir = resolve(options.dir ?? THEME_DIR)
    try {
      const result = writeDocsTheme(themeDir, { force: options.force })
      for (const file of result.written) console.log(`写入：${file}`)
      for (const file of result.kept) console.log(`保留品牌段：${file}`)
    } catch (e) {
      console.error(`⚠️ ${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 默认文档目录：VitePress 约定的 docs
const DOCS_DIR = "docs"

// 文档站校验问题输出：warn 用 ⚠️、error 用 ✖，附规则 id 便于对照文档
function printDocsProblems(problems: DocsProblem[]): void {
  for (const problem of problems) {
    const mark = problem.level === "warn" ? "⚠️" : "✖"
    console.error(`  ${mark} [${problem.id}] ${problem.message}（${problem.file}）`)
  }
}

const navCmd = docsCmd.command("nav").description("文档站导航：按 site-nav.json 校验顶栏、侧栏、命名与页面体量")
navCmd.action(() => {
  navCmd.help()
})

navCmd
  .command("check")
  .description("校验 docs/site-nav.json 的结构与导航规则（数据单一真源，不解析站点配置）")
  .option("--dir <path>", `文档目录（默认 ${DOCS_DIR}）`)
  .option("--format <format>", "输出格式（json）")
  .action((options: { dir?: string; format?: string }) => {
    if (!assertJsonFormat(options.format)) return
    const result = checkDocsNav(resolve(options.dir ?? DOCS_DIR))
    if (options.format === "json") {
      console.log(toJsonText({ command: "docs nav check", ruleVersion: NAV_RULES_VERSION, ok: result.ok, problems: result.problems }))
    } else if (result.ok) {
      console.log(`导航校验通过：顶栏 ${result.navCount} 项、侧栏 ${result.sidebarCount} 组`)
    } else {
      console.error(`⚠️ 导航校验失败（${result.problems.filter((problem) => problem.level === "error").length} 项）`)
    }
    if (options.format !== "json") printDocsProblems(result.problems)
    if (!result.ok) process.exitCode = 1
  })

const distCmd = docsCmd.command("dist").description("文档站产物：校验 404 不进站点地图与站内搜索索引（需先构建）")
distCmd.action(() => {
  distCmd.help()
})

distCmd
  .command("check")
  .description("校验构建产物：404 页不进 sitemap 与站内搜索索引（产物缺失时跳过）")
  .option("--dir <path>", `文档目录（默认 ${DOCS_DIR}）`)
  .option("--format <format>", "输出格式（json）")
  .action((options: { dir?: string; format?: string }) => {
    if (!assertJsonFormat(options.format)) return
    const result = checkDocsDist(resolve(options.dir ?? DOCS_DIR))
    if (options.format === "json") {
      console.log(
        toJsonText({ command: "docs dist check", ruleVersion: DIST_RULES_VERSION, ok: result.ok, skipped: result.skipped, problems: result.problems }),
      )
    } else if (result.skipped) {
      console.log("跳过文档站产物校验：未找到 .vitepress/dist（需先执行文档站构建）")
    } else if (result.ok) {
      console.log("文档站产物校验通过：sitemap 不含 404、搜索索引不含 404 页")
    } else {
      console.error(`⚠️ 文档站产物校验失败（${result.problems.filter((problem) => problem.level === "error").length} 项）`)
    }
    if (options.format !== "json") printDocsProblems(result.problems)
    if (!result.ok) process.exitCode = 1
  })

// 裸 `toolkit docs`：打印本域帮助
docsCmd.action(() => {
  docsCmd.help()
})

// tasks 域：任务总览 / 归档 / 校验 / 归一化 / 统计 / 导入导出

// 任务子命令公共选项：目录、脱敏、软告警与严格模式
function addTasksCommonOptions(command: Command): Command {
  return command
    .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
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
    warn: resolveEnabled(options.warn, "FX_CHECK_WARN", getCheckWarnings(), true),
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

// 总览：视图 + 过滤 + 终端表格 / JSON
async function runTasksOverview(options: TasksQueryOptions): Promise<void> {
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
      console.log(toJSON(rows, summary, ctx.redact))
      return
    }
    renderTaskBoard(rows, summary, view, filter, ctx.redact)
    // 默认视图提示：带过滤但落在待完成视图无结果时，提示归档需要显式 --view（避免误以为过滤不生效）
    const hasFilter = Boolean(options.owner || options.scope || options.status || options.date || options.since || options.until)
    if (!options.view && hasFilter && rows.length === 0) {
      console.log("（提示：过滤默认作用于待完成视图，查看归档请加 --view archived 或 --view all）")
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
      console.warn("⚠️ 本次归档了任务，但 .changeset 无待发布变更集，如需发版请先创建变更集")
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
    printIssues(issues.filter((i) => i.level === "error"))
    if (ctx.warn) {
      console.log(`【warn】${issues.length - errorCount} 项`)
      printIssues(issues.filter((i) => i.level === "warn"))
    } else {
      console.log("（软告警已关闭，warn 不展示）")
    }
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
    if (options.format === "json") printJson(stats)
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
      console.log(`已修复 ${result.fixed} 处`)
      if (result.issues.length > 0) {
        console.log("以下问题需人工确认：")
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
    console.log(`已导出 ${rows.length} 个任务 → ${path}`)
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
  const section = getConfigSection("tasks")
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

const tasksCmd = program.command("tasks").description("任务管理")

addTasksCommonOptions(tasksCmd)
addTasksFilterOptions(tasksCmd)
tasksCmd
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action(async (options: TasksQueryOptions) => {
    await runTasksOverview(options)
  })

// list 为隐式子命令：`toolkit tasks list` 等价于裸 `tasks` 看板，补命令名与直觉不一致的入口
const tasksListCmd = tasksCmd.command("list", { hidden: true })
addTasksCommonOptions(tasksListCmd)
addTasksFilterOptions(tasksListCmd)
tasksListCmd.option("--format <format>", "输出格式（json，输出到 stdout）").action(async (options: TasksQueryOptions) => {
  await runTasksOverview(options)
})

addTasksCommonOptions(tasksCmd.command("archive").description("归档已完成任务"))
  .option("--dry-run", "预演（只预览，不落盘）")
  .option("--task <key>", "只归档指定任务（唯一键）")
  .action((options: TasksCommonOptions & { dryRun?: boolean; task?: string }) => {
    runTasksArchive(options)
  })

addTasksCommonOptions(tasksCmd.command("check").description("校验任务区：规则与变更集前缀，存在 error 时退出码 1"))
  .action((options: TasksCommonOptions) => {
    runTasksCheck(options)
  })

addTasksCommonOptions(tasksCmd.command("normalize").description("归档块归一化：默认只读检查，--fix 修复"))
  .option("--fix", "修复归档块问题")
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

// changelog 域：doc / version / format / audit 自处理，其余子命令透传给 changesets

// 语言与开关选项：自处理子命令共用
interface ChangelogOptions {
  lang?: string
  redact?: boolean
  warn?: boolean
}

// 自处理子命令公共选项
function addChangelogCommonOptions(command: Command): Command {
  return command
    .option("--lang <lang>", "语言 zh/en", DEFAULT_LANG)
    .option("--redact", "开启隐私脱敏")
    .option("--no-redact", "关闭隐私脱敏")
    .option("--warn", "开启软告警")
    .option("--no-warn", "关闭软告警")
}

// 解析语言与开关：未知语言回落默认并告警
function resolveChangelogContext(options: ChangelogOptions): {
  merged: ReturnType<typeof resolveLanguages>
  lang: ChangelogLanguage
  docLang: string
  redact: boolean
  warn: boolean
} {
  const merged = resolveLanguages()
  const { lang, unknown } = resolveLang(merged, options.lang ?? DEFAULT_LANG, DEFAULT_LANG)
  if (unknown) console.warn(`⚠️ 未知语言「${unknown}」，已回落 ${DEFAULT_LANG}`)
  return {
    merged,
    lang,
    docLang: unknown ? DEFAULT_LANG : (options.lang ?? DEFAULT_LANG),
    redact: resolveRedactEnabled(options.redact),
    warn: resolveEnabled(options.warn, "FX_CHECK_WARN", getCheckWarnings(), true),
  }
}

// 版本：消费变更集 → 归类格式化 → 同步文档镜像
function runChangelogVersion(options: ChangelogOptions & { history?: boolean; syncDoc?: boolean }): void {
  const ctx = resolveChangelogContext(options)
  // 软告警：发版前存在未归档任务
  if (ctx.warn && hasActiveTasks()) {
    console.warn("⚠️ 存在未归档的 active 任务，建议先归档再发版")
  }
  runChangeset(["version"])
  // 软告警须前置于归类（须待 changesets 写入新块后再取数，否则无英文源标题块可扫）；
  // 归类后无前缀条目即并入兜底组，前缀缺失无从统计
  if (ctx.warn) warnUntypedEntries(Object.values(ctx.merged))
  formatChangelogs(".", localDate(), ctx.lang, ctx.redact, Boolean(options.history))
  // 发版后自动同步文档站镜像：失败只告警，不阻断发版（镜像不是发版必需产物）
  if (options.syncDoc !== false) syncDocAfterVersion(ctx.docLang)
}

// 格式化：按语言与类型归类重排，不消费变更集
function runChangelogFormat(options: ChangelogOptions & { history?: boolean }): void {
  const ctx = resolveChangelogContext(options)
  if (ctx.warn) warnUntypedEntries(Object.values(ctx.merged))
  formatChangelogs(".", localDate(), ctx.lang, ctx.redact, Boolean(options.history))
}

// 文档镜像：默认从根 CHANGELOG.md 生成，--check 只比对不写
function runChangelogDoc(
  options: ChangelogOptions & { check?: boolean; from?: string; to?: string; title?: string; outline?: string; frontmatter?: boolean },
): void {
  const ctx = resolveChangelogContext(options)
  try {
    const docOptions = resolveDocOptions({
      from: options.from,
      to: options.to,
      title: options.title,
      outline: options.outline,
      // --no-frontmatter 未传时 commander 给 true，视为未传，交由配置决定
      frontmatter: options.frontmatter === false ? false : undefined,
      lang: ctx.docLang,
    })
    if (options.check) {
      const result = checkDoc(docOptions)
      if (!result.ok) {
        console.error(`⚠️ CHANGELOG 镜像不一致：第 ${result.line} 行`)
        if (result.expected !== undefined) console.error(`  期望：${result.expected}`)
        if (result.actual !== undefined) console.error(`  实际：${result.actual}`)
        process.exitCode = 1
        return
      }
      console.log(`CHANGELOG 镜像一致：${docOptions.target}`)
      return
    }
    const result = syncDoc(docOptions)
    console.log(result.changed ? `CHANGELOG 镜像已更新：${docOptions.target}` : `CHANGELOG 镜像无变化：${docOptions.target}`)
  } catch (e) {
    console.error(`⚠️ ${(e as Error).message}`)
    process.exitCode = 1
  }
}

// 审计：只列出同对象净变更候选，不改写
function runChangelogAudit(): void {
  console.log(formatAuditReport(auditChangesets(".changeset")))
}

const changelogCmd = program.command("changelog").description("多语言 CHANGELOG（封装 changesets）")
changelogCmd.enablePositionalOptions(true)

addChangelogCommonOptions(changelogCmd.command("version").description("消费变更集并生成新版本块，随后同步文档镜像"))
  .option("--history", "追溯改写历史版本块（默认保留）")
  .option("--no-sync-doc", "不自动同步文档站镜像")
  .action((options: ChangelogOptions & { history?: boolean; syncDoc?: boolean }) => {
    runChangelogVersion(options)
  })

addChangelogCommonOptions(changelogCmd.command("format").description("按语言与类型归类重排 CHANGELOG 条目"))
  .option("--history", "追溯改写历史版本块（默认保留）")
  .action((options: ChangelogOptions & { history?: boolean }) => {
    runChangelogFormat(options)
  })

addChangelogCommonOptions(changelogCmd.command("doc").description("生成或校验文档站 CHANGELOG 镜像页"))
  .option("--check", "只比对镜像页与根 CHANGELOG，不写文件")
  .option("--from <path>", "根 CHANGELOG 路径")
  .option("--to <path>", "镜像页路径")
  .option("--title <text>", "镜像页标题")
  .option("--outline <value>", "frontmatter outline")
  .option("--no-frontmatter", "不写 frontmatter")
  .action((options: ChangelogOptions & { check?: boolean; from?: string; to?: string; title?: string; outline?: string; frontmatter?: boolean }) => {
    runChangelogDoc(options)
  })

addChangelogCommonOptions(changelogCmd.command("audit").description("审计待发布变更集，列出需要合并的候选（只提示不改写）"))
  .action(() => {
    runChangelogAudit()
  })

// 裸 changelog：仍透传给 changesets（无参数时按其默认行为）
changelogCmd.action(() => {
  runChangeset([])
})

// changesets 原生子命令：参数原样透传
const CHANGESET_PASSTHROUGH: Array<[string, string]> = [
  ["add", "新增变更集（透传给 changesets）"],
  ["status", "查看待发布变更集状态（透传给 changesets）"],
  ["pre", "进入或退出预发布模式（透传给 changesets）"],
  ["tag", "为已发布版本打标签（透传给 changesets）"],
  ["init", "初始化 .changeset 配置（透传给 changesets）"],
  ["publish", "发布变更集（透传给 changesets）"],
]
for (const [name, description] of CHANGESET_PASSTHROUGH) {
  changelogCmd
    .command(name)
    .description(description)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[args...]", "透传给 changesets 的参数")
    .action((args: string[]) => {
      runChangeset([name, ...(args ?? [])])
    })
}

// 规则域：全局规则模块的自由组合、复制与缓存管理
const rulesCmd = program.command("rules").description("全局规则：列出模块、组合输出与缓存管理")
rulesCmd.action(() => {
  rulesCmd.help()
})

rulesCmd
  .command("list")
  .description("列出规则模块、预设与当前缓存选择")
  .option("--format <format>", "输出格式（json）")
  .action((options: { format?: string }) => {
    try {
      if (options.format && options.format !== "json") console.error("⚠️ --format 仅支持 json，已回落文本输出")
      const listed = listRules()
      const selection = readRulesSelection(listed.modules.map((mod) => mod.id))
      if (options.format === "json") {
        console.log(JSON.stringify({ ...listed, selection: selection?.modules ?? null }, null, 2))
        return
      }
      console.log("规则模块：")
      for (const mod of listed.modules) {
        const mark = selection?.modules.includes(mod.id) ? "●" : " "
        console.log(`  ${mark} ${mod.id.padEnd(8)} ${mod.anchor}  ${mod.title}（${mod.presets.join(" / ") || "无预设"}）`)
      }
      console.log(`预设：${Object.entries(listed.presets).map(([name, ids]) => `${name}=${ids.join("+")}`).join("；")}`)
      console.log(`当前缓存：${selection ? selection.modules.join(" → ") : "无（默认 recommended）"}`)
    } catch (error) {
      console.error(`⚠️ ${(error as Error).message}`)
      process.exitCode = 1
    }
  })

rulesCmd
  .command("compose")
  .description("组合规则模块并输出（默认输出到 stdout）")
  .option("--preset <name>", "预设：minimal / recommended / complete / full")
  .option("--module <id...>", "模块 id（可重复，也可逗号分隔）")
  .option("--no-anchor", "不输出首行更新时间锚点")
  .option("--out <file>", "写入文件（stdout 为空）")
  .option("--copy", "写入系统剪贴板（stdout 为空）")
  .option("--no-cache", "不读取也不写入组合缓存")
  .action((options: { preset?: string; module?: string[]; anchor?: boolean; out?: string; copy?: boolean; cache?: boolean }) => {
    try {
      if (options.copy && options.out) {
        console.error("⚠️ --copy 与 --out 不能同时使用")
        process.exitCode = 1
        return
      }
      const rawModules = options.module ?? []
      const modules = rawModules
        .flatMap((item) => item.split(/[,，]/))
        .map((item) => item.trim())
        .filter(Boolean)
      if (rawModules.length > 0 && modules.length === 0) {
        console.error("⚠️ --module 不能为空")
        process.exitCode = 1
        return
      }
      if (options.preset && modules.length > 0) {
        console.error("⚠️ --preset 与 --module 不能同时使用")
        process.exitCode = 1
        return
      }
      const ruleset = loadRuleset()
      const cached = options.cache === false ? null : readRulesSelection(ruleset.modules.map((mod) => mod.id))
      let ids: string[]
      let explicit = false
      if (modules.length > 0) {
        ids = modules
        explicit = true
      } else if (options.preset) {
        const preset = ruleset.presets[options.preset]
        if (!preset) {
          console.error(`⚠️ 未知预设「${options.preset}」，可选：${Object.keys(ruleset.presets).join(" / ")}`)
          process.exitCode = 1
          return
        }
        ids = preset
        explicit = true
      } else if (cached) {
        ids = cached.modules
      } else {
        ids = ruleset.presets.recommended ?? []
      }
      const text = composeRules(ids, { anchor: options.anchor !== false })
      if (explicit && options.cache !== false) {
        // 导出 / 复制属一次性动作，不改变「下次裸跑 compose」的默认组合
        if (options.out || options.copy) {
          console.error("已跳过组合缓存写入（--out / --copy 不改变默认组合）")
        } else {
          writeRulesSelection(ids)
          console.error(`已记住本次组合（${ids.join(" → ")}），下次直接 rules compose 复用`)
        }
      }
      if (options.copy) {
        const result = copyToClipboard(text)
        if (!result.ok) {
          console.error(`⚠️ 写入剪贴板失败：${result.error}`)
          process.exitCode = 1
          return
        }
        console.error(`已复制到剪贴板（${result.command}）`)
        return
      }
      if (options.out) {
        mkdirSync(dirname(resolve(options.out)), { recursive: true })
        writeFileAtomic(options.out, `${text}\n`)
        console.error(`已写入：${options.out}`)
        return
      }
      console.log(text)
    } catch (error) {
      console.error(`⚠️ ${(error as Error).message}`)
      process.exitCode = 1
    }
  })

rulesCmd
  .command("reset")
  .description("清除规则组合缓存")
  .action(() => {
    console.log(clearRulesSelection() ? "已清除规则组合缓存" : "无规则组合缓存可清除")
  })

// 使用情况域：技能使用统计（默认关闭，本地存储）
registerUsageCommands(program)

// 帮助口径统一：命令声明完毕后递归换中文帮助文案并对齐父级清单
// ⚠️ 顺序：须先 setupHelp 再 helpCommand——help 子命令自带 helpOption(false)，反过来会把它的 Usage 撑成 [options] [command]
setupHelp(program)
program.helpCommand("help [command]", "显示帮助")

ensureUtf8()
// main 包装：兼容 CJS 产物（顶层 await 仅 ESM 支持）；主命令完成后同步读缓存提示升级（零网络、不影响退出码）
async function main(): Promise<void> {
  // 内部升级检查 worker：仅联网刷新缓存后退出，不执行命令、不做技能自愈（参数由版本提示器派生时注入）
  if (process.argv[2] === UPDATE_CHECK_WORKER_ARG) {
    await runUpdateCheckWorker()
    return
  }
  // 链接自愈先于命令执行：升级后旧链接悬空时本次命令即复位（开关 skills.autoLink，CI 环境自动跳过）
  const repaired = autoLinkSkills()
  // 提示走 stderr：stdout 为机器可读输出（--format json）的专用通道，不得混入诊断信息
  if (repaired > 0) console.error(`已自动修复 ${repaired} 个技能链接（如不需要可配置 .toolkitrc.json 的 skills.autoLink: false 关闭）`)
  try {
    await program.parseAsync(process.argv)
  } catch (err) {
    // exitOverride 后 commander 把「解析失败」与「已输出帮助/版本」统一改为抛异常，均经此收口
    if (!(err instanceof CommanderError)) throw err
    const zh = formatCommanderError(err)
    // 命中映射：丢弃 commander 英文原文，改输出中文提示；未命中（帮助/版本等）：原样放行
    if (zh) console.error(zh)
    else process.stderr.write(commanderErrBuffer)
    process.exitCode = err.exitCode
  } finally {
    // 所有路径统一收口：成功命令按通道输出一行提示；帮助 / 版本 / JSON / 透传在函数内跳过。
    // 技能取证按需触发：不可提示的命令不读技能文件
    const skillAlerts = () => {
      const updates = collectSkillVersionUpdates()
      return [
        ...updates.builtin.map((item) => ({ channel: "builtin" as const, name: item.name, current: item.installed, latest: item.latest })),
        ...updates.external.map((item) => ({ channel: "external" as const, source: item.source, name: item.name, current: item.installed, latest: item.latest })),
      ]
    }
    emitVersionHint(version, {
      argv: process.argv.slice(2),
      exitCode: typeof process.exitCode === "number" ? process.exitCode : 0,
      skillAlerts,
    })
  }
}
// 执行语义不变，仅导出 Promise 供测试 await 主流程（cli.ts 无法被静态 import，见 src/__tests__/options-matrix.test.ts）
export const cliReady = main()
