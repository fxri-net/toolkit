#!/usr/bin/env node
// 入口壳版本半自动抬升：正文变化时把 ENTRY_VERSION 次版本 +1，并刷新模板快照
// 结构或协议变更（主版本）仍需人工改：脚本只做「文案变更」这一档
// --no-bump 只刷新快照、不改版本，用于初始化或回填
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const formatFile = join(root, "src", "conventions", "format.ts")
const versionRe = /export const ENTRY_VERSION: EntryVersion = \{ major: (\d+), minor: (\d+) \}/

if (!process.argv.includes("--no-bump")) {
  const format = readFileSync(formatFile, "utf8")
  const matched = versionRe.exec(format)
  if (!matched) {
    console.error("未找到 ENTRY_VERSION 常量，无法抬版本")
    process.exit(1)
  }
  const nextMinor = Number(matched[2]) + 1
  writeFileSync(
    formatFile,
    format.replace(versionRe, `export const ENTRY_VERSION: EntryVersion = { major: ${matched[1]}, minor: ${nextMinor} }`),
    "utf8",
  )
  console.log(`入口壳版本抬至 v${matched[1]}.${nextMinor}`)
}

// 快照由真实实现渲染后写入，脚本不复制模板拼装逻辑
execSync("pnpm exec vitest run src/__tests__/entry-shell.test.ts -u", { cwd: root, stdio: "inherit" })
