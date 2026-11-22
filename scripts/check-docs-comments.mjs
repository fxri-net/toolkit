// 文档代码块内联注释对齐检查：分组 / 相对最长基准 / 目标列，只报不改（规范 C-40 配套）
// 只服务本仓库：用 node 直跑，由 scripts/verify.mjs 统一挂载；列号按 1 基、按显示宽度计
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// 基准与间距口径：与 skills/fxri-writing-docs 的「代码块内联注释」逐字对应，改口径只改这里
export const BASE_GAP = 2
export const BASELINE_TOLERANCE = 10
// 检查面：根 README 与文档站全页、技能包索引页；生成物豁免
export const TARGET_FILES = ["README.md", "skills/README.md"]
export const TARGET_DIRS = ["docs"]
const EXCLUDED = new Set(["docs/changelog.md"])
const EXCLUDED_PREFIXES = ["docs/rules/"]
// 与对齐归一同一份语言白名单：json / markdown 等块不参与（注释语义不同）
const ALLOWED_LANGS = new Set(["", "sh", "bash", "shell", "console", "text", "yaml", "yml", "toml", "ts", "js", "jsonc"])

/** 显示宽度：CJK / 全角 2 列，组合符 0 列，其余 1 列 */
export function charWidth(code) {
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0
  if (code >= 0x0300 && code <= 0x036f) return 0
  const wide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  return wide ? 2 : 1
}

/** 文本显示宽度 */
export function widthOf(text) {
  return [...text].reduce((sum, ch) => sum + charWidth(ch.codePointAt(0)), 0)
}

// 行内注释标记：整行注释、URL 里的标记不算；返回标记下标与标记本身
function commentAt(line) {
  if (line.includes("\t")) return null
  if (line.trimStart().startsWith("#") || line.trimStart().startsWith("//")) return null
  const hash = line.indexOf("#")
  if (hash > 0 && /\s/.test(line[hash - 1]) && line.slice(0, hash).trim() !== "") return { marker: "#", column: hash }
  const slash = line.indexOf("//")
  if (slash > 0 && /\s/.test(line[slash - 1]) && !line.slice(0, slash).includes("://") && line.slice(0, slash).trim() !== "") {
    return { marker: "//", column: slash }
  }
  return null
}

// 基准：树块取整块最长；命令块 ≤5 行取最长、≥6 行取「不超过中位数 + 10」的最长（均按显示宽度）
export function baselineOf(widths, tree) {
  const sorted = [...widths].sort((a, b) => a - b)
  if (tree || sorted.length <= 5) return sorted[sorted.length - 1]
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 1 ? sorted[mid] : Math.floor((sorted[mid - 1] + sorted[mid]) / 2)
  return sorted.filter((value) => value <= median + BASELINE_TOLERANCE).pop()
}

// 目录树行：注释前缀以树形符号开头，整块忽略缩进成一组
const isTreeLine = (line) => /^\s*(├|└|│)/.test(line)

/** 扫描单页文本，返回违规列表（行号 1 基、列号 1 基） */
export function scanText(text) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n")
  const violations = []
  let inFence = false
  let lang = ""
  let group = []

  const flush = () => {
    if (group.length >= 2) {
      const baseline = baselineOf(group.map((item) => item.width), group[0].tree)
      const target = baseline + BASE_GAP
      for (const item of group) {
        const expectedGap = item.width <= baseline ? target - item.width : 1
        if (item.gap !== expectedGap) {
          violations.push({ line: item.line, expected: item.width + expectedGap + 1, actual: item.width + item.gap + 1 })
        }
      }
    }
    group = []
  }

  lines.forEach((line, index) => {
    const fence = /^\s*(```|~~~)([^\s]*)/.exec(line)
    if (fence) {
      flush()
      inFence = !inFence
      lang = inFence ? fence[2].replace(/^\[|\]$/g, "").split(/\s+/)[0] : ""
      return
    }
    if (!inFence || !ALLOWED_LANGS.has(lang)) {
      flush()
      return
    }
    const found = commentAt(line)
    if (!found) {
      flush()
      return
    }
    const trimmed = line.slice(0, found.column).trimEnd()
    const item = { line: index + 1, indent: line.match(/^\s*/)[0].length, tree: isTreeLine(line), marker: found.marker, width: widthOf(trimmed), gap: found.column - [...trimmed].length }
    if (group.length > 0) {
      const prev = group[group.length - 1]
      if (prev.tree !== item.tree || (!item.tree && (prev.indent !== item.indent || prev.marker !== item.marker))) flush()
    }
    group.push(item)
  })
  flush()
  return violations
}

/** 检查面内的页面（仓库根相对路径，正斜杠） */
export function targetPages(root) {
  const files = [...TARGET_FILES]
  const walk = (dir) => {
    if (!existsSync(join(root, dir))) return
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else if (entry.name.endsWith(".md") && !EXCLUDED.has(rel) && !EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix))) files.push(rel)
    }
  }
  for (const dir of TARGET_DIRS) walk(dir)
  return files.filter((file) => existsSync(join(root, file)))
}

/** 按检查面收集违规 */
export function collect(root) {
  const result = new Map()
  for (const file of targetPages(root)) {
    const violations = scanText(readFileSync(join(root, file), "utf8"))
    if (violations.length > 0) result.set(file, violations)
  }
  return result
}

/** 执行检查：有违规输出清单并返回 1 */
export function run({ root = process.cwd() } = {}) {
  const result = collect(root)
  if (result.size === 0) {
    console.log("文档注释对齐检查：代码块内联注释均按分组基准对齐")
    return 0
  }
  console.error("文档注释对齐检查：")
  let total = 0
  for (const [file, violations] of result) {
    for (const item of violations) {
      total += 1
      console.error(`【error】${file}:${item.line}: 期望列 ${item.expected} 实际 ${item.actual}（列号按显示宽度、1 基）`)
    }
  }
  console.error(`共 ${total} 处未对齐（基准：分组相对最长，目标列 = 基准 + ${BASE_GAP}）`)
  return 1
}

// 直接执行时才产生副作用；被测试导入时只暴露纯函数
const isDirectRun = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isDirectRun) process.exitCode = run()
