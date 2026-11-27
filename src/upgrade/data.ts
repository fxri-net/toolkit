// 本机契约数据迁移：只读扫描磁盘上的旧版本写法，按当前契约版本原子重写
// 只改 schemaVersion，保留未知字段与其余内容；读取端仍兼容历史整数，迁移负责把磁盘写法一并归一
import { existsSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import { contractVersionState, type ContractVersion } from "../contract-version"
import { readTextFile } from "../read-text"
import { findProjectRoot, isHomeDirectory } from "../scope/paths"
import { projectStateFile, skillsStateFile } from "../skills/state"
import { STATE_FORMAT, STATE_SCHEMA_VERSION } from "../skills/types"
import { listTrashManifests, TRASH_MANIFEST_VERSION } from "../trash/store"
import { resolveUsageDir } from "../usage/config"
import { listQueueFiles, USAGE_QUEUE_VERSION } from "../usage/queue"
import { listEventFiles, rebuildIndex, usagePaths, USAGE_INDEX_VERSION } from "../usage/store"
import { USAGE_EVENT_VERSION } from "../usage/types"
import { uploadLedgerPath, USAGE_UPLOAD_VERSION } from "../usage/upload"
import { writeFileAtomic } from "../write-atomic"
import type { BackupSession } from "./backup"
import type { UpgradeItem, UpgradeLayer } from "./types"

// 数据项 id → 当前契约版本：检测与重写共用一份，避免两处各自声明
const DATA_VERSIONS: Record<string, ContractVersion> = {
  "data:skills-state-global": STATE_SCHEMA_VERSION,
  "data:skills-state-project": STATE_SCHEMA_VERSION,
  "data:usage-events": USAGE_EVENT_VERSION,
  "data:usage-index": USAGE_INDEX_VERSION,
  "data:usage-queue": USAGE_QUEUE_VERSION,
  "data:usage-ledger": USAGE_UPLOAD_VERSION,
  "data:trash-global": TRASH_MANIFEST_VERSION,
  "data:trash-project": TRASH_MANIFEST_VERSION,
}

// 单文件版本扫描结果：state 为 legacy / newer / unknown，version 为原始写法
interface FileVersionScan {
  file: string
  state: "legacy" | "newer" | "unknown"
  version: string
}

// 判普通对象：数组与 null 不算
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 去掉旧版本字段：其余字段与顺序原样保留，版本由调用方置顶补齐
function withoutVersion(data: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...data }
  delete rest.schemaVersion
  return rest
}

