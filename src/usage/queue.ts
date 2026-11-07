// 上报队列：record 只入队，worker 异步消费；文件按批次一份，处理完即删
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { writeFileAtomic } from "../write-atomic"
import type { UsagePaths } from "./store"

// 队列条目：技能数组保留重复与顺序，按出现次数计数
export interface UsageQueueEntry {
  schemaVersion: 1
  batchId: string
  sessionId: string
  agentHint: string
  cwd: string
  occurredAt: string
  skills: string[]
}

// 队列目录：与事件、状态同根，随 --dir 一起迁移
export function queueDir(paths: UsagePaths): string {
  return join(paths.stateDir, "queue")
}

// 入队：写入成功后由调用方派发 worker
export function enqueueRecord(paths: UsagePaths, entry: UsageQueueEntry): void {
  const dir = queueDir(paths)
  mkdirSync(dir, { recursive: true })
  writeFileAtomic(join(dir, `${entry.batchId}.json`), `${JSON.stringify(entry, null, 2)}\n`)
}

// 队列文件列表：按文件名升序（batchId 带时间戳，天然按时间排）
export function listQueueFiles(paths: UsagePaths): string[] {
  const dir = queueDir(paths)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(dir, name))
}

// 读取队列条目：损坏条目返回 null，由调用方丢弃，避免卡住队列
export function readQueueEntry(file: string): UsageQueueEntry | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
    if (typeof parsed !== "object" || parsed === null) return null
    const entry = parsed as Partial<UsageQueueEntry>
    if (entry.schemaVersion !== 1 || typeof entry.batchId !== "string") return null
    if (typeof entry.sessionId !== "string" || typeof entry.occurredAt !== "string") return null
    if (!Array.isArray(entry.skills)) return null
    if (!entry.skills.every((skill) => typeof skill === "string" && skill.trim() !== "")) return null
    return {
      schemaVersion: 1,
      batchId: entry.batchId,
      sessionId: entry.sessionId,
      agentHint: typeof entry.agentHint === "string" ? entry.agentHint : "unknown",
      cwd: typeof entry.cwd === "string" ? entry.cwd : "",
      occurredAt: entry.occurredAt,
      skills: entry.skills,
    }
  } catch {
    return null
  }
}

// 删除已处理条目
export function removeQueueFile(file: string): void {
  try {
    unlinkSync(file)
  } catch {
    // 已被其它 worker 处理掉，忽略
  }
}

// 待处理条数：info 展示积压用
export function queueCount(paths: UsagePaths): number {
  return listQueueFiles(paths).length
}
