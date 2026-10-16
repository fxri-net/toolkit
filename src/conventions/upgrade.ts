// 规范载体结构升级：v1 输入链式升级 v1 → v2 → v3，v2 输入执行 v2 → v3，v3 幂等返回
// 先判后写：形态未初始化或异常一律拒绝执行并在写盘前抛出，保证异常态不产生任何文件改动
import { existsSync } from "node:fs"
import { basename } from "node:path"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import {
  CARRIER_MARKER,
  CARRIER_MARKER_RE,
  HISTORY_BOUNDARY_LINE,
  HISTORY_FILE,
  HISTORY_SKELETON,
  HISTORY_TITLE,
  ID_HEADER,
  ID_RE,
  INDEX_ANCHOR_HEADER,
  INDEX_FILE,
  INDEX_TITLE,
  LEGACY_FILE,
  NAME_HEADER,
  OWNER_HEADER,
  RETIRED_ANCHOR_HEADER,
  RETIRED_FILE,
  RETIRED_SKELETON,
  SOURCE_TASK_HEADER,
  STATUS_HEADER,
  carrierFiles,
  columnIndex,
  findTable,
  idOf,
  parseIndexTable,
  readCarrier,
  rewriteRefsInLine,
  setRowCell,
  splitRow,
  type ConventionsForm,
} from "./format"

// ID 映射行：不落盘，仅随报告输出；真值可由迁移提交的父提交（v1 原件）复现
export interface IdMapRow {
  seq: number
  id: string
  name: string
}

// 内部引用改写命中（含所在文件，报告按文件分组展示）
export interface RefRewrite {
  file: string
  from: string
  to: string
}

// 单条结构动作，供 CLI 逐项打印
export interface UpgradeChange {
  target: string
  detail: string
}

export interface UpgradeReport {
  status: "upgraded" | "already-v3"
  tasksDir: string
  dir: string
  form: ConventionsForm
  idMap: IdMapRow[]
  refs: RefRewrite[]
  changes: UpgradeChange[]
  // 待人工复核项（history 补录、退休行后继为空等），只报不改
  reviews: string[]
}

export interface UpgradeOptions {
  dryRun?: boolean
}

