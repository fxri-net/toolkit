// 从命令注册表生成升级页的命令对照段：只重写标记之间的内容，避免页面手写第二份清单
import { readFileSync, writeFileSync } from "node:fs"

const START = "<!-- toolkit:command-table:start -->"
const END = "<!-- toolkit:command-table:end -->"
const PAGE = "docs/upgrade-v2.md"
const REGISTRY = "src/command-registry.ts"

// 已移除命令无别名，单独放在升级页置顶表，不混入「已改名」生成段
const REMOVED = new Set(["usage rule"])

// 从注册表源码提取旧路径与弃用目标：每条目一行，按行解析比整体求值更稳。
// 不变量：解析条数（含 REMOVED 跳过项）必须等于源码中 deprecatesTo: 的出现次数——换行或调序时显式报错而非静默少行
function readMigrationRows(text = readFileSync(REGISTRY, "utf8")) {
  const rows = []
  let skipped = 0
  for (const line of text.split(/\r?\n/)) {
    const matched = /^\s*\{ path: "([^"]+)".*deprecatesTo: "([^"]+)".*\},?\s*$/.exec(line)
    if (!matched) continue
    if (REMOVED.has(matched[1])) {
      skipped += 1
      continue
    }
    rows.push([matched[1], matched[2]])
  }
  const declared = [...text.matchAll(/deprecatesTo:/g)].length
  if (rows.length + skipped !== declared) {
    throw new Error(`解析到 ${rows.length + skipped} 条迁移（含跳过 ${skipped}），但注册表出现 ${declared} 处 deprecatesTo:，结构可能已变化`)
  }
  return rows
}

// 假现场：单行写法可解析；改成多行后不变量必须报错
function selfTest() {
  const single = '  { path: "tasks", description: "示例", stage: "current", deprecatesTo: "task" },\n'
  const reformatted = ['  {', '    path: "tasks",', '    deprecatesTo: "task",', '  },'].join("\n")
  const parsed = readMigrationRows(single)
  let detected = false
  try {
    readMigrationRows(reformatted)
  } catch {
    detected = true
  }
  if (parsed.length !== 1 || parsed[0][0] !== "tasks" || !detected) {
    console.error(`⚠️ 命令对照生成器自检失败：解析 ${parsed.length} 条（期望 1），结构漂移检出 ${detected}`)
    process.exit(1)
  }
  console.log("命令对照生成器自检通过：单行解析与结构漂移拦截正常")
}

if (process.argv.includes("--self-test")) {
  selfTest()
  process.exit(0)
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
  let body
  try {
    body = renderTable(readMigrationRows())
  } catch (error) {
    console.error(`⚠️ ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }
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
