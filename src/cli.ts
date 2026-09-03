#!/usr/bin/env node

import { Command } from "commander"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { printTasks } from "./tasks/list"
import { archiveTasks } from "./tasks/archive"
import { validateTasks } from "./tasks/validate"
import { checkArchive, fixArchive } from "./tasks/normalize"
import { listTaskFiles } from "./tasks/scan"
import { languages, DEFAULT_LANG } from "./changelog/languages"
import { localDate, formatChangelogs } from "./changelog/format"
import { resolveRedactEnabled } from "./privacy/redact"
import { resolveEnabled } from "./switch"
import { getConfigSection } from "./config"

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

const program = new Command()

program
  .name("toolkit")
  .description("开发工程化工具集：任务管理 + 多语言 CHANGELOG 发布")
  .version(version, "-v, --version", "显示版本号")
  .enablePositionalOptions(true)

// tasks 域：任务总览 / 归档 / 校验 / 归一化
program
  .command("tasks")
  .description("任务管理")
  .option("--dir <path>", "任务目录", ".tasks")
  .option("--redact", "开启隐私脱敏")
  .option("--no-redact", "关闭隐私脱敏")
  .option("--warn", "开启软告警")
  .option("--no-warn", "关闭软告警")
  .option("--dry-run", "归档预演（仅 archive 有效）")
  .option("--fix", "归一化修复（仅 normalize 有效）")
  .argument("[command]", "子命令：archive / check / normalize，留空为总览")
  .action(
    (
      command: string | undefined,
      options: { dir: string; redact: boolean | undefined; warn: boolean | undefined; dryRun: boolean; fix: boolean },
    ) => {
      const redact = resolveRedactEnabled(options.redact)
      const warn = resolveEnabled(options.warn, "FX_CHECK_WARN", getCheckWarnings(), true)
      const dir = options.dir

      if (command === "archive") {
        const result = archiveTasks(dir, redact, { dryRun: options.dryRun, warn })
        // 软告警：归档了任务但无待发布变更集（仅真实归档时提示，预演不提示）
        if (warn && !options.dryRun && result.archived > 0 && !hasPendingChangeset()) {
          console.warn("⚠️ 本次归档了任务，但 .changeset 无待发布变更集，如需发版请先创建变更集")
        }
      } else if (command === "check") {
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
      } else if (command === "normalize") {
        if (options.fix) {
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
      } else {
        printTasks(dir, redact)
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
      const lang = languages[options.lang] ?? languages[DEFAULT_LANG]
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
program.parse()
