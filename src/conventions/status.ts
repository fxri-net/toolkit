// 规范载体只读体检：形态 / 索引 / 入口层三块，只报问题不修（不给 --fix），体检本身异常不阻断、退出码恒 0（非法 --format 由 CLI 层按参数错误处理）
// 判据全部走 format.ts / entry.ts 的既有实现在，不在本模块另写一份结构解析
import { basename, join, relative } from "node:path"
import { existsSync } from "node:fs"
import { readTextFile } from "../read-text"
import { filledTableLines, listMarkdownFiles } from "./compact"
import {
  CONVENTIONS_DIR,
  ENDPOINT_ANCHOR_HEADER,
  ENTRY_VERSION,
  HISTORY_FILE,
  ID_HEADER,
  ID_RE,
  INDEX_ANCHOR_HEADER,
  INDEX_FILE,
  LEGACY_FILE,
  OWNER_HEADER,
  RETIRED_ANCHOR_HEADER,
  RETIRED_FILE,
  carrierFiles,
  columnIndex,
  findTable,
  readCarrier,
  type CarrierState,
  type ConventionsForm,
} from "./format"
import { findEntryShells, ignoredShellAlert, isToolkitSourceRepo, mismatchedShellAlert, type EntryShell } from "./entry"
import { gitIgnoredSet } from "../git-ignore"

// 体检项：level 只分「待处理（warn）」与「提示（info）」，info 不计入问题数
export interface ConventionsStatusItem {
  level: "warn" | "info"
  scope: "形态" | "索引" | "入口层"
  message: string
}

// 入口壳现场 + 是否被 git 忽略（被忽略的壳不会随 git 分发，等于只在生成者本机生效）
export interface EntryShellState {
  file: string
  version: number | null
  ignored: boolean
}

export interface ConventionsStatusReport {
  initialized: boolean
  tasksDir: string
  dir: string
  form: ConventionsForm
  carrierVersion: number | null
  entries: number
  shells: EntryShellState[]
  items: ConventionsStatusItem[]
  warnings: number
  summary: string
}

// 独占一行的分册小节标题：`## C-23. 名称` 或 v1 的 `## 23. 名称`
const SUBHEAD_RE = /^##\s+([^\s.]+)\.\s/
// 保留归属：`common` 恒合法（不进端清单），`index` 为载体内保留字
const RESERVED_OWNERS = new Set(["common", "index"])

// 一句话结论：问题数 0 时给正结论，非 0 时报待处理项数
function summarize(form: ConventionsForm, entries: number, shells: number, warnings: number): string {
  const head = `载体 ${form}，${entries} 条规范，入口壳 ${shells} 个`
  return warnings === 0 ? `${head}，无待处理项` : `${head}，${warnings} 项待处理`
}

// 载体形态块：v3 无项；v1 提示可升级；形态异常与旧单文件并存各报一条
function checkForm(state: CarrierState, items: ConventionsStatusItem[]): void {
  if (state.form === "v1") {
    items.push({
      level: "warn",
      scope: "形态",
      message: `载体为 v1 形态（无形态标记、无 ${HISTORY_FILE}）：可执行 toolkit conventions upgrade 升为 v3`,
    })
  } else if (state.form === "abnormal") {
    items.push({
      level: "warn",
      scope: "形态",
      message: `载体形态异常（形态标记、${HISTORY_FILE} 与索引表首列三者不一致）：请人工确认后再处理，不要直接升级`,
    })
  }
  if (state.hasLegacy) {
    items.push({
      level: "warn",
      scope: "形态",
      message: `旧单文件 ${LEGACY_FILE} 与目录形态并存：确认内容已迁入后清理旧文件`,
    })
  }
}

