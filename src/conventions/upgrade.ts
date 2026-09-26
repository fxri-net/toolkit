// 规范载体 v1 → v2 结构升级：发稳定 ID / 抽演进记录成 history.md / 内部引用改 ID / 首行补标记 / 标题归一 / 节号重编
// 先判后写：形态未初始化或异常一律拒绝执行并在写盘前抛出，保证异常态不产生任何文件改动
import { basename } from "node:path"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import {
  CARRIER_MARKER,
  HISTORY_BOUNDARY_LINE,
  HISTORY_FILE,
  HISTORY_SKELETON,
  HISTORY_TITLE,
  ID_HEADER,
  INDEX_FILE,
  INDEX_TITLE,
  LEGACY_FILE,
  carrierFiles,
  findTable,
  idOf,
  parseIndexTable,
  readCarrier,
  rewriteRefsInLine,
  setRowCell,
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
  status: "upgraded" | "already-v2"
  tasksDir: string
  dir: string
  form: ConventionsForm
  idMap: IdMapRow[]
  refs: RefRewrite[]
  changes: UpgradeChange[]
}

export interface UpgradeOptions {
  dryRun?: boolean
}

// 中文序号节标题（`## 三、演进记录（修订留痕）`）与任意二级标题
const SECTION_HEAD_RE = /^##\s*[一二三四五六七八九十]+、\s*(.*)$/
const ANY_SECTION_RE = /^##\s/
const DISPLAY_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
// 分册小节标题（`## 23. 测试假现场须与真实现场形态一致`）
const SUBHEAD_RE = /^(##\s+)(\d+)(\.\s*)/
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

// v1 → v2 升级主流程；v2 幂等返回，其余非 v1 形态直接抛出
export function upgradeConventions(tasksDir = ".tasks", options: UpgradeOptions = {}): UpgradeReport {
  const state = readCarrier(tasksDir)
  const base = { tasksDir, dir: state.dir, form: state.form }
  if (state.form === "v2") {
    return { status: "already-v2", ...base, idMap: [], refs: [], changes: [] }
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

  const raw = readTextFile(state.indexFile)
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  const lines = raw.split(/\r?\n/)
  const changes: UpgradeChange[] = []
  const refs: RefRewrite[] = []

  const table = parseIndexTable(lines)
  if (!table) {
    throw new Error(`未在 ${state.dir}/${INDEX_FILE} 中定位到索引表（表头须含「当前语义」列），无法机械升级；本次未写入任何文件`)
  }
  const idMap: IdMapRow[] = []
  const seqToId = new Map<number, string>()
  for (const cells of table.rows) {
    const seq = Number(cells[0])
    if (!Number.isInteger(seq) || seq < 1) continue
    idMap.push({ seq, id: idOf(seq), name: cells[1] ?? "" })
    seqToId.set(seq, idOf(seq))
  }

  // ① 首行插入形态标记
  lines.unshift(CARRIER_MARKER)
  changes.push({ target: INDEX_FILE, detail: `首行插入形态标记 ${CARRIER_MARKER}` })

  // ② 标题归一
  const titleIdx = lines.findIndex((l) => /^#\s+\S/.test(l))
  if (titleIdx !== -1) {
    lines[titleIdx] = INDEX_TITLE
  } else {
    lines.splice(1, 0, INDEX_TITLE, "")
  }
  changes.push({ target: INDEX_FILE, detail: `标题归一为「${INDEX_TITLE}」` })

  // ③ 抽「演进记录」节写 history.md，并从 index.md 移除
  let secStart = -1
  for (let i = 0; i < lines.length; i++) {
    const m = SECTION_HEAD_RE.exec(lines[i] ?? "")
    if (m && (m[1] ?? "").includes("演进记录")) {
      secStart = i
      break
    }
  }
  let historyContent = HISTORY_SKELETON.split("\n").join(eol)
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
    lines.splice(secStart, secEnd - secStart)
    // 删除节后若与前后空行叠加成连续空行，去掉一处
    if ((lines[secStart - 1] ?? "").trim() === "" && (lines[secStart] ?? "").trim() === "") lines.splice(secStart, 1)
    changes.push({ target: HISTORY_FILE, detail: `抽出「演进记录」节 ${built.rows} 条数据行，独立成文件` })
    changes.push({ target: INDEX_FILE, detail: "移除「演进记录」节（内容迁至 history.md）" })
  }

  // ④ 索引表首列改稳定 ID（表头 `#` → `ID`，数据行序号 → `C-n`）
  const indexTable = parseIndexTable(lines)
  let idRows = 0
  if (indexTable) {
    lines[indexTable.headerLine] = setRowCell(lines[indexTable.headerLine] ?? "", 0, ID_HEADER)
    for (let k = 0; k < indexTable.rowLines.length; k++) {
      const rowLine = indexTable.rowLines[k] ?? 0
      const id = seqToId.get(Number(indexTable.rows[k]?.[0] ?? ""))
      if (!id) continue
      lines[rowLine] = setRowCell(lines[rowLine] ?? "", 0, id)
      idRows += 1
    }
  }
  changes.push({ target: INDEX_FILE, detail: `索引表首列由序号改为稳定 ID（${idRows} 条，表头 ${ID_HEADER}）` })

  // ⑤ 节号按剩余节顺序重编（演进记录移出后「四、用法说明」递补为「三」）
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

  // ⑥ 内部活引用改写：裸「第 N 条」（N ≤ 索引表最大序号）改 `C-N`，指向原「演进记录」节者改指 history.md
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

  // 分册：小节标题序号改稳定 ID，内部活引用同步改写
  const volumes = new Map<string, string>()
  for (const file of carrierFiles(state)) {
    if (file === state.indexFile) continue
    const fileRaw = readTextFile(file)
    const fileEol = fileRaw.includes("\r\n") ? "\r\n" : "\n"
    const fileLines = fileRaw.split(/\r?\n/)
    let subheads = 0
    for (let i = 0; i < fileLines.length; i++) {
      const line = fileLines[i] ?? ""
      const m = SUBHEAD_RE.exec(line)
      const id = m ? seqToId.get(Number(m[2])) : undefined
      if (m && id) {
        fileLines[i] = `${m[1]}${id}${m[3]}${line.slice(m[0].length)}`
        subheads += 1
      }
      const r = rewriteRefsInLine(fileLines[i] ?? "", state.maxSeq)
      fileLines[i] = r.line
      for (const hit of r.hits) refs.push({ file: basename(file), from: hit.from, to: hit.to })
    }
    volumes.set(file, fileLines.join(fileEol))
    if (subheads > 0) changes.push({ target: basename(file), detail: `小节标题序号改为稳定 ID（${subheads} 处）` })
  }

  if (!options.dryRun) {
    writeFileAtomic(state.indexFile, lines.join(eol))
    writeFileAtomic(state.historyFile, historyContent)
    for (const [file, content] of volumes) writeFileAtomic(file, content)
  }

  return { status: "upgraded", ...base, idMap, refs, changes }
}