// 读 JSON 对象：缺失或解析失败返回 null
function readJsonObject(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null
  try {
    const parsed: unknown = JSON.parse(readTextFile(file))
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

// 扫描顶层 schemaVersion：requireFormat 用于技能状态，旧结构交给读取端一次性导入
function scanJsonFile(file: string, expected: ContractVersion, requireFormat = false): FileVersionScan | null {
  const data = readJsonObject(file)
  if (!data) return existsSync(file) ? { file, state: "unknown", version: "无法解析" } : null
  if (requireFormat && data.format !== STATE_FORMAT) return null
  const state = contractVersionState(data.schemaVersion, expected)
  if (state === "current") return null
  const raw = data.schemaVersion
  const version = raw === undefined || raw === null || raw === "" ? "缺失" : String(raw)
  return { file, state, version }
}

// 扫描事件文件逐行版本：只统计非空且可解析的行，损坏行原样保留
interface LineVersionScan {
  file: string
  legacy: number
  newer: number
  unknown: number
}

function scanEventFile(file: string, expected: ContractVersion): LineVersionScan | null {
  let content: string
  try {
    content = readFileSync(file, "utf8")
  } catch {
    return null
  }
  const scan: LineVersionScan = { file, legacy: 0, newer: 0, unknown: 0 }
  for (const line of content.split(/\r?\n/)) {
    const text = line.trim()
    if (!text) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      continue
    }
    // 只统计事件行：缺少 eventId / skill 的 JSON 行不属于事件数据
    if (!isPlainObject(parsed) || typeof parsed.eventId !== "string" || typeof parsed.skill !== "string") continue
    const state = contractVersionState(parsed.schemaVersion, expected)
    if (state === "legacy") scan.legacy += 1
    else if (state === "newer") scan.newer += 1
    else if (state === "unknown") scan.unknown += 1
  }
  return scan.legacy + scan.newer + scan.unknown > 0 ? scan : null
}

// 构造数据迁移项：有更高版本或无法识别时列人工项，其余可自动重写
function dataItem(
  id: string,
  layers: UpgradeLayer[],
  scans: FileVersionScan[],
  label: string,
): UpgradeItem | null {
  if (scans.length === 0) return null
  const newer = scans.filter((scan) => scan.state === "newer")
  const unknown = scans.filter((scan) => scan.state === "unknown")
  const files = scans.map((scan) => scan.file)
  const versions = [...new Set(scans.map((scan) => scan.version))].join(" / ")
  if (newer.length > 0) {
    return {
      id,
      surface: "data",
      layers,
      action: `跳过 ${label}：检测到高于当前 toolkit 的契约版本（${versions}）`,
      risk: "high",
      files,
      reason: "磁盘数据由更新版本的 toolkit 写出，降级写入会破坏数据",
      status: "manual",
      manualHint: "请先升级 toolkit 后再执行迁移",
    }
  }
  // 同项内混有无法解析或版本缺失的文件时整项判人工：避免部分重写后中断，损坏文件也无从安全修正
  if (unknown.length > 0) {
    return {
      id,
      surface: "data",
      layers,
      action: `跳过 ${label}：${unknown.length} 个文件无法解析或版本缺失`,
      risk: "high",
      files,
      reason: "文件损坏或版本字段缺失，无法安全重写",
      status: "manual",
      manualHint: `${unknown.map((scan) => `${scan.file}（${scan.version}）`).join("、")}；确认后手工修正 schemaVersion，或删除损坏文件后重试`,
    }
  }
  return {
    id,
    surface: "data",
    layers,
    action: `重写 ${label}的契约版本（${versions} → ${DATA_VERSIONS[id]}）`,
    risk: "low",
    files,
    reason: `${label}仍使用旧版契约写法`,
    status: "planned",
  }
}

// 事件项：按记录条数描述，文件多时只报数量
function eventItem(files: LineVersionScan[]): UpgradeItem | null {
  if (files.length === 0) return null
  const newer = files.filter((scan) => scan.newer > 0)
  const legacy = files.filter((scan) => scan.legacy > 0)
  const unknown = files.filter((scan) => scan.unknown > 0)
  if (newer.length > 0) {
    return {
      id: "data:usage-events",
      surface: "data",
      layers: ["global"],
      action: `跳过使用事件：${newer.length} 个文件含高于当前 toolkit 的契约版本`,
      risk: "high",
      files: newer.map((scan) => scan.file),
      reason: "事件文件由更新版本的 toolkit 写出，重写会破坏数据",
      status: "manual",
      manualHint: "请先升级 toolkit 后再执行迁移",
    }
  }
  if (legacy.length === 0) {
    if (unknown.length === 0) return null
    return {
      id: "data:usage-events",
      surface: "data",
      layers: ["global"],
      action: `跳过使用事件：${unknown.length} 个文件含无法识别的契约版本`,
      risk: "high",
      files: unknown.map((scan) => scan.file),
      reason: "事件版本字段缺失或损坏，无法安全重写",
      status: "manual",
      manualHint: "确认文件内容后手工修正 schemaVersion",
    }
  }
  const total = legacy.reduce((sum, scan) => sum + scan.legacy, 0)
  return {
    id: "data:usage-events",
    surface: "data",
    layers: ["global"],
    action: `重写 ${legacy.length} 个事件文件的契约版本（${total} 条记录）`,
    risk: "low",
    files: legacy.map((scan) => scan.file),
    reason: "使用事件仍使用旧版契约写法，严格读取端会丢弃这些记录",
    status: "planned",
    // 同文件里无法识别的行不改写，但要让用户看见，避免迁移后仍是告警却无人处理
    manualHint:
      unknown.length > 0
        ? `${unknown.length} 个文件含无法识别的版本行，未自动重写：${unknown.map((scan) => scan.file).join("、")}`
        : undefined,
  }
}

// 回收站清单：项目面与全局面分开成项，备份会话按实际所属层选择
function trashItem(cwd: string, layer: "global" | "project"): UpgradeItem | null {
  const scans = listTrashManifests(cwd, layer)
    .map((file) => scanJsonFile(file, TRASH_MANIFEST_VERSION))
    .filter((scan): scan is FileVersionScan => scan !== null)
  return dataItem(layer === "global" ? "data:trash-global" : "data:trash-project", [layer], scans, layer === "global" ? "全局回收站清单" : "项目回收站清单")
}

// 检测本机契约数据：只读，不写盘；--skip-events 时跳过事件文件
export function detectDataItems(
  cwd: string,
  layers: readonly UpgradeLayer[],
  options: { skipEvents?: boolean } = {},
): UpgradeItem[] {
  const enabled = new Set(layers)
  const items: UpgradeItem[] = []
  if (enabled.has("global")) {
    const globalState = scanJsonFile(skillsStateFile(), STATE_SCHEMA_VERSION, true)
    const stateItem = dataItem("data:skills-state-global", ["global"], globalState ? [globalState] : [], "全局技能状态")
    if (stateItem) items.push(stateItem)
  }
  if (enabled.has("project") && !isHomeDirectory(cwd)) {
    const projectState = scanJsonFile(projectStateFile(findProjectRoot(cwd)), STATE_SCHEMA_VERSION, true)
    const stateItem = dataItem("data:skills-state-project", ["project"], projectState ? [projectState] : [], "项目技能状态")
    if (stateItem) items.push(stateItem)
  }
  if (enabled.has("global")) {
    const paths = usagePaths(resolveUsageDir())
    if (!options.skipEvents) {
      const scans = listEventFiles(paths)
        .map((file) => scanEventFile(file, USAGE_EVENT_VERSION))
        .filter((scan): scan is LineVersionScan => scan !== null)
      const events = eventItem(scans)
      if (events) items.push(events)
    }
    const index = scanJsonFile(paths.indexPath, USAGE_INDEX_VERSION)
    const indexItem = dataItem("data:usage-index", ["global"], index ? [index] : [], "使用索引")
    if (indexItem) items.push(indexItem)
    const queues = listQueueFiles(paths)
      .map((file) => scanJsonFile(file, USAGE_QUEUE_VERSION))
      .filter((scan): scan is FileVersionScan => scan !== null)
    const queueItem = dataItem("data:usage-queue", ["global"], queues, "上报队列")
    if (queueItem) items.push(queueItem)
    const ledger = scanJsonFile(uploadLedgerPath(paths), USAGE_UPLOAD_VERSION)
    const ledgerItem = dataItem("data:usage-ledger", ["global"], ledger ? [ledger] : [], "上传账本")
    if (ledgerItem) items.push(ledgerItem)
  }
  const globalTrash = enabled.has("global") ? trashItem(cwd, "global") : null
  if (globalTrash) items.push(globalTrash)
  const projectTrash = enabled.has("project") && !isHomeDirectory(cwd) ? trashItem(cwd, "project") : null
  if (projectTrash) items.push(projectTrash)
  return items
}

// 重写单个 JSON 文件：版本字段置顶，其余字段原样保留
function rewriteJsonFile(file: string, expected: ContractVersion): void {
  const data = readJsonObject(file)
  if (!data) throw new Error(`无法解析，未改写：${file}`)
  writeFileAtomic(file, `${JSON.stringify({ schemaVersion: expected, ...withoutVersion(data) }, null, 2)}\n`)
}

// 重写事件 JSONL：逐行改版本，损坏行原样保留
function rewriteEventFile(file: string, expected: ContractVersion): boolean {
  const content = readFileSync(file, "utf8")
  const lines = content.split(/\r?\n/)
  let changed = false
  const next = lines.map((line) => {
    const text = line.trim()
    if (!text) return line
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return line
    }
    // 只改旧版本行；更高版本与无法识别的行原样保留，由人工项提示
    if (!isPlainObject(parsed) || contractVersionState(parsed.schemaVersion, expected) !== "legacy") return line
    changed = true
    return JSON.stringify({ schemaVersion: expected, ...withoutVersion(parsed) })
  })
  if (!changed) return false
  writeFileAtomic(file, next.join("\n"))
  return true
}

// 索引迁移：事件已全部为当前版本时按事件重建，否则就地改版本，避免派生数据被清空
function rewriteIndexFile(file: string, expected: ContractVersion): void {
  const paths = usagePaths(dirname(file))
  const eventsCurrent = listEventFiles(paths).every((eventFile) => {
    const scan = scanEventFile(eventFile, USAGE_EVENT_VERSION)
    return scan === null
  })
  if (eventsCurrent) {
    rebuildIndex(paths)
    return
  }
  rewriteJsonFile(file, expected)
}

// 应用数据项：写前先进入备份会话，回滚统一走 upgrade --restore；返回需人工说明
export function applyDataItem(item: UpgradeItem, session: BackupSession): { manual: string[] } {
  const expected = DATA_VERSIONS[item.id]
  if (!expected) return { manual: [`未知的数据迁移项：${item.id}`] }
  session.markData()
  for (const file of item.files) {
    if (!existsSync(file)) continue
    session.capture([file])
    if (item.id === "data:usage-events") {
      rewriteEventFile(file, expected)
    } else if (item.id === "data:usage-index") {
      rewriteIndexFile(file, expected)
    } else {
      rewriteJsonFile(file, expected)
    }
  }
  return { manual: [] }
}
