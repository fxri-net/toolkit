// 从命令注册表生成升级页的命令对照段：只重写标记之间的内容，避免页面手写第二份清单
import { readFileSync, writeFileSync } from "node:fs"

const START = "<!-- toolkit:command-table:start -->"
const END = "<!-- toolkit:command-table:end -->"
const PAGE = "docs/upgrade-v2.md"
const REGISTRY = "src/command-registry.ts"

// 已移除命令无别名，单独放在升级页置顶表，不混入「已改名」生成段
const REMOVED = new Set(["usage rule"])

// 从注册表源码提取旧路径与弃用目标：每条目一行，按行解析比整体求值更稳
function readMigrationRows() {
  const rows = []
  for (const line of readFileSync(REGISTRY, "utf8").split(/\r?\n/)) {
    const matched = /^\s*\{ path: "([^"]+)".*deprecatesTo: "([^"]+)".*\},?\s*$/.exec(line)
    if (matched && !REMOVED.has(matched[1])) rows.push([matched[1], matched[2]])
  }
  return rows
}

// 单元格转义：弃用目标里可能出现 `|`（如 config get|set），须转义
const cell = (value) => value.replace(/\|/g, "\\|")

function renderTable(rows) {
  if (rows.length === 0) return "（无）"
  return [
    "| 旧路径 | 新路径 |",
    "| --- | --- |",
    ...rows.map(([from, to]) => `| \`toolkit ${cell(from)}\` | \`toolkit ${cell(to)}\` |`),
  ].join("\n")
}

function main() {
  const check = process.argv.includes("--check")
  const page = readFileSync(PAGE, "utf8")
  const start = page.indexOf(START)
  const end = page.indexOf(END)
  if (start === -1 || end === -1 || end < start) {
    console.error(`⚠️ ${PAGE} 缺少命令对照生成标记`)
    process.exitCode = 1
    return
  }
  const body = renderTable(readMigrationRows())
  const next = `${page.slice(0, start + START.length)}\n${body}\n${page.slice(end)}`
  if (check) {
    if (next !== page) {
      console.error(`⚠️ ${PAGE} 的命令对照段与注册表不一致：运行 node scripts/generate-upgrade-table.mjs 更新`)
      process.exitCode = 1
    }
    return
  }
  if (next !== page) writeFileSync(PAGE, next, { encoding: "utf8" })
  console.log(`已生成命令对照表：${PAGE}`)
}

main()