// 索引块：ID 形态 / ID 重复 / 归属悬空 / common 带端提示 / 分册孤立 / 退休台账
function checkIndex(state: CarrierState, items: ConventionsStatusItem[]): void {
  const indexContent = state.hasIndex ? readTextFile(state.indexFile) : ""
  const lines = indexContent.split(/\r?\n/)
  const ids = state.entries.map((e) => e.id).filter((id) => id !== "")
  const idSet = new Set(ids)

  // ID 形态与重复：首列为 ID 时（v2 / v3）校验；v1 首列为序号，不做此检查
  if ((state.header[0] ?? "") === ID_HEADER) {
    for (const id of ids) {
      if (!ID_RE.test(id)) {
        items.push({ level: "warn", scope: "索引", message: `索引表首列「${id}」不合稳定 ID 形态 C-<n>` })
      }
    }
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) items.push({ level: "warn", scope: "索引", message: `索引表存在重复 ID ${id}` })
      seen.add(id)
    }
  }

  // 载体分册名集合（含分类标签分册），供归属合法性与孤立判定复用
  const volumeNames = new Set<string>()
  for (const file of carrierFiles(state)) {
    if (file === state.indexFile) continue
    volumeNames.add(basename(file, ".md"))
  }

  // 归属列取值须落在端清单、保留归属 common 或已存在的分类标签分册名内，否则为悬空指针
  const ownerIdx = columnIndex(state.header, OWNER_HEADER)
  const endpoints = findTable(lines, ENDPOINT_ANCHOR_HEADER)
  const nameIdx = endpoints ? columnIndex(endpoints.header, "端名") : -1
  const declared = new Set<string>()
  if (endpoints) {
    for (const row of endpoints.rows) {
      const name = nameIdx === -1 ? "" : (row[nameIdx] ?? "")
      if (name !== "") declared.add(name)
    }
  }
  const semanticIdx = columnIndex(state.header, INDEX_ANCHOR_HEADER)
  if (ownerIdx !== -1 && endpoints) {
    for (const entry of state.entries) {
      const owners = (entry.cells[ownerIdx] ?? "").split(/[、,，\s]+/).filter((o) => o !== "")
      for (const owner of owners) {
        if (!declared.has(owner) && !RESERVED_OWNERS.has(owner) && !volumeNames.has(owner)) {
          items.push({ level: "warn", scope: "索引", message: `条目 ${entry.id} 的归属「${owner}」不在端清单、保留归属或分类标签分册中` })
        }
      }
      // common 锁死为「所有端都适用」：语义提及具体端名时提示确认是否应下沉为端归属
      if (owners.length === 1 && owners[0] === "common" && semanticIdx !== -1) {
        const semantic = entry.cells[semanticIdx] ?? ""
        const hit = [...declared].find((name) => name !== "" && semantic.includes(name))
        if (hit) items.push({ level: "warn", scope: "索引", message: `条目 ${entry.id} 归属 common 但语义提及端「${hit}」，确认是否应下沉为端归属` })
      }
    }
  }

  // 分册孤立：分册小节 ID 在索引表中无对应条目
  for (const file of carrierFiles(state)) {
    if (file === state.indexFile) continue
    const name = basename(file, ".md")
    for (const line of readTextFile(file).split(/\r?\n/)) {
      const m = SUBHEAD_RE.exec(line)
      if (m && !idSet.has(m[1] ?? "")) {
        items.push({ level: "warn", scope: "索引", message: `分册 ${name}.md 的小节 ${m[1]} 在索引表中无对应条目` })
      }
    }
  }

  // 退休台账：存在时须能定位退休表；其 ID 不得与 Z1 活跃条目重叠（I1 / I2）
  if (state.hasRetired) {
    const retiredTable = findTable(readTextFile(state.retiredFile).split(/\r?\n/), RETIRED_ANCHOR_HEADER)
    if (!retiredTable) {
      items.push({ level: "warn", scope: "索引", message: `${RETIRED_FILE} 未定位到退休表（表头须含「${RETIRED_ANCHOR_HEADER}」）` })
    } else {
      const idIdx = columnIndex(retiredTable.header, ID_HEADER)
      for (const row of retiredTable.rows) {
        const id = idIdx === -1 ? "" : (row[idIdx] ?? "")
        if (id !== "" && idSet.has(id)) {
          items.push({ level: "warn", scope: "索引", message: `条目 ${id} 同时存在于索引表与 ${RETIRED_FILE}（退休条目须已迁出常驻索引）` })
        }
      }
    }
  }
}

