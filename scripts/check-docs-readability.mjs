// 文档可读性检查：正文段落单行 ≤120 字符、单句全角分号 ≤2 个（规范 C-43）
// 只服务本仓库（不属产品能力）：用 node 直跑，由 scripts/verify.mjs 统一挂载
// 默认全量阻断；可选基线文件按文件记「允许行数」用于渐进收敛，--write-baseline 按当前实测重写
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const MAX_CHARS = 120
export const MAX_SEMICOLONS = 2
export const BASELINE_PATH = ["scripts", "docs-readability-baseline.json"]

// 检查面：门面与根规则 + 文档站页面 + 技能正文
const TARGET_FILES = ["README.md", "AGENTS.md", "SPEC.md"]
const TARGET_DIRS = ["docs", "skills"]
// 自动生成页豁免（C-40）：toolkit changelog doc 产出，内容不由人书写
const EXCLUDED = new Set(["docs/changelog.md"])

/** 递归收集 Markdown 页面，返回仓库根相对路径（正斜杠） */
export function collectMarkdown(root, dir) {
  const files = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) files.push(...collectMarkdown(root, rel))
    else if (entry.name.endsWith(".md") && !EXCLUDED.has(rel)) files.push(rel)
  }
  return files
}

// 逐行剥离列表标记、引用标记与警示符号后再计长，避免标记本身把正文挤过阈值
export function normalize(line) {
  return line
    .replace(/^\s*(?:>\s*)+/, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/^⚠️\s*/, "")
    .trim()
}

/** 扫描单页正文，返回违规行（行号 + 实际长度 + 分号数） */
export function scanContent(text) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n")
  const violations = []
  let inFence = false
  let inFrontmatter = lines[0]?.trim() === "---"
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    // frontmatter 只出现在首部，遇到收尾分隔行即退出
    if (inFrontmatter) {
      if (index > 0 && trimmed === "---") inFrontmatter = false
      return
    }
    if (trimmed.startsWith("```")) {
      inFence = !inFence
      return
    }
    // 代码块、标题、表格行、HTML 注释不属正文段落；徽章 / 图片行是机器生成的标记，不按散文计长
    if (inFence || !trimmed || trimmed.startsWith("#") || trimmed.startsWith("|") || trimmed.startsWith("<!--")) return
    if (trimmed.startsWith("[![") || trimmed.startsWith("![")) return
    const content = normalize(trimmed)
    if (!content) return
    const length = [...content].length
    const semicolons = content.split("；").length - 1
    if (length > MAX_CHARS || semicolons > MAX_SEMICOLONS) {
      violations.push({ line: index + 1, length, semicolons })
    }
  })
  return violations
}

/** 扫描整个任务区，返回「文件 → 违规列表」映射 */
export function collectViolations(root) {
  const counted = new Map()
  const files = [...TARGET_FILES, ...TARGET_DIRS.flatMap((dir) => (existsSync(join(root, dir)) ? collectMarkdown(root, dir) : []))]
  for (const file of files.filter((item) => existsSync(join(root, item)))) {
    const violations = scanContent(readFileSync(join(root, file), "utf8"))
    if (violations.length > 0) counted.set(file, violations)
  }
  return counted
}

/** 按基线汇总判定：返回失败明细与可清理的基线键 */
export function evaluate(counted, baseline) {
  const failures = []
  for (const [file, violations] of counted) {
    const allowed = baseline[file] ?? 0
    if (violations.length <= allowed) continue
    for (const item of violations) {
      failures.push(`${file}:${item.line} 长度 ${item.length} / 分号 ${item.semicolons}（允许行数 ${allowed}，实测 ${violations.length}）`)
    }
  }
  const stale = Object.keys(baseline).filter((file) => !counted.has(file))
  return { failures, stale }
}

/** 执行检查：返回退出码，所有输出与写盘副作用集中在此 */
export function run({ root = process.cwd(), argv = process.argv } = {}) {
  const baselineFile = join(root, ...BASELINE_PATH)
  const counted = collectViolations(root)

  if (argv.includes("--write-baseline")) {
    const baseline = Object.fromEntries([...counted.entries()].map(([file, violations]) => [file, violations.length]))
    writeFileSync(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`, "utf8")
    const total = [...counted.values()].reduce((sum, list) => sum + list.length, 0)
    console.log(`文档可读性基线已重写：${counted.size} 个文件共 ${total} 处超标`)
    return 0
  }

  // 基线缺省为全量阻断；已不存在的文件或未再超标的文件提示清理，避免基线长期虚高
  const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")) : {}
  const { failures, stale } = evaluate(counted, baseline)
  if (failures.length > 0) {
    console.error("文档可读性检查：")
    for (const failure of failures) console.error(`【error】${failure}`)
    return 1
  }
  if (stale.length > 0) console.log(`文档可读性基线可清理：${stale.join("、")}`)
  const total = [...counted.values()].reduce((sum, list) => sum + list.length, 0)
  console.log(
    existsSync(baselineFile)
      ? `文档可读性检查：正文单行 ≤${MAX_CHARS} 字符、分号 ≤${MAX_SEMICOLONS} 个；存量 ${total} 处均在基线内（${relative(root, baselineFile)}）`
      : `文档可读性检查：正文单行 ≤${MAX_CHARS} 字符、分号 ≤${MAX_SEMICOLONS} 个；全仓 ${total} 处超标`,
  )
  return 0
}

// 直接执行时才产生副作用；被测试导入时只暴露纯函数
const isDirectRun = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isDirectRun) process.exitCode = run()
