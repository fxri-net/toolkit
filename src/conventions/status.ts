// 规范载体只读体检：形态 / 索引 / 入口层三块，只报问题不修（不给 --fix），异常不阻断、退出码恒 0
// 判据全部走 format.ts / entry.ts 的既有实现在，不在本模块另写一份结构解析
import { basename, join } from "node:path"
import { readTextFile } from "../read-text"
import {
  CONVENTIONS_DIR,
  ENDPOINT_ANCHOR_HEADER,
  ENTRY_VERSION,
  HISTORY_FILE,
  ID_RE,
  INDEX_FILE,
  LEGACY_FILE,
  carrierFiles,
  columnIndex,
  findTable,
  readCarrier,
  type CarrierState,
  type ConventionsForm,
} from "./format"
import { findEntryShells, isGitIgnored } from "./entry"

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

// 载体形态块：v2 无项；v1 提示可升级；形态异常与旧单文件并存各报一条
function checkForm(state: CarrierState, items: ConventionsStatusItem[]): void {
  if (state.form === "v1") {
    items.push({
      level: "warn",
      scope: "形态",
      message: `载体为 v1 形态（无形态标记、无 ${HISTORY_FILE}）：可执行 toolkit conventions upgrade 升为 v2`,
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

// 索引块：ID 形态 / ID 重复 / 归属悬空 / 分册孤立（v1 首列为序号，不做 ID 形态检查）
function checkIndex(state: CarrierState, items: ConventionsStatusItem[]): void {
  const indexContent = state.hasIndex ? readTextFile(state.indexFile) : ""
  const lines = indexContent.split(/\r?\n/)
  const ids = state.entries.map((e) => e.id).filter((id) => id !== "")

  if (state.form === "v2") {
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

  // 归属列取值须落在端清单（含保留归属 common）内，否则为悬空指针
  const ownerIdx = columnIndex(state.header, "归属")
  const endpoints = findTable(lines, ENDPOINT_ANCHOR_HEADER)
  if (ownerIdx !== -1 && endpoints) {
    const nameIdx = columnIndex(endpoints.header, "端名")
    const declared = new Set<string>()
    for (const row of endpoints.rows) {
      const name = nameIdx === -1 ? "" : (row[nameIdx] ?? "")
      if (name !== "") declared.add(name)
    }
    for (const entry of state.entries) {
      for (const owner of (entry.cells[ownerIdx] ?? "").split(/[、,，\s]+/).filter((o) => o !== "")) {
        if (!declared.has(owner) && !RESERVED_OWNERS.has(owner)) {
          items.push({ level: "warn", scope: "索引", message: `条目 ${entry.id} 的归属「${owner}」不在端清单中` })
        }
      }
    }
  }

  // 分册孤立：分册小节 ID 在索引表中无对应条目
  const idSet = new Set(ids)
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
}

// 入口层块：壳版本落后于当前 toolkit 告警；壳被 gitignore 覆盖告警（不分发等于只在本机生效）；无壳仅提示
function checkEntryLayer(cwd: string, items: ConventionsStatusItem[]): EntryShellState[] {
  const shells: EntryShellState[] = []
  for (const shell of findEntryShells(cwd)) {
    const ignored = isGitIgnored(cwd, shell.file)
    shells.push({ file: shell.file, version: shell.version, ignored })
    if (shell.version !== ENTRY_VERSION) {
      items.push({
        level: "warn",
        scope: "入口层",
        message: `入口壳标记版本为 ${shell.version ?? "无"}，与当前 toolkit 的 v${ENTRY_VERSION} 不一致：重跑 toolkit init 可补齐`,
      })
    }
    if (ignored) {
      items.push({
        level: "warn",
        scope: "入口层",
        message: `入口壳 ${shell.file} 被 gitignore 覆盖：不会随 git 分发，请把该路径从忽略规则中排除`,
      })
    }
  }
  if (shells.length === 0) {
    items.push({ level: "info", scope: "入口层", message: "未找到入口壳：执行 toolkit init 可生成（项目级技能目录）" })
  }
  return shells
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
