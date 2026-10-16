// 规范载体（`.tasks/conventions/`）形态识别与结构解析：以结构判据为主、首行标记为辅
// 载体结构规范见 skills/fxri-plan-to-task/references/conventions-spec.md；本模块只做识别与解析，不写盘
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"

// 载体目录名与三个约定文件名；任务目录本身可外置，内部结构不变
export const CONVENTIONS_DIR = "conventions"
export const INDEX_FILE = "index.md"
export const HISTORY_FILE = "history.md"
export const RETIRED_FILE = "retired.md"
export const LEGACY_FILE = "conventions.md"

// 载体结构版本与入口壳结构版本各自独立编号，仅破坏性结构变更时 +1
export const CARRIER_VERSION = 3
export const ENTRY_VERSION = 2

// 形态标记：载体标记置 index.md 首行，入口壳标记随 frontmatter 之后（Agent Skills 标准要求 frontmatter 置顶）
export const CARRIER_MARKER = `<!-- toolkit-conventions: v${CARRIER_VERSION} -->`
export const ENTRY_MARKER = `<!-- toolkit-conventions-entry: v${ENTRY_VERSION} -->`

export const CARRIER_MARKER_RE = /<!--\s*toolkit-conventions:\s*v(\d+)\s*-->/
const ENTRY_MARKER_RE = /<!--\s*toolkit-conventions-entry:\s*v(\d+)\s*-->/

// 索引表列头：`ID` 表 v2/v3 稳定标识，`#` 表 v1 序号；`当前语义` 为表格定位锚（v1/v2/v3 共有）
export const ID_HEADER = "ID"
export const SEQ_HEADER = "#"
export const INDEX_ANCHOR_HEADER = "当前语义"
// v2 独有、v3 升级时删除的两列
export const STATUS_HEADER = "状态"
export const SOURCE_TASK_HEADER = "确立来源任务"
// 索引表其余列名：规则名、归属与条文单一事实源位置
export const NAME_HEADER = "规则"
export const OWNER_HEADER = "归属"
export const SOURCE_HEADER = "单一事实源"
// 演进记录与退休台账所用列名（表头行统一由列名常量派生）
export const REVISION_HEADER = "修订内容"
export const SUCCESSOR_HEADER = "后继"
export const RETIRED_TASK_HEADER = "退休来源任务"
export const TEXT_DEST_HEADER = "条文去向"
// 端清单表格定位锚
export const ENDPOINT_ANCHOR_HEADER = "端名"
// 退休台账表格定位锚
export const RETIRED_ANCHOR_HEADER = "退休时语义（冻结）"

