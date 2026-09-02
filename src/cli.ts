#!/usr/bin/env node

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

// 调用 changesets（子进程执行，继承 stdio）
// process.execPath + 数组传参：规避 shell 转义差异，不依赖 PATH 中的 node 版本
const runChangeset = (cmd: string[]) => {
  const res = spawnSync(process.execPath, [changesetBin, ...cmd], { stdio: "inherit" })
  // 透传子进程退出码，失败时不静默吞掉
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const args = process.argv.slice(2)
const domain = args[0]
const rest = args.slice(1)
// 隐私脱敏开关：默认开启；--no-redact / FX_REDACT=0 / .toolkitrc.json 的 enabled=false 均可关闭
const redact = resolveRedactEnabled(args)

if (domain === "tasks") {
  // 任务管理域
  const dirIdx = rest.indexOf("--dir")
  const dir = dirIdx >= 0 && rest[dirIdx + 1] ? rest[dirIdx + 1] : ".tasks"
  const command = rest.find((a) => !a.startsWith("--") && a !== dir) || "list"
  if (command === "archive") archiveTasks(dir, redact)
  else printTasks(dir, redact)
} else if (domain === "changelog") {
  // changelog 域
  const langIdx = rest.indexOf("--lang")
  const lang = langIdx >= 0 && rest[langIdx + 1] ? rest[langIdx + 1] : DEFAULT_LANG
  // 有 --lang 时剔除语言参数；无 --lang 时 rest 即命令列表；再剔除 --no-redact
  const cmd = (langIdx >= 0 ? rest.filter((_, i) => i !== langIdx && i !== langIdx + 1) : rest).filter(
    (a) => a !== "--no-redact",
  )
  const command = cmd[0]
  if (command === "version") {
    runChangeset(["version"])
    formatChangelogs(".", localDate(), languages[lang] ?? languages[DEFAULT_LANG], redact)
  } else if (command === "format") {
    formatChangelogs(".", localDate(), languages[lang] ?? languages[DEFAULT_LANG], redact)
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
