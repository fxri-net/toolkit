// 退出码文档生成器：从 src/exit-codes.ts 的 EXIT_CODE_TABLE 生成 docs/cli/exit-codes.md 的表格块
// 用法：node scripts/generate-exit-codes.mjs [--check] [--self-test]
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { applyBlock } from "./lib/markers.mjs"

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
 * 渲染 markdown 表格正文（不含标记）。
 * @param {{code: string, name: string, meaning: string, scene: string}[]} rows 行数据
 * @return {string} 表格正文
 */
export function renderTableBody(rows) {
  const lines = ["| 退出码 | 常量 | 含义 | 场景 |", "| --- | --- | --- | --- |"]
  for (const row of rows) lines.push(`| \`${row.code}\` | ${row.name} | ${row.meaning} | ${row.scene} |`)
  return lines.join("\n")
}

/**
 * 解析并校验不变量：解析出的行数必须等于源码中 `code:` 的出现次数。
 * 正则依赖对象的属性顺序与单行写法；结构变化时解析会静默少行，这里把它变成显式报错。
 * @param {string} text src/exit-codes.ts 内容
 * @return {{code: string, name: string, meaning: string, scene: string}[]} 行数据
 */
export function parseRowsStrict(text) {
  const rows = parseRows(text)
  const declared = [...text.matchAll(/\bcode:\s*\d+/g)].length
  if (rows.length !== declared) {
    throw new Error(`解析到 ${rows.length} 行，但源码出现 ${declared} 处 code:，EXIT_CODE_TABLE 结构可能已变化`)
  }
  return rows
}

// 假现场：表格渲染、替换与漂移判定都在内存中断言，不写盘
function selfTest() {
  const rows = [
    { code: "0", name: "OK", meaning: "成功", scene: "全部" },
    { code: "130", name: "CANCEL", meaning: "取消", scene: "交互" },
  ]
  const body = renderTableBody(rows)
  if (!body.includes("| `130` | CANCEL |")) {
    console.error("⚠️ 退出码生成器自检失败：表格渲染不符合预期")
    process.exit(1)
  }
  const fixture = `intro\n${START}\nold\n${END}\ntail\n`
  const applied = applyBlock(fixture, START, END, body)
  if (applied === null || !applied.startsWith("intro") || !applied.endsWith("tail\n") || applied.includes("old")) {
    console.error("⚠️ 退出码生成器自检失败：标记区间替换不符合预期")
    process.exit(1)
  }
  const drift = applyBlock(applied, START, END, renderTableBody([...rows].reverse())) !== applied
  if (!drift) {
    console.error("⚠️ 退出码生成器自检失败：内容变化未被判定为漂移")
    process.exit(1)
  }
  // 结构漂移：属性顺序变化后正则不再命中，严格解析必须报错而不是少行
  const reordered = 'const table = [\n  { name: "OK", code: 0, meaning: "", scene: "" },\n]'
  let detected = false
  try {
    parseRowsStrict(reordered)
  } catch {
    detected = true
  }
  if (!detected) {
    console.error("⚠️ 退出码生成器自检失败：结构变化未被解析不变量拦截")
    process.exit(1)
  }
  console.log("退出码生成器自检通过：渲染、替换、漂移判定与解析不变量正常")
}

if (process.argv.includes("--self-test")) {
  selfTest()
  process.exit(0)
}

let rows
try {
  rows = parseRowsStrict(readFileSync(sourceFile, "utf8"))
} catch (error) {
  console.error(`⚠️ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
if (rows.length === 0) {
  console.error("⚠️ 未从 src/exit-codes.ts 解析到任何退出码行，检查 EXIT_CODE_TABLE 结构")
  process.exit(1)
}
const current = readFileSync(docFile, "utf8")
const next = applyBlock(current, START, END, renderTableBody(rows))
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
