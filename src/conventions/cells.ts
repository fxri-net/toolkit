// 索引表单元格形态：单一事实源按「载体内分册 → 相对链接 / 载体外文件 → 行内代码」二分，归属只填裸值，规则不加引号
// 归一只做可确定项：语义列（何时适用 + 一句话要求）无法机械化，缺全角冒号时只报告不改写
// 判定函数与 conventions status / tasks check 的软告警共用，避免两处各写一份口径
import { existsSync } from "node:fs"
import { join } from "node:path"
import { columnIndex, findTable, INDEX_ANCHOR_HEADER, NAME_HEADER, OWNER_HEADER, outsideFenceMask, SOURCE_HEADER } from "./format"

// 行内代码与链接整体占位：裸文件名的判定须跳过它们内部，否则会误命中的链接目标
const CODE_OR_LINK_RE = /(`[^`\n]*`|\[[^\]\n]*\]\([^)\n]*\))/g
// 单元格里的文件名形态：允许路径前缀，用于识别裸写与反引号包裹
const FILE_NAME_RE = /[A-Za-z0-9_.~/-]+\.md/g

// 载体内分册名形态：不含路径分隔符、无空白的裸文件名
function isVolumeName(text: string): boolean {
  return /^[^/\s]+\.md$/.test(text)
}

// 把行内代码与链接替换为空白占位，返回可安全匹配裸文本的字符串（长度不参与判定，故直接等量替换为空格）
function maskCodeAndLinks(cell: string): string {
  return cell.replace(CODE_OR_LINK_RE, (matched) => " ".repeat(matched.length))
}

// 裸文件名：不在行内代码、也不在链接目标内的 .md 文件名
export function findBareFileNames(cell: string): string[] {
  return [...maskCodeAndLinks(cell).matchAll(FILE_NAME_RE)].map((m) => m[0])
}

// 反引号包裹的载体内分册名：应写作相对链接
export function findCodeVolumeNames(cell: string, dir: string): string[] {
  const hits: string[] = []
  for (const matched of cell.matchAll(/`([^`\n]+)`/g)) {
    const name = matched[1] ?? ""
    if (isVolumeName(name) && existsSync(join(dir, name))) hits.push(name)
  }
  return hits
}

