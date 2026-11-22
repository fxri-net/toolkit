// 项目面技能候选目录表生成器：从 src/conventions/entry.ts 的 PROJECT_SKILL_DIRS 生成标记块
// 用法：node scripts/generate-skill-dirs.mjs [--check] [--self-test]
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { applyBlock } from "./lib/markers.mjs"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceFile = join(root, "src", "conventions", "entry.ts")
const START = "<!-- toolkit:skill-dirs:start -->"
const END = "<!-- toolkit:skill-dirs:end -->"
// 三处展示同一份清单：包内技能说明、文档站配置参考与技能内的离线副本
const TARGET_FILES = ["skills/README.md", "docs/config/skill.md", "skills/fxri-plan-task/references/skill-dirs.generated.md"]
// 首列补注：真源目录与特殊命名目录，其余按目录名直出
const NOTES = new Map([
  [".agents/skills", "（真源）"],
  ["agent/skills", "（Eve）"],
])

/**
 * 从源码文本解析候选目录清单。
 * @param {string} text src/conventions/entry.ts 内容
 * @return {string[]} 候选目录（仓库根相对）
 */
export function parseSkillDirs(text) {
  const block = /export const PROJECT_SKILL_DIRS = \[([\s\S]*?)\n\]/.exec(text)
  if (!block) throw new Error("src/conventions/entry.ts 未找到 PROJECT_SKILL_DIRS")
  const dirs = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
  const declared = [...block[1].matchAll(/^\s*"[^"]+",?\s*$/gm)].length
  if (dirs.length === 0) throw new Error("PROJECT_SKILL_DIRS 为空，候选目录表无从生成")
  if (dirs.length !== declared) {
    throw new Error(`解析到 ${dirs.length} 个候选目录，但源码出现 ${declared} 行目录声明，结构可能已变化`)
  }
  return dirs
}

/**
 * 渲染三列目录表正文（含数量标题，不含标记）。
 * @param {string[]} dirs 候选目录
 * @return {string} 表格正文
 */
export function renderTableBody(dirs) {
  const cells = dirs.map((dir) => `\`${dir}/\`${NOTES.get(dir) ?? ""}`)
  while (cells.length % 3 !== 0) cells.push("")
  const rows = []
  for (let index = 0; index < cells.length; index += 3) {
    rows.push(`| ${cells.slice(index, index + 3).join(" | ")} |`)
  }
  return [
    `**项目面候选目录**（${dirs.length} 个，仅在目录已存在时落壳）：`,
    "",
    "| 候选目录 | 候选目录 | 候选目录 |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n")
}

// 假现场：解析、计数与三列补齐都在内存中断言，不写盘
function selfTest() {
  const sample = parseSkillDirs('export const PROJECT_SKILL_DIRS = [\n  ".agents/skills",\n  ".trae/skills",\n  "agent/skills",\n]')
  const body = renderTableBody(sample)
  const ok =
    body.includes("（3 个，") &&
    body.includes("`.agents/skills/`（真源）") &&
    body.includes("`agent/skills/`（Eve）") &&
    body.split("\n").filter((line) => line.startsWith("| `.agents")).length === 1
  if (!ok) {
    console.error("⚠️ 候选目录生成器自检失败：表格渲染不符合预期")
    process.exit(1)
  }
  console.log("候选目录生成器自检通过：解析、计数与表格渲染正常")
}

if (process.argv.includes("--self-test")) {
  selfTest()
  process.exit(0)
}

const check = process.argv.includes("--check")
let dirs
try {
  dirs = parseSkillDirs(readFileSync(sourceFile, "utf8"))
} catch (error) {
  console.error(`⚠️ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
const body = renderTableBody(dirs)
const drifted = []
for (const rel of TARGET_FILES) {
  const file = join(root, rel)
  const current = readFileSync(file, "utf8")
  const next = applyBlock(current, START, END, body)
  if (next === null) {
    console.error(`⚠️ ${rel} 缺少候选目录生成标记 ${START} / ${END}`)
    process.exit(1)
  }
  if (next === current) continue
  if (check) drifted.push(rel)
  else writeFileSync(file, next, "utf8")
}
if (check) {
  if (drifted.length > 0) {
    console.error(`⚠️ 候选目录表与 PROJECT_SKILL_DIRS 不一致：${drifted.join("、")}；运行 node scripts/generate-skill-dirs.mjs 更新`)
    process.exit(1)
  }
  console.log(`候选目录表与单一真源一致（${dirs.length} 个目录）`)
} else {
  console.log(`已生成候选目录表：${dirs.length} 个目录 → ${TARGET_FILES.join("、")}`)
}