// 表格形态块：检出被格式化器填充（列对齐空白）的表格行，指向 conventions format 归一；命中文件多时只列前几个
const TABLE_FORM_PREVIEW = 5
function checkTableForm(tasksDir: string, items: ConventionsStatusItem[]): void {
  if (!existsSync(tasksDir)) return
  const hits: string[] = []
  for (const file of listMarkdownFiles(tasksDir)) {
    const count = filledTableLines(readTextFile(file)).length
    if (count > 0) hits.push(`${relative(tasksDir, file).replace(/\\/g, "/")}（${count} 行）`)
  }
  if (hits.length === 0) return
  const more = hits.length > TABLE_FORM_PREVIEW ? ` 等 ${hits.length} 个文件` : ""
  items.push({
    level: "warn",
    scope: "形态",
    message: `表格存在列对齐填充（偏离紧凑形态）：执行 toolkit conventions format 归一；命中 ${hits.slice(0, TABLE_FORM_PREVIEW).join("、")}${more}`,
  })
}

// 入口层块：壳版本不一致、壳被 gitignore 覆盖各合并为一条告警（多落点内联路径，不按壳重复）；无壳仅提示（本包源仓库除外，其本就不生成壳）
function checkEntryLayer(cwd: string, items: ConventionsStatusItem[]): EntryShellState[] {
  const shells = findEntryShells(cwd)
  // 一次批量判定全部落点的 gitignore 状态，避免逐壳各起一个 git 子进程
  const ignored = gitIgnoredSet(cwd, shells.map((s) => s.file))
  const mismatchedShells: EntryShell[] = []
  const ignoredShells: EntryShell[] = []
  const states = shells.map((shell) => {
    const isIgnored = ignored.has(shell.file)
    if (shell.version !== ENTRY_VERSION) mismatchedShells.push(shell)
    if (isIgnored) ignoredShells.push(shell)
    return { file: shell.file, version: shell.version, ignored: isIgnored }
  })
  for (const alert of [mismatchedShellAlert(mismatchedShells), ignoredShellAlert(ignoredShells)]) {
    if (alert) items.push({ level: "warn", scope: "入口层", message: alert.message })
  }
  if (shells.length === 0) {
    items.push(
      isToolkitSourceRepo(cwd)
        ? { level: "info", scope: "入口层", message: "本包源仓库不生成入口壳（靠 fxri-* 技能自举）：无需补生成" }
        : { level: "info", scope: "入口层", message: "未找到入口壳：执行 toolkit init 可生成（项目级技能目录）" },
    )
  }
  return states
}

// 体检入口：未初始化时只回单条结论并提前返回，避免把未初始化误报成一堆异常项
export function conventionsStatus(tasksDir = ".tasks", cwd = process.cwd()): ConventionsStatusReport {
  const state = readCarrier(tasksDir)
  const base = {
    tasksDir,
    dir: state.dir,
    form: state.form,
    carrierVersion: state.markerVersion,
    entries: state.entries.length,
  }
  if (!state.hasIndex) {
    const message = state.hasLegacy
      ? `未找到 ${state.dir}/${INDEX_FILE}（仅存旧单文件 ${LEGACY_FILE}）：先按 conventions-spec 迁移为目录形态，再执行 toolkit conventions status`
      : `未找到 ${join(tasksDir, CONVENTIONS_DIR)}/，先执行 toolkit init`
    return {
      initialized: false,
      ...base,
      shells: [],
      items: [{ level: "info", scope: "形态", message }],
      warnings: 0,
      summary: message,
    }
  }

  const items: ConventionsStatusItem[] = []
  checkForm(state, items)
  checkIndex(state, items)
  checkTableForm(tasksDir, items)
  const shells = checkEntryLayer(cwd, items)
  const warnings = items.filter((i) => i.level === "warn").length
  return {
    initialized: true,
    ...base,
    shells,
    items,
    warnings,
    summary: summarize(state.form, state.entries.length, shells.length, warnings),
  }
}