// 中文序号节标题（`## 三、演进记录（修订留痕）`）与任意二级标题
const SECTION_HEAD_RE = /^##\s*[一二三四五六七八九十]+、\s*(.*)$/
const ANY_SECTION_RE = /^##\s/
const DISPLAY_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
// v1 分册小节标题（`## 23. 测试假现场须与真实现场形态一致`）
const V1_SUBHEAD_RE = /^(##\s+)(\d+)(\.\s*)/
// v2/v3 分册小节标题（`## C-23. …`），退休迁出时按 ID 定位
const ID_SUBHEAD_RE = /^##\s+(C-\d+)\.\s/
// 退休状态判定：v2 索引表「状态」列取值含「废弃」「废止」
const RETIRED_STATUS_RE = /废弃|废止/
// 演进记录移出 index.md 后，指向原节的表述改指 history.md
const HISTORY_REF_RE = /「演进记录」(?:小节|节)?/g

// 去掉数组首尾的纯空行
function trimBlankEdges(lines: string[]): string[] {
  while (lines.length > 0 && (lines[0] ?? "").trim() === "") lines.shift()
  while (lines.length > 0 && (lines[lines.length - 1] ?? "").trim() === "") lines.pop()
  return lines
}

// 抽出「演进记录」节内容并归一为独立文件正文（标题统一、表头首格改「规则 ID / 名称」、补表语义边界行）
function buildHistoryContent(section: string[], eol: string): { content: string; rows: number } {
  const table = findTable(section, "修订来源任务")
  const body = section.map((line, i) => (table && i === table.headerLine ? setRowCell(line, 0, "规则 ID / 名称") : line))
  // 引语块随节平移，「本节」随文件外置改「本文件」
  const quotes = body.filter((l) => l.trimStart().startsWith(">")).map((l) => l.replace(/本节/g, "本文件"))
  if (!quotes.some((l) => l.includes("表语义边界"))) quotes.push(HISTORY_BOUNDARY_LINE)
  const rest = trimBlankEdges(body.filter((l) => !l.trimStart().startsWith(">")))
  const lines = [HISTORY_TITLE, "", ...quotes, "", ...rest, ""]
  return { content: lines.join(eol), rows: table ? table.rows.length : 0 }
}

// 删除表格行的指定列（下标须降序传入，避免删除后下标漂移）；返回归一紧凑形态
function dropCells(line: string, indicesDesc: number[]): string {
  const cells = splitRow(line)
  for (const i of indicesDesc) cells.splice(i, 1)
  return `| ${cells.join(" | ")} |`
}

// 从行数组中删除 [start, end) 区段，并消解与前后空行叠加成的连续空行
function removeSection(lines: string[], start: number, end: number): void {
  lines.splice(start, end - start)
  if ((lines[start - 1] ?? "").trim() === "" && (lines[start] ?? "").trim() === "") lines.splice(start, 1)
}

// 载体结构升级主流程；v3 幂等返回，未初始化或形态异常直接抛出（不写任何文件）
export function upgradeConventions(tasksDir = ".tasks", options: UpgradeOptions = {}): UpgradeReport {
  const state = readCarrier(tasksDir)
  const base = { tasksDir, dir: state.dir, form: state.form }
  if (state.form === "v3") {
    return { status: "already-v3", ...base, idMap: [], refs: [], changes: [], reviews: [] }
  }
  if (!state.hasIndex) {
    throw new Error(
      state.hasLegacy
        ? `仅存在旧单文件 ${LEGACY_FILE}：请先按 conventions-spec 迁移为目录形态，再执行 conventions upgrade；本次未写入任何文件`
        : `未找到 ${state.dir}/${INDEX_FILE}，先执行 toolkit init`,
    )
  }
  if (state.form === "abnormal") {
    throw new Error(
      `${state.dir}/${INDEX_FILE} 形态异常（形态标记、${HISTORY_FILE} 与索引表首列不一致），请人工确认后再升级；本次未写入任何文件`,
    )
  }

  const fromV1 = state.form === "v1"
  const raw = readTextFile(state.indexFile)
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  const lines = raw.split(/\r?\n/)
  const changes: UpgradeChange[] = []
  const refs: RefRewrite[] = []
  const reviews: string[] = []
  const idMap: IdMapRow[] = []
  const seqToId = new Map<number, string>()

  // 索引表按「当前语义」列锚定（v1/v2/v3 共有）；缺失即无法机械升级
  const initialTable = parseIndexTable(lines)
  if (!initialTable) {
    throw new Error(
      `未在 ${state.dir}/${INDEX_FILE} 中定位到索引表（表头须含「${INDEX_ANCHOR_HEADER}」列），无法机械升级；本次未写入任何文件`,
    )
  }

  // 摘除既有形态标记行（v2 输入首行为 v2 标记；v1 无标记），末尾统一写入最新标记
  if (CARRIER_MARKER_RE.test(lines[0] ?? "")) lines.shift()

  // 读入全部分册（排除 index.md），行级编辑后统一写回
  const volumes = new Map<string, { eol: string; lines: string[] }>()
  for (const file of carrierFiles(state)) {
    if (file === state.indexFile) continue
    const fileRaw = readTextFile(file)
    volumes.set(file, { eol: fileRaw.includes("\r\n") ? "\r\n" : "\n", lines: fileRaw.split(/\r?\n/) })
  }

  let historyContent: string | null = null

  // ===== v1 → v2 段（仅 v1 输入执行；v2 输入跳过，避免误删既有 history.md） =====
  if (fromV1) {
    for (const cells of initialTable.rows) {
      const seq = Number(cells[0])
      if (!Number.isInteger(seq) || seq < 1) continue
      idMap.push({ seq, id: idOf(seq), name: cells[1] ?? "" })
      seqToId.set(seq, idOf(seq))
    }

    // ① 标题归一
    const titleIdx = lines.findIndex((l) => /^#\s+\S/.test(l))
    if (titleIdx !== -1) lines[titleIdx] = INDEX_TITLE
    else lines.unshift(INDEX_TITLE, "")
    changes.push({ target: INDEX_FILE, detail: `标题归一为「${INDEX_TITLE}」` })

    // ② 抽「演进记录」节写 history.md，并从 index.md 移除
    let secStart = -1
    for (let i = 0; i < lines.length; i++) {
      const m = SECTION_HEAD_RE.exec(lines[i] ?? "")
      if (m && (m[1] ?? "").includes("演进记录")) {
        secStart = i
        break
      }
    }
    historyContent = HISTORY_SKELETON.split("\n").join(eol)
    if (secStart === -1) {
      changes.push({ target: HISTORY_FILE, detail: "未找到「演进记录」节，写入空骨架" })
    } else {
      let secEnd = lines.length
      for (let j = secStart + 1; j < lines.length; j++) {
        if (ANY_SECTION_RE.test(lines[j] ?? "")) {
          secEnd = j
          break
        }
      }
      const built = buildHistoryContent(lines.slice(secStart + 1, secEnd), eol)
      historyContent = built.content
      removeSection(lines, secStart, secEnd)
      changes.push({ target: HISTORY_FILE, detail: `抽出「演进记录」节 ${built.rows} 条数据行，独立成文件` })
      changes.push({ target: INDEX_FILE, detail: "移除「演进记录」节（内容迁至 history.md）" })
    }

    // ③ 索引表首列改稳定 ID（表头 `#` → `ID`，数据行序号 → `C-n`）
    const v1Table = parseIndexTable(lines)
    let idRows = 0
    if (v1Table) {
      lines[v1Table.headerLine] = setRowCell(lines[v1Table.headerLine] ?? "", 0, ID_HEADER)
      for (let k = 0; k < v1Table.rowLines.length; k++) {
        const rowLine = v1Table.rowLines[k] ?? 0
        const id = seqToId.get(Number(v1Table.rows[k]?.[0] ?? ""))
        if (!id) continue
        lines[rowLine] = setRowCell(lines[rowLine] ?? "", 0, id)
        idRows += 1
      }
    }
    changes.push({ target: INDEX_FILE, detail: `索引表首列由序号改为稳定 ID（${idRows} 条，表头 ${ID_HEADER}）` })

    // ④ 节号按剩余节顺序重编（演进记录移出后「四、用法说明」递补为「三」）
    let ordinal = 0
    let renumbered = 0
    for (let i = 0; i < lines.length; i++) {
      const m = SECTION_HEAD_RE.exec(lines[i] ?? "")
      if (!m) continue
      const next = `## ${DISPLAY_NUM[ordinal] ?? String(ordinal + 1)}、${m[1] ?? ""}`
      ordinal += 1
      if (next !== lines[i]) renumbered += 1
      lines[i] = next
    }
    if (renumbered > 0) changes.push({ target: INDEX_FILE, detail: `节号顺序重编（${renumbered} 处）` })

    // ⑤ 内部活引用改写：裸「第 N 条」（N ≤ 索引表最大序号）改 `C-N`，指向原「演进记录」节者改指 history.md
    for (let i = 0; i < lines.length; i++) {
      const r = rewriteRefsInLine(lines[i] ?? "", state.maxSeq)
      lines[i] = r.line
      for (const hit of r.hits) refs.push({ file: INDEX_FILE, from: hit.from, to: hit.to })
    }
    let historyRefs = 0
    for (let i = 0; i < lines.length; i++) {
      const before = lines[i] ?? ""
      const after = before.replace(HISTORY_REF_RE, "`history.md`")
      if (after !== before) {
        historyRefs += (before.match(HISTORY_REF_RE) ?? []).length
        lines[i] = after
      }
    }
    if (historyRefs > 0) changes.push({ target: INDEX_FILE, detail: `${historyRefs} 处指向原「演进记录」节的表述改指 history.md` })

    // ⑥ 分册：小节标题序号改稳定 ID，内部活引用同步改写
    for (const [file, vol] of volumes) {
      let subheads = 0
      for (let i = 0; i < vol.lines.length; i++) {
        const line = vol.lines[i] ?? ""
        const m = V1_SUBHEAD_RE.exec(line)
        const id = m ? seqToId.get(Number(m[2])) : undefined
        if (m && id) {
          vol.lines[i] = `${m[1]}${id}${m[3]}${line.slice(m[0].length)}`
          subheads += 1
        }
        const r = rewriteRefsInLine(vol.lines[i] ?? "", state.maxSeq)
        vol.lines[i] = r.line
        for (const hit of r.hits) refs.push({ file: basename(file), from: hit.from, to: hit.to })
      }
      if (subheads > 0) changes.push({ target: basename(file), detail: `小节标题序号改为稳定 ID（${subheads} 处）` })
    }
  }

  // ===== v2 → v3 段（v1 与 v2 输入均执行） =====
  const table = parseIndexTable(lines)
  if (!table) {
    throw new Error(`未在 ${state.dir}/${INDEX_FILE} 中定位到索引表，无法机械升级；本次未写入任何文件`)
  }
  const idIdx = columnIndex(table.header, ID_HEADER)
  const nameIdx = columnIndex(table.header, NAME_HEADER)
  const semanticIdx = columnIndex(table.header, INDEX_ANCHOR_HEADER)
  const ownerIdx = columnIndex(table.header, OWNER_HEADER)
  const statusIdx = columnIndex(table.header, STATUS_HEADER)
  const sourceIdx = columnIndex(table.header, SOURCE_TASK_HEADER)

  // 收集退休条目（「状态」列含「废弃」「废止」），行号取自当前索引表
  const retired: { id: string; name: string; semantic: string; owner: string; line: number; location: string }[] = []
  if (statusIdx >= 0) {
    for (let k = 0; k < table.rows.length; k++) {
      const cells = table.rows[k] ?? []
      if (!RETIRED_STATUS_RE.test(cells[statusIdx] ?? "")) continue
      retired.push({
        id: cells[idIdx] ?? "",
        name: cells[nameIdx >= 0 ? nameIdx : 1] ?? "",
        semantic: cells[semanticIdx] ?? "",
        owner: ownerIdx >= 0 ? (cells[ownerIdx] ?? "") : "—",
        line: table.rowLines[k] ?? -1,
        location: "—",
      })
    }
  }

  // ① 删「状态」「确立来源任务」两列（表头、分隔行、数据行同步删除，下标降序）
  const dropIdx = [statusIdx, sourceIdx].filter((i) => i >= 0).sort((a, b) => b - a)
  if (dropIdx.length > 0) {
    const names = [STATUS_HEADER, SOURCE_TASK_HEADER].filter((n) => columnIndex(table.header, n) >= 0)
    lines[table.headerLine] = dropCells(lines[table.headerLine] ?? "", dropIdx)
    lines[table.separatorLine] = dropCells(lines[table.separatorLine] ?? "", dropIdx)
    for (const rowLine of table.rowLines) lines[rowLine] = dropCells(lines[rowLine] ?? "", dropIdx)
    changes.push({ target: INDEX_FILE, detail: `索引表删除列「${names.join("」「")}」` })
  }

  // ② 退休条目：先删分册小节（三层清理的分册层），再从索引表删行（索引层）
  let removedSections = 0
  for (const r of retired) {
    for (const [file, vol] of volumes) {
      const start = vol.lines.findIndex((l) => ID_SUBHEAD_RE.exec(l)?.[1] === r.id)
      if (start === -1) continue
      let end = vol.lines.length
      for (let j = start + 1; j < vol.lines.length; j++) {
        if (ANY_SECTION_RE.test(vol.lines[j] ?? "")) {
          end = j
          break
        }
      }
      removeSection(vol.lines, start, end)
      removedSections += 1
      r.location = `已删分册小节 \`${basename(file)}\``
    }
  }
  if (retired.length > 0) {
    const dropLines = retired.map((r) => r.line).filter((n) => n >= 0).sort((a, b) => b - a)
    for (const ln of dropLines) lines.splice(ln, 1)
    changes.push({ target: INDEX_FILE, detail: `索引表迁出 ${retired.length} 条退休条目` })
    if (removedSections > 0) changes.push({ target: RETIRED_FILE, detail: `删除分册退休小节 ${removedSections} 处` })
  }

  // ③ retired.md 按需建（无退休条目则不创建）；已存在则把新行追加到退休表末尾
  let retiredContent: string | null = null
  if (retired.length > 0) {
    const rows = retired.map((r) => `| ${r.id} | ${r.name} | ${r.semantic} | ${r.owner} | — | — | ${r.location} |`)
    if (existsSync(state.retiredFile)) {
      const exLines = readTextFile(state.retiredFile).split(/\r?\n/)
      const retiredTable = findTable(exLines, RETIRED_ANCHOR_HEADER)
      if (retiredTable) {
        const lastRow = retiredTable.rowLines[retiredTable.rowLines.length - 1]
        const insertAt = lastRow !== undefined ? lastRow + 1 : retiredTable.separatorLine + 1
        exLines.splice(insertAt, 0, ...rows)
        retiredContent = exLines.join(eol)
      } else {
        reviews.push(`${RETIRED_FILE} 存在但未定位到退休表（表头须含「${RETIRED_ANCHOR_HEADER}」），${retired.length} 条退休条目待人工补录`)
      }
    } else {
      retiredContent = RETIRED_SKELETON.split("\n").join(eol) + rows.join(eol) + eol
      changes.push({ target: RETIRED_FILE, detail: `按需新建（${retired.length} 条退休条目）` })
    }
    reviews.push(`${RETIRED_FILE} 中 ${retired.length} 条退休条目的「后继」「退休来源任务」列机械迁移填「—」，请人工补录`)
  }

  // ④ history.md 人工复核：首列仍用规则名者、来源列含多任务者（只报不改，历史行只追加）
  const historyLines =
    historyContent !== null
      ? historyContent.split(/\r?\n/)
      : existsSync(state.historyFile)
        ? readTextFile(state.historyFile).split(/\r?\n/)
        : null
  if (historyLines) {
    const historyTable = findTable(historyLines, "修订来源任务")
    if (historyTable) {
      const nonId = historyTable.rows.filter((cells) => !ID_RE.test(cells[0] ?? "")).length
      if (nonId > 0) reviews.push(`${HISTORY_FILE} 有 ${nonId} 行首列仍为规则名（未用 C-<n>），请人工核对是否补录 ID`)
      const sourceCol = columnIndex(historyTable.header, "修订来源任务")
      const multi = sourceCol >= 0 ? historyTable.rows.filter((cells) => /[;；+]/.test(cells[sourceCol] ?? "")).length : 0
      if (multi > 0) reviews.push(`${HISTORY_FILE} 有 ${multi} 行来源列含多个任务，请人工核对拆分`)
    }
  }

  // ⑤ 标记升 v3（首行）
  lines.unshift(CARRIER_MARKER)
  changes.push({ target: INDEX_FILE, detail: `首行形态标记置为 ${CARRIER_MARKER}` })

  if (!options.dryRun) {
    writeFileAtomic(state.indexFile, lines.join(eol))
    if (historyContent !== null) writeFileAtomic(state.historyFile, historyContent)
    if (retiredContent !== null) writeFileAtomic(state.retiredFile, retiredContent)
    for (const [file, vol] of volumes) writeFileAtomic(file, vol.lines.join(vol.eol))
  }

  return { status: "upgraded", ...base, idMap, refs, changes, reviews }
}
