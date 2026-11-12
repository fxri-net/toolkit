#!/usr/bin/env node

import { Command, CommanderError } from "commander"
import { createRequire } from "node:module"
import { existsSync, mkdirSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { checkDocsTheme, writeDocsTheme } from "./docs/theme"
import { checkDocsDist, DIST_RULES_VERSION } from "./docs/dist"
import { checkDocsNav, NAV_RULES_VERSION } from "./docs/nav"
import type { DocsProblem } from "./docs/types"
import { configStatus, foldHome, foldHomeInText, type ConfigStatusReport } from "./config-status"
import type { LocalConfigIgnoreState } from "./git-ignore"
import { INIT_LINKS } from "./init"
import { upgradeConventions, type UpgradeReport } from "./conventions/upgrade"
import { formatConventions, type FormatReport } from "./conventions/compact"
import { conventionsStatus, resolveCarrierRoot, type ConventionsStatusReport } from "./conventions/status"
import { assertJsonFormat, toJsonText } from "./json-output"
import { resolveTasksDir } from "./config"
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
import { registerTasksCommands } from "./commands/tasks"
import { registerChangelogCommands } from "./commands/changelog"
import { printJson } from "./commands/shared"

const require = createRequire(import.meta.url)

// 版本号从 package.json 读取，避免与 package.json 重复维护
const { version } = require("../package.json")
// 使用情况事件记录当前 toolkit 版本：库形态不依赖包路径，由入口统一注入
setToolkitVersion(version)


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



// tasks 与 changelog 域：命令注册与打印移入 ./commands 下的独立模块
registerTasksCommands(program)
registerChangelogCommands(program)

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
