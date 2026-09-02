#!/usr/bin/env node

import { createRequire } from "node:module"
import { execSync } from "node:child_process"
import { printTasks } from "./tasks/list"
import { archiveTasks } from "./tasks/archive"
import { languages, DEFAULT_LANG } from "./changelog/languages"
import { localDate, formatChangelogs } from "./changelog/format"

const require = createRequire(import.meta.url)

// 解析 @changesets/cli 的 bin 绝对路径（pnpm 下 bin 不提升到使用方，需显式定位）
const changesetBin = require.resolve("@changesets/cli/bin.js")

// 调用 changesets（子进程执行，继承 stdio）
const runChangeset = (cmd: string[]) => {
  execSync(`node "${changesetBin}" ${cmd.join(" ")}`, { stdio: "inherit" })
}

const args = process.argv.slice(2)
const domain = args[0]
const rest = args.slice(1)

if (domain === "tasks") {
  // 任务管理域
  const dirIdx = rest.indexOf("--dir")
  const dir = dirIdx >= 0 && rest[dirIdx + 1] ? rest[dirIdx + 1] : ".tasks"
  const command = rest.find((a) => !a.startsWith("--") && a !== dir) || "list"
  if (command === "archive") archiveTasks(dir)
  else printTasks(dir)
} else if (domain === "changelog") {
  // changelog 域
  const langIdx = rest.indexOf("--lang")
  const lang = langIdx >= 0 && rest[langIdx + 1] ? rest[langIdx + 1] : DEFAULT_LANG
  const cmd = rest.filter((_, i) => i !== langIdx && i !== langIdx + 1)
  const command = cmd[0]
  if (command === "version") {
    runChangeset(["version"])
    formatChangelogs(".", localDate(), languages[lang] ?? languages[DEFAULT_LANG])
  } else if (command === "format") {
    formatChangelogs(".", localDate(), languages[lang] ?? languages[DEFAULT_LANG])
  } else if (command) {
    runChangeset(cmd)
  } else {
    runChangeset([])
  }
} else {
  // 帮助
  console.log("用法：toolkit <tasks|changelog> ...")
  console.log("  toolkit tasks              任务总览")
  console.log("  toolkit tasks archive      归档已完成任务")
  console.log("  toolkit changelog          创建变更集")
  console.log("  toolkit changelog version  发版 + 多语言格式化")
  console.log("  toolkit changelog format   纯格式化")
}
