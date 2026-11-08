// 文档可读性检查：正文段落单行 ≤120 字符、单句全角分号 ≤2 个（规范 C-43）
// 只服务本仓库（不属产品能力）：用 node 直跑，由 scripts/verify.mjs 统一挂载
// 存量超标按文件记「允许行数」基线（棘轮），只在超出基线时失败；--write-baseline 按当前实测重写基线
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const MAX_CHARS = 120
const MAX_SEMICOLONS = 2
const root = process.cwd()
const baselineFile = join(root, "scripts", "docs-readability-baseline.json")
const writeBaseline = process.argv.includes("--write-baseline")

// 检查面：门面与根规则 + 文档站页面 + 技能正文
const targetFiles = ["README.md", "AGENTS.md", "SPEC.md"]
const targetDirs = ["docs", "skills"]
// 自动生成页豁免（C-40）：toolkit changelog doc 产出，内容不由人书写
const excluded = new Set(["docs/changelog.md"])

/** 递归收集 Markdown 页面，返回仓库根相对路径（正斜杠） */
function collect(dir) {
  const files = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) files.push(...collect(rel))
    else if (entry.name.endsWith(".md") && !excluded.has(rel)) files.push(rel)
  }
  return files
}

// 逐行剥离列表标记、引用标记与警示符号后再计长，避免标记本身把正文挤过阈值
function normalize(line) {
  return line
    .replace(/^\s*(?:>\s*)+/, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/^⚠️\s*/, "")
    .trim()
}

/** 扫描单页，返回违规行（行号 + 实际长度 + 分号数） */
function scan(file) {
  const text = readFileSync(join(root, file), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  const lines = text.split("\n")
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
    // 代码块、标题、表格行、HTML 注释不属正文段落
    if (inFence || !trimmed || trimmed.startsWith("#") || trimmed.startsWith("|") || trimmed.startsWith("<!--")) return
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

const counted = new Map()
for (const file of [...targetFiles, ...targetDirs.flatMap(collect)].filter((file) => existsSync(join(root, file)))) {
  const violations = scan(file)
  if (violations.length > 0) counted.set(file, violations)
}

if (writeBaseline) {
  const baseline = Object.fromEntries([...counted.entries()].map(([file, violations]) => [file, violations.length]))
  writeFileSync(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`, "utf8")
  console.log(`文档可读性基线已重写：${counted.size} 个文件共 ${[...counted.values()].reduce((sum, list) => sum + list.length, 0)} 处超标`)
  process.exit(0)
}

// 基线缺省为全量阻断；已不存在的文件或未再超标的文件提示清理，避免基线长期虚高
const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")) : {}
const failures = []
for (const [file, violations] of counted) {
  const allowed = baseline[file] ?? 0
  if (violations.length <= allowed) continue
  for (const item of violations) {
    failures.push(`${file}:${item.line} 长度 ${item.length} / 分号 ${item.semicolons}（允许行数 ${allowed}，实测 ${violations.length}）`)
  }
}
const stale = Object.keys(baseline).filter((file) => !counted.has(file))

if (failures.length > 0) {
  console.error("文档可读性检查：")
  for (const failure of failures) console.error(`【error】${failure}`)
  process.exit(1)
}
if (stale.length > 0) console.log(`文档可读性基线可清理：${stale.join("、")}`)
const total = [...counted.values()].reduce((sum, list) => sum + list.length, 0)
console.log(`文档可读性检查：正文单行 ≤${MAX_CHARS} 字符、分号 ≤${MAX_SEMICOLONS} 个；存量 ${total} 处均在基线内（${relative(root, baselineFile)}）`)
