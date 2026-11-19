// 载体表形态偏离检测：S1 索引表列集合、S2 演进记录 / 退休台账表头、S3 载体文件内表头与分隔行列数、S4 分册残留「确立来源」子项、S5 演进记录「修订内容」列禁用语料、S6–S8 / S10 索引表单元格形态
// 供 conventions status 与 tasks check 共用，两处只做各自的路径与级别渲染，判据不各写一份
// 只报不改：命中的偏离一律交人工确认后按 conventions-spec 归一
import { existsSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { readTextFile } from "../read-text"
import { findBareFileNames, findCodeFileTargets, hasWrappedOwner, lacksRoutingColon, linkedTargets, readIndexRows } from "./cells"
import {
  HISTORY_ANCHOR_HEADER,
  HISTORY_COLUMNS,
  HISTORY_FILE,
  INDEX_ANCHOR_HEADER,
  INDEX_COLUMNS,
  INDEX_FILE,
  OWNER_HEADER,
  REVISION_HEADER,
  RETIRED_ANCHOR_HEADER,
  RETIRED_COLUMNS,
  RETIRED_FILE,
  SOURCE_HEADER,
  carrierFiles,
  columnIndex,
  findColumnCountMismatches,
  findTable,
  outsideFenceMask,
  type CarrierState,
} from "./format"

// 分册残留「确立来源」子项：行首列表项，子项名可有可无加粗包裹
const STRAY_SOURCE_PATTERN = /^[-*]\s+(?:\*\*)?确立来源/

// history.md「修订内容」列禁用语料：自指套话与重复索引列的条文去向
const HISTORY_FILLER_PATTERN = /本次起入表|新立条目：|条文全文落/

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

// S1：v3 索引表列集合须恰为 INDEX_COLUMNS（列集合与次序），漂移即报
function indexColumnDefects(state: CarrierState): ShapeDefect[] {
  if (sameCells(state.header, INDEX_COLUMNS)) return []
  return [
    {
      file: state.indexFile,
      message: `${INDEX_FILE} 索引表列集合偏离 v3 规范：应恰为 ${cellsText(INDEX_COLUMNS)}，实为 ${cellsText(state.header)}；请人工确认后按 conventions-spec 归一`,
    },
  ]
}

// S2：v3 下演进记录 / 退休台账表头整行须与单源列集合逐格一致（仅在表被定位时比对）
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

// S3：载体文件内表头行与紧随分隔行列数须相等（表被 fenced code block 包裹时按示例处理，不参与检测）
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

// S4：分册内不得残留「确立来源」子项（来源由索引行与 history / retired 承载），逐文件报首个命中行
function straySourceDefects(state: CarrierState): ShapeDefect[] {
  const defects: ShapeDefect[] = []
  const files = carrierFiles(state).filter((file) => file !== state.indexFile)
  for (const file of files) {
    if (!existsSync(file)) continue
    const lines = readTextFile(file).split(/\r?\n/)
    const mask = outsideFenceMask(lines)
    // 围栏内行按示例处理：跳过后行号仍与文件实际行号对齐
    const hits: number[] = []
    lines.forEach((line, i) => {
      if (mask[i] && STRAY_SOURCE_PATTERN.test(line)) hits.push(i + 1)
    })
    const first = hits[0]
    if (first === undefined) continue
    const extra = hits.length > 1 ? `（另有 ${hits.length - 1} 处）` : ""
    defects.push({
      file,
      line: first,
      message: `${basename(file)} 第 ${first} 行残留「确立来源」子项${extra}：来源由索引行与 history.md / retired.md 承载，分册内不重复；请人工确认后按 conventions-spec 归一`,
    })
  }
  return defects
}

// S5：v3 下 history.md「修订内容」列不得含禁用语料（自指套话 / 重复索引列的条文去向），报首个命中行
function historyWordingDefects(state: CarrierState): ShapeDefect[] {
  if (!existsSync(state.historyFile)) return []
  const table = findTable(readTextFile(state.historyFile).split(/\r?\n/), HISTORY_ANCHOR_HEADER)
  if (!table) return []
  const column = columnIndex(table.header, REVISION_HEADER)
  if (column < 0) return []
  const hits: number[] = []
  table.rows.forEach((cells, i) => {
    const line = table.rowLines[i]
    if (line !== undefined && HISTORY_FILLER_PATTERN.test(cells[column] ?? "")) hits.push(line + 1)
  })
  const first = hits[0]
  if (first === undefined) return []
  const extra = hits.length > 1 ? `（另有 ${hits.length - 1} 处）` : ""
  return [
    {
      file: state.historyFile,
      line: first,
      message: `${HISTORY_FILE} 第 ${first} 行「修订内容」列含禁用语料${extra}：不得写自指套话（如「（本次起入表）」「新立条目：」）或重复索引列的条文去向；请人工确认后按 conventions-spec §3.2 归一`,
    },
  ]
}

// S6–S8 / S10：索引表单元格形态（单一事实源须可解析即相对链接、归属须裸值且与源列指向一致、当前语义须含全角冒号）
// 逐类聚合成一条（首个命中行 + 「另有 N 处」），避免每条索引行各报一次把体检刷满
function indexCellDefects(state: CarrierState): ShapeDefect[] {
  const rows = readIndexRows(readTextFile(state.indexFile))
  const defects: ShapeDefect[] = []
  const report = (hits: number[], message: string): void => {
    const first = hits[0]
    if (first === undefined) return
    const extra = hits.length > 1 ? `（另有 ${hits.length - 1} 处）` : ""
    defects.push({ file: state.indexFile, line: first, message: `${message}${extra}` })
  }
  // 仓库根：任务目录的上一级；索引里的载体外路径（AGENTS.md、docs/…）按它解析
  const repoRoot = dirname(dirname(resolve(state.dir)))

  // 单一事实源：裸路径与「行内代码包裹但可解析」的路径都属偏离，应一律写成相对链接
  const sourceRows = rows.filter(
    (row) => findBareFileNames(row.source).length > 0 || findCodeFileTargets(row.source, state.dir, repoRoot).length > 0,
  )
  const sourceSample = sourceRows
    .map((row) => findBareFileNames(row.source)[0] ?? findCodeFileTargets(row.source, state.dir, repoRoot)[0] ?? "")
    .find((name) => name !== "")
  if (sourceSample) {
    report(
      sourceRows.map((row) => row.line),
      `${INDEX_FILE}「${SOURCE_HEADER}」列写成了裸路径或行内代码（如 ${sourceSample}）：能落到具体文件的写相对链接，通配与不存在项才写行内代码；执行 toolkit conventions format 可机械归一`,
    )
  }

  const ownerRows = rows.filter((row) => hasWrappedOwner(row.owner))
  if (ownerRows.length > 0) {
    report(ownerRows.map((row) => row.line), `${INDEX_FILE}「${OWNER_HEADER}」列含反引号或链接（如 ${ownerRows[0]!.owner}）：该列只填裸值；执行 toolkit conventions format 可机械归一`)
  }

  const semanticRows = rows.filter((row) => lacksRoutingColon(row.semantic))
  if (semanticRows.length > 0) {
    report(
      semanticRows.map((row) => row.line),
      `${INDEX_FILE} 条目 ${semanticRows[0]!.id} 等的「${INDEX_ANCHOR_HEADER}」缺全角冒号：应写作「何时适用：一句话要求」，语义重写须人工确认`,
    )
  }

  // S10：归属为单个主题分册时，源列须链接到该分册；指向别的分册即路由错位
  // common / index 为保留归属（跨面原则），其源列可指向载体外文件，不参与此项
  const volumes = new Set(carrierFiles(state).filter((file) => file !== state.indexFile).map((file) => basename(file, ".md")))
  const mismatched = rows.filter((row) => {
    const owner = row.owner.trim()
    if (owner === "common" || owner === "index" || !volumes.has(owner) || /[、,，]/.test(owner)) return false
    const expected = resolve(state.dir, `${owner}.md`)
    return !linkedTargets(row.source, state.dir).some((target) => resolve(target) === expected)
  })
  if (mismatched.length > 0) {
    const first = mismatched[0]!
    report(
      mismatched.map((row) => row.line),
      `${INDEX_FILE} 条目 ${first.id} 的「${OWNER_HEADER}」与「${SOURCE_HEADER}」指向不同分册（归属 ${first.owner.trim()}，源列未链接到同名分册）：请按条文实际所在分册修正`,
    )
  }
  return defects
}

// 载体表形态检测入口：无 index.md 一律无偏离；文风与列集合类只在 v3 校验，列数脱节对任何形态都校验
export function detectShapeDefects(state: CarrierState): ShapeDefect[] {
  if (!state.hasIndex) return []
  const defects: ShapeDefect[] = []
  if (state.form === "v3")
    defects.push(
      ...indexColumnDefects(state),
      ...ledgerDefects(state),
      ...straySourceDefects(state),
      ...historyWordingDefects(state),
      ...indexCellDefects(state),
    )
  defects.push(...columnCountDefects(state))
  return defects
}
