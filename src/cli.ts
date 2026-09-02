#!/usr/bin/env node

import { Command } from "commander"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { printTasks } from "./tasks/list"
import { archiveTasks } from "./tasks/archive"
import { languages, DEFAULT_LANG } from "./changelog/languages"
import { localDate, formatChangelogs } from "./changelog/format"
import { resolveRedactEnabled } from "./privacy/redact"

const require = createRequire(import.meta.url)

// 解析 @changesets/cli 的 bin 绝对路径（pnpm 下 bin 不提升到使用方，需显式定位）
const changesetBin = require.resolve("@changesets/cli/bin.js")
// 版本号从 package.json 读取，避免与 package.json 重复维护
const { version } = require("../package.json")

// 调用 changesets（子进程执行，继承 stdio）
// process.execPath + 数组传参：规避 shell 转义差异，不依赖 PATH 中的 node 版本
const runChangeset = (cmd: string[]) => {
  const res = spawnSync(process.execPath, [changesetBin, ...cmd], { stdio: "inherit" })
  // 透传子进程退出码，失败时不静默吞掉
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const program = new Command()

program
  .name("toolkit")
  .description("开发工程化工具集：任务管理 + 多语言 CHANGELOG 发布")
  .version(version, "-v, --version", "显示版本号")
  .enablePositionalOptions(true)

// tasks 域：任务总览与归档
program
  .command("tasks")
  .description("任务管理")
  .option("--dir <path>", "任务目录", ".tasks")
  .option("--no-redact", "关闭隐私脱敏")
  .argument("[command]", "子命令：archive 归档，留空为总览")
  .action((command: string | undefined, options: { dir: string; redact: boolean }) => {
    const redact = resolveRedactEnabled(options.redact)
    if (command === "archive") archiveTasks(options.dir, redact)
    else printTasks(options.dir, redact)
  })

// changelog 域：version/format 自处理，其余子命令透传给 changesets
program
  .command("changelog")
  .description("多语言 CHANGELOG（封装 changesets）")
  .option("--lang <lang>", "语言 zh/en", DEFAULT_LANG)
  .option("--no-redact", "关闭隐私脱敏")
  .argument("[command...]", "子命令及参数（透传给 changesets）")
  .passThroughOptions(true)
  .action((operands: string[], options: { lang: string; redact: boolean }) => {
    const redact = resolveRedactEnabled(options.redact)
    const lang = languages[options.lang] ?? languages[DEFAULT_LANG]
    const command = operands[0]
    if (command === "version") {
      runChangeset(["version"])
      formatChangelogs(".", localDate(), lang, redact)
    } else if (command === "format") {
      formatChangelogs(".", localDate(), lang, redact)
    } else if (command) {
      runChangeset(operands)
    } else {
      runChangeset([])
    }
  })

program.parse()
