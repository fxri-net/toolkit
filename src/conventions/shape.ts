// 载体表形态偏离检测：T1 索引表列集合、T2 演进记录 / 退休台账表头、T3 载体文件内表头与分隔行列数
// 供 conventions status 与 tasks check 共用，两处只做各自的路径与级别渲染，判据不各写一份
// 只报不改：命中的偏离一律交人工确认后按 conventions-spec 归一
import { existsSync } from "node:fs"
import { basename } from "node:path"
import { readTextFile } from "../read-text"
import { outsideFenceMask } from "./compact"
import {
  HISTORY_ANCHOR_HEADER,
  HISTORY_COLUMNS,
  HISTORY_FILE,
  INDEX_COLUMNS,
  INDEX_FILE,
  RETIRED_ANCHOR_HEADER,
  RETIRED_COLUMNS,
  RETIRED_FILE,
  carrierFiles,
  findColumnCountMismatches,
  findTable,
  type CarrierState,
} from "./format"

// 单条形态偏离：file 为绝对路径（各调用方按自身现场渲染），line 为 1 基行号（列集合类偏离无单一行号）
export interface ShapeDefect {
  file: string
  line?: number
  message: string
}

// 表格列集合是否与期望逐格一致（先比列数再比文本）
function sameCells(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && expected.every((cell, i) => actual[i] === cell)
}

// 列名集合渲染为「a」「b」形式，供告警内联应然 / 实然列名
function cellsText(cells: string[]): string {
  return cells.map((cell) => `「${cell}」`).join("")
}

// T1：v3 索引表列集合须恰为 INDEX_COLUMNS（列集合与次序），漂移即报
function indexColumnDefects(state: CarrierState): ShapeDefect[] {
  if (sameCells(state.header, INDEX_COLUMNS)) return []
  return [
    {
      file: state.indexFile,
      message: `${INDEX_FILE} 索引表列集合偏离 v3 规范：应恰为 ${cellsText(INDEX_COLUMNS)}，实为 ${cellsText(state.header)}；请人工确认后按 conventions-spec 归一`,
    },
  ]
}

// T2：v3 下演进记录 / 退休台账表头整行须与单源列集合逐格一致（仅在表被定位时比对）
function ledgerDefects(state: CarrierState): ShapeDefect[] {
  const defects: ShapeDefect[] = []
  const ledgers: [string, string, string[], string][] = [
    [HISTORY_FILE, state.historyFile, HISTORY_COLUMNS, HISTORY_ANCHOR_HEADER],
    [RETIRED_FILE, state.retiredFile, RETIRED_COLUMNS, RETIRED_ANCHOR_HEADER],
  ]
  for (const [label, file, columns, anchor] of ledgers) {
    if (!existsSync(file)) continue
    const table = findTable(readTextFile(file).split(/\r?\n/), anchor)
    if (!table || sameCells(table.header, columns)) continue
    defects.push({
      file,
      line: table.headerLine + 1,
      message: `${label} 表头偏离 v3 规范：应恰为 ${cellsText(columns)}，实为 ${cellsText(table.header)}；请人工确认后按 conventions-spec 归一`,
    })
  }
  return defects
}

// T3：载体文件内表头行与紧随分隔行列数须相等（表被 fenced code block 包裹时按示例处理，不参与检测）
function columnCountDefects(state: CarrierState): ShapeDefect[] {
  const defects: ShapeDefect[] = []
  const files = [...carrierFiles(state), state.historyFile, state.retiredFile]
  for (const file of files) {
    if (!existsSync(file)) continue
    const lines = readTextFile(file).split(/\r?\n/)
    const mask = outsideFenceMask(lines)
    // 围栏内行替换为空行占位：既跳过检测又保留行号，与 filledTableLines 口径一致
    const scrubbed = lines.map((line, i) => (mask[i] ? line : ""))
    const mismatches = findColumnCountMismatches(scrubbed)
    const first = mismatches[0]
    if (first === undefined) continue
    const extra = mismatches.length > 1 ? `（另有 ${mismatches.length - 1} 处）` : ""
    defects.push({
      file,
      line: first.line,
      message: `${basename(file)} 第 ${first.line} 行表头与分隔行列数不一致（表头 ${first.headerCols} 列 / 分隔行 ${first.sepCols} 列）${extra}：请按 conventions-spec 归一`,
    })
  }
  return defects
}

// 载体表形态检测入口：无 index.md 一律无偏离；列集合类只在 v3 校验，列数脱节对任何形态都校验
export function detectShapeDefects(state: CarrierState): ShapeDefect[] {
  if (!state.hasIndex) return []
  const defects: ShapeDefect[] = []
  if (state.form === "v3") defects.push(...indexColumnDefects(state), ...ledgerDefects(state))
  defects.push(...columnCountDefects(state))
  return defects
}