// 表头行与分隔行由列名集合派生：列数不手写，杜绝表头与分隔行列数脱节
function headerRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`
}
function separatorRow(count: number): string {
  return `| ${Array.from({ length: count }, () => "---").join(" | ")} |`
}
// 表格两行文本（表头 + 派生分隔行），供骨架与 init 单源拼接
function tableLines(cells: string[]): string {
  return `${headerRow(cells)}\n${separatorRow(cells.length)}`
}

// 索引表列名集合（v3 五列）与骨架两行：表头 / 分隔行由此单源派生，形态改一处即全体一致
export const INDEX_TABLE_LINES = tableLines([ID_HEADER, NAME_HEADER, INDEX_ANCHOR_HEADER, OWNER_HEADER, SOURCE_HEADER])

// index.md 标题归一目标
export const INDEX_TITLE = "# 项目协作规范索引"

// 载体形态：v3 良构 / v2 合法存量 / v1 合法存量 / abnormal 形态异常（拒绝自动处理） / none 未初始化
export type ConventionsForm = "v3" | "v2" | "v1" | "abnormal" | "none"

// 表格块：表头行与数据行的 0 基行号一并返回，供改写方按行拼接
export interface TableBlock {
  headerLine: number
  separatorLine: number
  rowLines: number[]
  header: string[]
  rows: string[][]
}

// 索引条目：稳定 ID + 名称 + 原始单元格（列序随表头，便于按列名取值）
export interface IndexEntry {
  id: string
  name: string
  cells: string[]
}

// 载体存在性（轻量判据：仅文件存在性与 index.md 首行标记，不解析表）
export interface CarrierPresence {
  hasDir: boolean
  hasIndex: boolean
  hasHistory: boolean
  hasRetired: boolean
  hasLegacy: boolean
  markerVersion: number | null
}

// 载体完整状态：存在性 + 表解析结果
export interface CarrierState extends CarrierPresence {
  dir: string
  indexFile: string
  historyFile: string
  retiredFile: string
  legacyFile: string
  form: ConventionsForm
  header: string[]
  entries: IndexEntry[]
  maxSeq: number
}

// 内部引用改写命中（报告用）
export interface RefHit {
  from: string
  to: string
}

// 稳定 ID 形态：`C-<n>` 去补零、不带端前缀（与 idOf 同一份约定，供校验侧复用）
export const ID_RE = /^C-\d+$/

// 序号转稳定 ID：去补零、不带端前缀，只追加不重排不回收
export function idOf(n: number): string {
  return `C-${n}`
}

// 剥去单元格的行内代码包裹（规范要求引用以反引号包裹），供 ID 判据容忍 `C-4` 与 C-4 两种写法
export function stripCode(cell: string): string {
  return cell.trim().replace(/^`+|`+$/g, "").trim()
}

// 单元格是否为稳定 ID 形态（容忍行内代码包裹）：校验侧唯一入口，避免各处以裸字符串直比而漏判合法写法
export function isIdCell(cell: string): boolean {
  return ID_RE.test(stripCode(cell))
}

// 读首行标记版本：标记约定置首行，正文示例里的同形注释不参与判定
function firstLineMarkerVersion(content: string, re: RegExp): number | null {
  const first = content.split(/\r?\n/, 1)[0] ?? ""
  const m = re.exec(first)
  return m ? Number(m[1]) : null
}

// 读载体标记版本（只看 index.md 首行）
export function readCarrierVersion(content: string): number | null {
  return firstLineMarkerVersion(content, CARRIER_MARKER_RE)
}

// 读入口壳标记版本：壳首部为 frontmatter，标记退居其后，故全文件扫描
export function readEntryVersion(content: string): number | null {
  const m = ENTRY_MARKER_RE.exec(content)
  return m ? Number(m[1]) : null
}

// 收集载体存在性与首行标记（不解析内容，供 check 等只读场景复用）
export function readCarrierPresence(tasksDir: string): CarrierPresence {
  const dir = join(tasksDir, CONVENTIONS_DIR)
  const indexFile = join(dir, INDEX_FILE)
  const hasIndex = existsSync(indexFile)
  return {
    hasDir: existsSync(dir),
    hasIndex,
    hasHistory: existsSync(join(dir, HISTORY_FILE)),
    hasRetired: existsSync(join(dir, RETIRED_FILE)),
    hasLegacy: existsSync(join(tasksDir, LEGACY_FILE)),
    markerVersion: hasIndex ? readCarrierVersion(readTextFile(indexFile)) : null,
  }
}

// 形态判定（结构与标记不一致时一律判为异常，交由人工确认，不做静默归一）
export function detectForm(hasIndex: boolean, hasHistory: boolean, idColumn: boolean, markerVersion: number | null): ConventionsForm {
  if (!hasIndex) return "none"
  if (markerVersion === CARRIER_VERSION) return hasHistory && idColumn ? "v3" : "abnormal"
  if (markerVersion === 2) return hasHistory && idColumn ? "v2" : "abnormal"
  if (markerVersion !== null) return "abnormal"
  if (hasHistory) return idColumn ? "v2" : "abnormal"
  return idColumn ? "abnormal" : "v1"
}

// 是否为表格行（首尾带竖线）
export function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith("|") && t.endsWith("|") && t.length > 1
}

// 按转义感知切分单元格正文：`\|` 为字面竖线不参与切分（数 `|` 前连续反斜杠的奇偶）
function splitCells(body: string): string[] {
  const cells: string[] = []
  let current = ""
  let backslashes = 0
  for (const ch of body) {
    if (ch === "\\") {
      backslashes += 1
      current += ch
      continue
    }
    if (ch === "|" && backslashes % 2 === 0) {
      cells.push(current.trim())
      current = ""
    } else {
      current += ch
    }
    backslashes = 0
  }
  cells.push(current.trim())
  return cells
}

// 拆表格行为单元格（去首尾竖线与各格空白；单元格内的转义竖线不切分）
export function splitRow(line: string): string[] {
  return splitCells(line.trim().replace(/^\|/, "").replace(/\|$/, ""))
}

// 是否为分隔行（各格均为 :?-{2,}:? 形态）
export function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) return false
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c))
}

// 定位表格：表头行含指定单元格、且下一行为分隔行；数据行取到首个非表格行止
export function findTable(lines: string[], headerCell: string): TableBlock | null {
  for (let i = 0; i + 1 < lines.length; i++) {
    const head = lines[i] ?? ""
    if (!isTableRow(head) || !splitRow(head).includes(headerCell)) continue
    if (!isSeparatorRow(lines[i + 1] ?? "")) continue
    const rows: string[][] = []
    const rowLines: number[] = []
    for (let j = i + 2; j < lines.length; j++) {
      const line = lines[j] ?? ""
      if (!isTableRow(line) || isSeparatorRow(line)) break
      rows.push(splitRow(line))
      rowLines.push(j)
    }
    return { headerLine: i, separatorLine: i + 1, rowLines, header: splitRow(head), rows }
  }
  return null
}

// 索引表定位（v1 / v2 / v3 表头共有「当前语义」列，据其锚定）
export function parseIndexTable(lines: string[]): TableBlock | null {
  return findTable(lines, INDEX_ANCHOR_HEADER)
}

// 取某列在表头中的下标；列名缺失返回 -1
export function columnIndex(header: string[], name: string): number {
  return header.findIndex((h) => h === name)
}

// 改写表格行的指定单元格，写回归一形态 `| a | b |`；越界单元格追加到行尾
export function setRowCell(line: string, index: number, value: string): string {
  const cells = splitRow(line)
  cells[index] = value
  return `| ${cells.join(" | ")} |`
}

// 解析索引条目：首列即 ID（v2）或序号（v1），第二列为规则名
function parseEntries(table: TableBlock): IndexEntry[] {
  const entries: IndexEntry[] = []
  for (const cells of table.rows) {
    if (cells.every((c) => c === "")) continue
    entries.push({ id: cells[0] ?? "", name: cells[1] ?? "", cells })
  }
  return entries
}

// 读载体完整状态：存在性 + 形态判定 + 索引表解析
export function readCarrier(tasksDir: string): CarrierState {
  const presence = readCarrierPresence(tasksDir)
  const dir = join(tasksDir, CONVENTIONS_DIR)
  const indexFile = join(dir, INDEX_FILE)
  const content = presence.hasIndex ? readTextFile(indexFile) : ""
  const table = presence.hasIndex ? parseIndexTable(content.split(/\r?\n/)) : null
  const header = table?.header ?? []
  const idColumn = (header[0] ?? "") === ID_HEADER
  const entries = table ? parseEntries(table) : []
  const seqs = entries.map((e) => Number(e.id)).filter((n) => Number.isInteger(n))
  return {
    ...presence,
    dir,
    indexFile,
    historyFile: join(dir, HISTORY_FILE),
    retiredFile: join(dir, RETIRED_FILE),
    legacyFile: join(tasksDir, LEGACY_FILE),
    form: detectForm(presence.hasIndex, presence.hasHistory, idColumn, presence.markerVersion),
    header,
    entries,
    maxSeq: seqs.length > 0 ? Math.max(...seqs) : 0,
  }
}

// 载体内全部需扫描内部引用的文件：index.md 与各活跃分册；history.md / retired.md 属归档、只增不改故排除
export function carrierFiles(state: CarrierState): string[] {
  if (!state.hasIndex) return []
  const files = [state.indexFile]
  if (!existsSync(state.dir)) return files
  for (const entry of readdirSync(state.dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    if (entry.name === INDEX_FILE || entry.name === HISTORY_FILE || entry.name === RETIRED_FILE) continue
    files.push(join(state.dir, entry.name))
  }
  return files
}

// 载体内部活引用：裸「第 N 条」且 N ≤ 索引表最大序号者指向索引条目，须改写为 `C-N`
const INTERNAL_REF_RE = /第\s*(\d+)\s*条/g
// 带外部文档限定词前缀的引用指向外部规则层（如 AGENTS.md 质量门第 5 条），一律不动
const EXTERNAL_QUALIFIER_RE = /(?:质量门|协作模型|章节|第\s*\d+\s*节|[A-Za-z0-9_./-]+\.md|`[^`\n]*`)[^。；，、\n]{0,10}$/

