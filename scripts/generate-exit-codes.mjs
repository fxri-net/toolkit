// 退出码文档生成器：从 src/exit-codes.ts 的 EXIT_CODE_TABLE 生成 docs/cli/exit-codes.md 的表格块
// 用法：node scripts/generate-exit-codes.mjs [--check] [--self-test]
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceFile = join(root, "src", "exit-codes.ts")
const docFile = join(root, "docs", "cli", "exit-codes.md")
const START = "<!-- toolkit:exit-codes:start -->"
const END = "<!-- toolkit:exit-codes:end -->"

/**
 * 从源码文本解析表格行。
 * @param {string} text src/exit-codes.ts 内容
 * @return {{code: string, name: string, meaning: string, scene: string}[]} 行数据
 */
export function parseRows(text) {
  const rows = []
  const pattern = /\{\s*code:\s*(\d+),\s*name:\s*"([^"]*)",\s*meaning:\s*"([^"]*)",\s*scene:\s*"([^"]*)",?\s*\}/g
  for (const match of text.matchAll(pattern)) {
    rows.push({ code: match[1], name: match[2], meaning: match[3], scene: match[4] })
  }
  return rows
}

/**
 * 渲染 markdown 表格块（含标记）。
 * @param {{code: string, name: string, meaning: string, scene: string}[]} rows 行数据
 * @return {string} 带标记的表格块
 */
export function renderBlock(rows) {
  const lines = [START, "| 退出码 | 常量 | 含义 | 场景 |", "| --- | --- | --- | --- |"]
  for (const row of rows) lines.push(`| \`${row.code}\` | ${row.name} | ${row.meaning} | ${row.scene} |`)
  lines.push(END)
  return lines.join("\n")
}

/**
 * 用生成块替换文档中的标记区间；标记缺失时返回 null。
 * @param {string} text 文档内容
 * @param {string} block 生成块
 * @return {string|null} 替换后的内容
 */
export function applyBlock(text, block) {
  const start = text.indexOf(START)
  const end = text.indexOf(END)
  if (start < 0 || end < 0 || end < start) return null
  return text.slice(0, start) + block + text.slice(end + END.length)
}

// 假现场：表格渲染、替换与漂移判定都在内存中断言，不写盘
function selfTest() {
  const rows = [
    { code: "0", name: "OK", meaning: "成功", scene: "全部" },
    { code: "130", name: "CANCEL", meaning: "取消", scene: "交互" },
  ]
  const block = renderBlock(rows)
  if (!block.includes("| `130` | CANCEL |") || !block.includes(START) || !block.includes(END)) {
    console.error("⚠️ 退出码生成器自检失败：表格渲染不符合预期")
    process.exit(1)
  }
  const fixture = `intro\n${START}\nold\n${END}\ntail\n`
  const applied = applyBlock(fixture, block)
  if (applied === null || !applied.startsWith("intro") || !applied.endsWith("tail\n") || applied.includes("old")) {
    console.error("⚠️ 退出码生成器自检失败：标记区间替换不符合预期")
    process.exit(1)
  }
  const drift = applyBlock(applied, renderBlock([...rows].reverse())) !== applied
  if (!drift) {
    console.error("⚠️ 退出码生成器自检失败：内容变化未被判定为漂移")
    process.exit(1)
  }
  console.log("退出码生成器自检通过：渲染、替换与漂移判定正常")
}

if (process.argv.includes("--self-test")) {
  selfTest()
  process.exit(0)
}

const rows = parseRows(readFileSync(sourceFile, "utf8"))
if (rows.length === 0) {
  console.error("⚠️ 未从 src/exit-codes.ts 解析到任何退出码行，检查 EXIT_CODE_TABLE 结构")
  process.exit(1)
}
const block = renderBlock(rows)
const current = readFileSync(docFile, "utf8")
const next = applyBlock(current, block)
if (next === null) {
  console.error(`⚠️ ${docFile} 缺少标记 ${START} / ${END}，无法写入生成块`)
  process.exit(1)
}

if (process.argv.includes("--check")) {
  if (next !== current) {
    console.error("⚠️ 退出码文档与 src/exit-codes.ts 不一致：请运行 node scripts/generate-exit-codes.mjs 重新生成")
    process.exit(1)
  }
  console.log("退出码文档与单一真源一致")
  process.exit(0)
}

writeFileSync(docFile, next, "utf8")
console.log(`已生成退出码表：${rows.length} 行 → ${docFile}`)
