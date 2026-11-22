// 环境变量清单生成器：从 src/env.ts 的导出常量生成 docs/cli.md 的标记块
// 用法：node scripts/generate-env-table.mjs [--check] [--self-test]
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { applyBlock } from "./lib/markers.mjs"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceFile = join(root, "src", "env.ts")
const docFile = join(root, "docs", "cli.md")
const START = "<!-- toolkit:env-vars:start -->"
const END = "<!-- toolkit:env-vars:end -->"
// 内部变量不面向用户：剪贴板临时文件路径只在命令内部传递
const INTERNAL = new Set(["FX_TOOLKIT_CLIP_FILE"])

/**
 * 从源码文本解析公开环境变量名。
 * @param {string} text src/env.ts 内容
 * @return {string[]} 公开变量名（声明顺序）
 */
export function parseEnvNames(text) {
  const found = [...text.matchAll(/^export const ENV_[A-Z_]+ = "([^"]+)"/gm)].map((match) => match[1])
  const declared = [...text.matchAll(/^export const ENV_[A-Z_]+ =/gm)].length
  if (found.length !== declared) {
    throw new Error(`解析到 ${found.length} 个环境变量，但源码出现 ${declared} 行声明，结构可能已变化`)
  }
  const names = found.filter((name) => !INTERNAL.has(name))
  if (names.length === 0) throw new Error("src/env.ts 未解析到任何公开环境变量")
  return names
}

/**
 * 渲染三列变量表正文（不含标记）。
 * @param {string[]} names 变量名
 * @return {string} 表格正文
 */
export function renderTableBody(names) {
  const cells = names.map((name) => `\`${name}\``)
  while (cells.length % 3 !== 0) cells.push("")
  const rows = []
  for (let index = 0; index < cells.length; index += 3) {
    rows.push(`| ${cells.slice(index, index + 3).join(" | ")} |`)
  }
  return [
    "本工具自身的环境变量只认 `FX_TOOLKIT_` 前缀，当前清单：",
    "",
    "| 环境变量 | 环境变量 | 环境变量 |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n")
}

// 假现场：解析、内部变量剔除与三列补齐都在内存中断言，不写盘
function selfTest() {
  const names = parseEnvNames('export const ENV_A = "FX_TOOLKIT_A"\nexport const ENV_CLIP_FILE = "FX_TOOLKIT_CLIP_FILE"\n')
  const body = renderTableBody(names)
  const ok = names.length === 1 && names[0] === "FX_TOOLKIT_A" && body.includes("`FX_TOOLKIT_A`") && !body.includes("CLIP_FILE")
  if (!ok) {
    console.error("⚠️ 环境变量生成器自检失败：解析或内部变量剔除不符合预期")
    process.exit(1)
  }
  console.log("环境变量生成器自检通过：解析、剔除与表格渲染正常")
}

if (process.argv.includes("--self-test")) {
  selfTest()
  process.exit(0)
}

const check = process.argv.includes("--check")
let names
try {
  names = parseEnvNames(readFileSync(sourceFile, "utf8"))
} catch (error) {
  console.error(`⚠️ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
const current = readFileSync(docFile, "utf8")
const next = applyBlock(current, START, END, renderTableBody(names))
if (next === null) {
  console.error(`⚠️ ${docFile} 缺少环境变量生成标记 ${START} / ${END}`)
  process.exit(1)
}
if (check) {
  if (next !== current) {
    console.error(`⚠️ ${docFile} 的环境变量清单与 src/env.ts 不一致：运行 node scripts/generate-env-table.mjs 更新`)
    process.exit(1)
  }
  console.log(`环境变量清单与单一真源一致（${names.length} 个公开变量）`)
} else {
  if (next !== current) writeFileSync(docFile, next, "utf8")
  console.log(`已生成环境变量清单：${names.length} 个公开变量 → ${docFile}`)
}