// 改写单行内部引用：返回改写后的行与命中清单（无命中时原样返回）
export function rewriteRefsInLine(line: string, maxSeq: number): { line: string; hits: RefHit[] } {
  const hits: RefHit[] = []
  const next = line.replace(INTERNAL_REF_RE, (match: string, digits: string, offset: number) => {
    const n = Number(digits)
    if (!Number.isInteger(n) || n < 1 || n > maxSeq) return match
    if (EXTERNAL_QUALIFIER_RE.test(line.slice(0, offset))) return match
    const to = `\`${idOf(n)}\``
    hits.push({ from: match, to })
    return to
  })
  return { line: next, hits }
}

// 演进记录标题（v2 起独立成文件）
export const HISTORY_TITLE = "# 规范演进记录"
// 演进记录表格定位锚（第三列固定为修订来源任务）
export const HISTORY_ANCHOR_HEADER = "修订来源任务"
// 演进记录表列名集合：表头行与分隔行由此单源派生，首格与索引表同为稳定 ID
const HISTORY_COLUMNS = [ID_HEADER, REVISION_HEADER, HISTORY_ANCHOR_HEADER]
export const HISTORY_TABLE_HEADER = headerRow(HISTORY_COLUMNS)
// 表语义边界：只记规范语义变更，载体结构升级、入口壳增删与条目退休均不入表（退休见 retired.md）
export const HISTORY_BOUNDARY_LINE =
  "> 表语义边界：本表只记**规范语义变更**；载体结构升级、入口壳生成 / 删除、条目退休均不入表（退休见 `retired.md`）。"
