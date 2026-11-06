// 本地事件存储：JSONL 追加写 + JSON 索引去重；索引可重建，不作为唯一真源
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { writeFileAtomic } from "../write-atomic"
import type {
  AppendResult,
  SkillUsageEvent,
  TelemetryConfig,
  TelemetryIndex,
  TelemetryRotation,
} from "./types"

// 存储路径集合：事件、会话状态与索引分目录存放
export interface TelemetryPaths {
  root: string
  eventsDir: string
  stateDir: string
  sessionsDir: string
  indexPath: string
}

// 计算存储路径：调用方已解析出根目录
export function telemetryPaths(root: string): TelemetryPaths {
  return {
    root,
    eventsDir: join(root, "events"),
    stateDir: join(root, "state"),
    sessionsDir: join(root, "state", "sessions"),
    indexPath: join(root, "index.json"),
  }
}

// 确保目录存在：幂等创建
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

// 本地月份串：用于按月轮转
function monthKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${date.getFullYear()}-${month}`
}

// 事件文件名：按月 / 不轮转 / 按大小三种策略
export function eventFileName(date: Date, rotation: TelemetryRotation, paths: TelemetryPaths, maxFileBytes: number): string {
  if (rotation === "none") return "events.jsonl"
  const base = `${monthKey(date)}.jsonl`
  if (rotation === "monthly") return base
  // 按大小：从当月基础文件开始，超过上限后依次使用 .1 / .2 ……
  const candidates = [base]
  for (let index = 1; index < 100; index += 1) candidates.push(`${monthKey(date)}.${index}.jsonl`)
  for (const name of candidates) {
    const file = join(paths.eventsDir, name)
    if (!existsSync(file)) return name
    try {
      if (statSync(file).size < maxFileBytes) return name
    } catch {
      return name
    }
  }
  return candidates[candidates.length - 1]!
}

// 事件文件列表：只认 .jsonl，按文件名升序
export function listEventFiles(paths: TelemetryPaths): string[] {
  if (!existsSync(paths.eventsDir)) return []
  return readdirSync(paths.eventsDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((name) => join(paths.eventsDir, name))
}

// 解析单行事件：损坏行跳过，不影响其余记录
function parseEventLine(line: string): SkillUsageEvent | null {
  const text = line.trim()
  if (!text) return null
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== "object" || parsed === null) return null
    const event = parsed as Partial<SkillUsageEvent>
    if (event.schemaVersion !== 1 || typeof event.eventId !== "string" || typeof event.skill !== "string") return null
    return event as SkillUsageEvent
  } catch {
    return null
  }
}

// 读取全部事件：按文件顺序拼接，重复事件由调用方按 eventId 去重
export function readAllEvents(paths: TelemetryPaths): SkillUsageEvent[] {
  const events: SkillUsageEvent[] = []
  for (const file of listEventFiles(paths)) {
    let content: string
    try {
      content = readFileSync(file, "utf8")
    } catch {
      continue
    }
    for (const line of content.split(/\r?\n/)) {
      const event = parseEventLine(line)
      if (event) events.push(event)
    }
  }
  return events
}

// 空索引：文件不存在或损坏时使用
function emptyIndex(): TelemetryIndex {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), eventIds: [] }
}

// 读取索引：损坏时返回空索引，由 doctor 提示重建
export function readIndex(paths: TelemetryPaths): TelemetryIndex {
  if (!existsSync(paths.indexPath)) return emptyIndex()
  try {
    const parsed: unknown = JSON.parse(readFileSync(paths.indexPath, "utf8"))
    if (typeof parsed !== "object" || parsed === null) return emptyIndex()
    const index = parsed as Partial<TelemetryIndex>
    if (index.schemaVersion !== 1 || !Array.isArray(index.eventIds)) return emptyIndex()
    return {
      schemaVersion: 1,
      updatedAt: typeof index.updatedAt === "string" ? index.updatedAt : new Date().toISOString(),
      eventIds: index.eventIds.filter((id): id is string => typeof id === "string"),
    }
  } catch {
    return emptyIndex()
  }
}

// 写入索引：原子写，避免半截文件
export function writeIndex(paths: TelemetryPaths, index: TelemetryIndex): void {
  ensureDir(paths.root)
  writeFileAtomic(paths.indexPath, `${JSON.stringify(index, null, 2)}\n`)
}

// 追加事件：先查索引去重，再写 JSONL，最后更新索引
export function appendEvent(paths: TelemetryPaths, event: SkillUsageEvent, config: TelemetryConfig): AppendResult {
  const index = readIndex(paths)
  const known = new Set(index.eventIds)
  if (known.has(event.eventId)) return { written: false, reason: "duplicate" }
  ensureDir(paths.eventsDir)
  const fileName = eventFileName(new Date(event.occurredAt), config.storage.rotation, paths, config.storage.maxFileBytes)
  appendFileSync(join(paths.eventsDir, fileName), `${JSON.stringify(event)}\n`, "utf8")
  index.eventIds.push(event.eventId)
  index.updatedAt = new Date().toISOString()
  writeIndex(paths, index)
  return { written: true }
}

// 重建索引：按事件出现顺序保留每个 eventId 的首条
export function rebuildIndex(paths: TelemetryPaths): number {
  const seen = new Set<string>()
  const eventIds: string[] = []
  for (const event of readAllEvents(paths)) {
    if (seen.has(event.eventId)) continue
    seen.add(event.eventId)
    eventIds.push(event.eventId)
  }
  writeIndex(paths, { schemaVersion: 1, updatedAt: new Date().toISOString(), eventIds })
  return eventIds.length
}

// 去重存储：每个事件文件内按 eventId 保留首条，删除重复行
export function dedupeStore(paths: TelemetryPaths): number {
  let removed = 0
  const seen = new Set<string>()
  for (const file of listEventFiles(paths)) {
    const kept: string[] = []
    let content: string
    try {
      content = readFileSync(file, "utf8")
    } catch {
      continue
    }
    for (const line of content.split(/\r?\n/)) {
      const event = parseEventLine(line)
      if (!event) {
        if (line.trim()) kept.push(line)
        continue
      }
      if (seen.has(event.eventId)) {
        removed += 1
        continue
      }
      seen.add(event.eventId)
      kept.push(JSON.stringify(event))
    }
    writeFileSync(file, kept.length > 0 ? `${kept.join("\n")}\n` : "", "utf8")
  }
  writeIndex(paths, { schemaVersion: 1, updatedAt: new Date().toISOString(), eventIds: [...seen] })
  return removed
}

// 清理事件：按保留期或全部删除；返回删除条数
export function purgeEvents(paths: TelemetryPaths, options: { olderThanDays?: number; all?: boolean }): number {
  if (options.all) {
    let removed = 0
    for (const file of listEventFiles(paths)) {
      const content = readFileSync(file, "utf8")
      removed += content.split(/\r?\n/).filter((line) => parseEventLine(line) !== null).length
      rmSync(file, { force: true })
    }
    writeIndex(paths, emptyIndex())
    return removed
  }
  if (!options.olderThanDays || options.olderThanDays <= 0) return 0
  const cutoff = Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000
  let removed = 0
  const keptIds: string[] = []
  for (const file of listEventFiles(paths)) {
    const kept: string[] = []
    let content: string
    try {
      content = readFileSync(file, "utf8")
    } catch {
      continue
    }
    for (const line of content.split(/\r?\n/)) {
      const event = parseEventLine(line)
      if (!event) {
        if (line.trim()) kept.push(line)
        continue
      }
      const time = new Date(event.occurredAt).getTime()
      if (Number.isFinite(time) && time < cutoff) {
        removed += 1
        continue
      }
      kept.push(JSON.stringify(event))
      keptIds.push(event.eventId)
    }
    writeFileSync(file, kept.length > 0 ? `${kept.join("\n")}\n` : "", "utf8")
  }
  writeIndex(paths, { schemaVersion: 1, updatedAt: new Date().toISOString(), eventIds: keptIds })
  return removed
}
