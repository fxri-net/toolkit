// 归档 / 归一化 / 导入共用的排他锁：锁文件记录持有进程的 pid 与启动时间，
// 接管前校验持有进程是否仍存活，避免固定陈旧阈值把仍在运行的长任务误判为残留
import { openSync, writeSync, readFileSync, unlinkSync, statSync, closeSync } from "node:fs"
import { join } from "node:path"

// 兜底陈旧阈值：仅在无法识别锁文件持有者（旧格式残留或内容损坏）时按时间判定（10 分钟）
const STALE_MS = 10 * 60 * 1000

// 锁文件内容：持有进程的 pid 与其启动时间（毫秒时间戳）
interface LockOwner {
  /** 持有进程 id */
  pid: number
  /** 持有进程启动时间（毫秒） */
  startedAt: number
}

// 本进程身份：启动时间由 uptime 反推，模块加载时固定一次，
// 保证同进程内 acquire 与 release 比较的是同一身份（两次计算会因时钟抖动差毫秒）
const SELF_OWNER: LockOwner = { pid: process.pid, startedAt: Math.round(Date.now() - process.uptime() * 1000) }

// 读取锁文件记录的持有者；文件不存在或内容非法（旧格式残留）时返回 null
function readOwner(lockPath: string): LockOwner | null {
  try {
    const raw = JSON.parse(readFileSync(lockPath, "utf8")) as Partial<LockOwner>
    if (typeof raw.pid === "number" && typeof raw.startedAt === "number") return { pid: raw.pid, startedAt: raw.startedAt }
  } catch {
    // 解析失败：交由调用方按时间阈值判定是否陈旧
  }
  return null
}

// 判定进程是否存活：EPERM 表示进程存在但无权限发信号，同样视为存活
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"
  }
}

// 判定锁是否可接管：能识别持有者则以其进程存活为准，识别不了再退回时间阈值
function isStale(lockPath: string, owner: LockOwner | null, staleMs: number): boolean {
  if (owner) return !isProcessAlive(owner.pid)
  try {
    return Date.now() - statSync(lockPath).mtimeMs > staleMs
  } catch {
    // 锁文件刚被其他进程释放，视为可接管
    return true
  }
}

// 获取排他锁，成功返回 fd；被存活进程占用或重试仍失败返回 null
// staleMs 为兜底时间阈值（默认 10 分钟），仅测试或旧格式残留时生效
export function acquireArchiveLock(tasksDir: string, staleMs = STALE_MS): number | null {
  const lockPath = join(tasksDir, ".archive.lock")
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, "wx")
      writeSync(fd, JSON.stringify(SELF_OWNER))
      return fd
    } catch {
      if (!isStale(lockPath, readOwner(lockPath), staleMs)) return null
      try {
        // 陈旧锁：清理后进入下一轮重试
        unlinkSync(lockPath)
      } catch {
        // 锁文件已被其他进程释放，直接重试
      }
    }
  }
  return null
}

// 释放排他锁：仅当锁文件仍由本进程持有时才删除（close + unlink），避免误删接管者新建的锁
export function releaseArchiveLock(tasksDir: string, fd: number): void {
  closeSync(fd)
  const lockPath = join(tasksDir, ".archive.lock")
  const owner = readOwner(lockPath)
  if (!owner || owner.pid !== SELF_OWNER.pid || owner.startedAt !== SELF_OWNER.startedAt) return
  try {
    unlinkSync(lockPath)
  } catch {
    // 锁文件已被清理，忽略
  }
}