// 归属列被反引号或链接包裹（规范要求裸值）
export function hasWrappedOwner(cell: string): boolean {
  return /`|\[[^\]]*\]\([^)]*\)/.test(cell)
}

// 当前语义缺全角冒号（规范形态「何时适用：一句话要求」）
export function lacksRoutingColon(cell: string): boolean {
  return cell.trim() !== "" && !cell.includes("：")
}

// 单一事实源单元格归一：反引号分册名与裸文件名转相对链接；目标不在载体内时原样保留并记告警
function normalizeSourceCell(cell: string, dir: string, label: string, warnings: string[]): string {
  const linked = cell.replace(/`([^`\n]+)`/g, (matched, name: string) => {
    if (!isVolumeName(name) || !existsSync(join(dir, name))) return matched
    return `[${name}](./${name})`
  })
  // 再对裸文件名做链接化：先把已存在的链接与代码段占位，避免二次命中
  const spans: string[] = []
  const masked = linked.replace(CODE_OR_LINK_RE, (matched) => `${spans.push(matched) - 1}@@SPAN@@`)
  const rewritten = masked.replace(FILE_NAME_RE, (token) => {
    if (!isVolumeName(token)) {
      warnings.push(`${label}：单一事实源「${token}」是裸路径，应写作行内代码（载体外文件）`)
      return token
    }
    if (!existsSync(join(dir, token))) {
      warnings.push(`${label}：单一事实源「${token}」目标不在载体内，未改为链接；请确认该分册是否存在或改写为行内代码`)
      return token
    }
    return `[${token}](./${token})`
  })
  return rewritten.replace(/\d+@@SPAN@@/g, (placeholder) => spans[Number(placeholder.replace("@@SPAN@@", ""))] ?? placeholder)
}

// 归属单元格归一：去反引号、链接取文案，其余保持不变
function normalizeOwnerCell(cell: string): string {
  return cell
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/`/g, "")
    .trim()
}

// 规则单元格归一：去首尾引号（全角 / 半角、单双）
function normalizeNameCell(cell: string): string {
  return cell.replace(/^[「『“"']+/, "").replace(/[」』”"']+$/, "").trim()
}

export interface CellNormalizeResult {
  content: string
  changedLines: number[]
  warnings: string[]
}

// 索引表单元格归一入口：只处理载体内 index.md 的索引表，跳过 fenced code block 内的示例表
export function normalizeIndexCells(content: string, dir: string, label: string): CellNormalizeResult {
  const eol = content.includes("\r\n") ? "\r\n" : "\n"
  const lines = content.split(/\r?\n/)
  const mask = outsideFenceMask(lines)
  const table = findTable(lines, INDEX_ANCHOR_HEADER)
  // 表未定位、或定位到的表在代码块内（示例）时不动
  if (!table || !mask[table.headerLine]) return { content, changedLines: [], warnings: [] }

  const nameIdx = columnIndex(table.header, NAME_HEADER)
  const ownerIdx = columnIndex(table.header, OWNER_HEADER)
  const sourceIdx = columnIndex(table.header, SOURCE_HEADER)
  const semanticIdx = columnIndex(table.header, INDEX_ANCHOR_HEADER)
  const changedLines: number[] = []
  const warnings: string[] = []

  table.rows.forEach((cells, i) => {
    const lineIndex = table.rowLines[i]
    if (lineIndex === undefined) return
    const id = cells[0] ?? ""
    const next = [...cells]
    if (nameIdx !== -1) next[nameIdx] = normalizeNameCell(next[nameIdx] ?? "")
    if (ownerIdx !== -1) next[ownerIdx] = normalizeOwnerCell(next[ownerIdx] ?? "")
    if (sourceIdx !== -1) next[sourceIdx] = normalizeSourceCell(next[sourceIdx] ?? "", dir, `${label} 行 ${lineIndex + 1}`, warnings)
    if (semanticIdx !== -1 && lacksRoutingColon(next[semanticIdx] ?? "")) {
      warnings.push(`${label} 行 ${lineIndex + 1}：条目 ${id} 的「当前语义」缺全角冒号，应写作「何时适用：一句话要求」（语义重写须人工确认，未自动改写）`)
    }
    if (next.some((cell, index) => cell !== cells[index])) {
      lines[lineIndex] = `| ${next.join(" | ")} |`
      changedLines.push(lineIndex + 1)
    }
  })

  return { content: lines.join(eol), changedLines, warnings }
}

// 索引表数据行的定位与列下标（供软告警侧按行核对单元格形态）
export interface IndexCellRow {
  line: number
  id: string
  name: string
  owner: string
  source: string
  semantic: string
}

// 读出索引表的逐行单元格；表未定位或落在代码块内时返回空集
export function readIndexRows(content: string): IndexCellRow[] {
  const lines = content.split(/\r?\n/)
  const mask = outsideFenceMask(lines)
  const table = findTable(lines, INDEX_ANCHOR_HEADER)
  if (!table || !mask[table.headerLine]) return []
  const pick = (cells: string[], header: string): string => {
    const index = columnIndex(table.header, header)
    return index === -1 ? "" : (cells[index] ?? "")
  }
  return table.rows.map((cells, i) => ({
    line: (table.rowLines[i] ?? 0) + 1,
    id: cells[0] ?? "",
    name: pick(cells, NAME_HEADER),
    owner: pick(cells, OWNER_HEADER),
    source: pick(cells, SOURCE_HEADER),
    semantic: pick(cells, INDEX_ANCHOR_HEADER),
  }))
}