// 元规则引语：留痕与源头变更同步机制
export const HISTORY_INTRO_LINE =
  "> 元规则：规则语义变更时不得覆盖旧语义直接丢史——在「演进记录」追加一条（规则 ID → 旧语义 → 变更为 → 修订来源任务），`index.md` 索引表只保留当前语义；规则层源头变更（`AGENTS.md` / `docs/ai-rules.md` / skills 条文）随该变更同批落盘。"

// 演进记录骨架（新建项目与无演进记录节时升级共用）
export const HISTORY_SKELETON = `${HISTORY_TITLE}

${HISTORY_INTRO_LINE}
${HISTORY_BOUNDARY_LINE}

${tableLines(HISTORY_COLUMNS)}
`

// 退休台账标题、元规则与表头（v3 独立成文件，属 Z3 归档、不进常规读面）
export const RETIRED_TITLE = "# 规范退休记录"
export const RETIRED_META_LINE =
  "> 元规则：条目作废即从 `index.md` 迁出至本表并冻结退休时语义；编号不回收（见 conventions-spec §8）。本表属 Z3 归档、不进常规读面。"
// 退休台账表列名集合：表头行与分隔行由此单源派生
const RETIRED_COLUMNS = [ID_HEADER, NAME_HEADER, RETIRED_ANCHOR_HEADER, OWNER_HEADER, SUCCESSOR_HEADER, RETIRED_TASK_HEADER, TEXT_DEST_HEADER]
export const RETIRED_TABLE_HEADER = headerRow(RETIRED_COLUMNS)

// 退休台账骨架（首个退休条目迁出时创建）
export const RETIRED_SKELETON = `${RETIRED_TITLE}

${RETIRED_META_LINE}

${tableLines(RETIRED_COLUMNS)}
`
