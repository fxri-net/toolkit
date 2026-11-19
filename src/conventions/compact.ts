// 表格与单元格形态归一：紧凑形态（单元格间单空格）即规范形态，格式化器填充出的列对齐与补长横线为偏离
// 另把 conventions/index.md 的索引表单元格归一到规范形态：单一事实源按载体内外二分、归属去包裹、规则去引号；语义列只报不改
// 归一范围＝任务区全部 .md（载体三件 + active + archive）；fenced code block 内的表格样例不动（示例须按原样保留）
// 归一不触语义：间距与分隔行只动空白与横线，单元格只改写「写在代码里还是链接里」，条文文字与行尾符一律保留
import { existsSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { normalizeIndexCells } from "./cells"
import { CONVENTIONS_DIR, INDEX_FILE, isSeparatorRow, isTableRow, outsideFenceMask, splitRow } from "./format"

// 单文件归一结果：changedLines 为发生改动的 1 基行号
export interface CompactResult {
  content: string
  changedLines: number[]
}

// 单文件归一命中的文件与行号（file 为相对任务区的 posix 路径）
export interface FormatChange {
  file: string
  lines: number[]
}

export interface FormatReport {
  status: "compacted" | "already-compact"
  tasksDir: string
  files: number
  changedFiles: number
  changedLines: number
  changes: FormatChange[]
  // 无法机械归一、须人工确认的项（如语义列缺全角冒号、裸文件名目标不在载体内）
  warnings: string[]
  dryRun: boolean
}

export interface FormatOptions {
  dryRun?: boolean
}

// 取行首缩进前缀（表格行可能带缩进，归一须保留）
function indentOf(line: string): string {
  return /^\s*/.exec(line)?.[0] ?? ""
}

// 分隔行单元格归一：横线按列宽填充属列对齐产物，压为 `---` 并保留对齐标记（:--- / ---: / :---:）
function compactSeparatorCell(cell: string): string {
  return cell.replace(/^(:?)-+(:?)$/, "$1---$2")
}

// 单行归一到紧凑形态：非表格行原样返回；表格行保留缩进前缀输出 `| a | b |`，分隔行另把横线压为 `---`、保留对齐标记
// 该形态即写入侧的稳定不动点：对已紧凑行再跑一次结果不变，故既可作归一目标也可作偏离判据
export function compactTableLine(line: string): string {
  if (!isTableRow(line)) return line
  const cells = splitRow(line)
  const body = isSeparatorRow(line) ? cells.map(compactSeparatorCell) : cells
  return `${indentOf(line)}| ${body.join(" | ")} |`
}

// 单文件归一：逐行扫表格行改写为紧凑形态，保留原行尾符（CRLF / LF）
export function compactMarkdown(content: string): CompactResult {
  const eol = content.includes("\r\n") ? "\r\n" : "\n"
  const lines = content.split(/\r?\n/)
  const mask = outsideFenceMask(lines)
  const changedLines: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!mask[i]) continue
    const line = lines[i] ?? ""
    const next = compactTableLine(line)
    if (next !== line) {
      lines[i] = next
      changedLines.push(i + 1)
    }
  }
  return { content: lines.join(eol), changedLines }
}

// 检出填充态表格行（1 基行号）：行内容与紧凑形态不等即视为被格式化器填充过
export function filledTableLines(content: string): number[] {
  const lines = content.split(/\r?\n/)
  const mask = outsideFenceMask(lines)
  const hits: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!mask[i]) continue
    const line = lines[i] ?? ""
    if (isTableRow(line) && compactTableLine(line) !== line) hits.push(i + 1)
  }
  return hits
}

// 递归收集任务区下全部 .md（含各层子目录；排序保证报告与测试稳定）
// 目录不存在时返回空集：任务区缺失属常规容错场景（tasks check 默认容忍，--strict 才报错）
export function listMarkdownFiles(root: string): string[] {
  if (!existsSync(root)) return []
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full)
    }
  }
  walk(root)
  return files.sort()
}

// 归一主流程：先全量扫描再统一写盘（dryRun 只报不改）；已是紧凑形态时幂等返回 already-compact
// 索引表另做单元格形态归一（仅 conventions/index.md），无法机械判定的项只进 warnings
export function formatConventions(tasksDir = ".tasks", options: FormatOptions = {}): FormatReport {
  if (!existsSync(tasksDir)) throw new Error(`任务区目录不存在：${tasksDir}（先执行 toolkit init 初始化）`)
  const files = listMarkdownFiles(tasksDir)
  const indexFile = join(tasksDir, CONVENTIONS_DIR, INDEX_FILE)
  const changes: FormatChange[] = []
  const warnings: string[] = []
  for (const file of files) {
    const compacted = compactMarkdown(readTextFile(file))
    let content = compacted.content
    let changedLines = compacted.changedLines
    if (file === indexFile) {
      const cells = normalizeIndexCells(content, join(tasksDir, CONVENTIONS_DIR), `${CONVENTIONS_DIR}/${INDEX_FILE}`)
      content = cells.content
      changedLines = [...new Set([...changedLines, ...cells.changedLines])].sort((a, b) => a - b)
      warnings.push(...cells.warnings)
    }
    if (changedLines.length === 0) continue
    if (!options.dryRun) writeFileAtomic(file, content)
    changes.push({ file: relative(tasksDir, file).replace(/\\/g, "/"), lines: changedLines })
  }
  return {
    status: changes.length > 0 ? "compacted" : "already-compact",
    tasksDir,
    files: files.length,
    changedFiles: changes.length,
    changedLines: changes.reduce((n, c) => n + c.lines.length, 0),
    changes,
    warnings,
    dryRun: Boolean(options.dryRun),
  }
}
