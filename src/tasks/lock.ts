// 归档 / 归一化共用的排他锁：支持陈旧锁自动接管（上次进程异常退出残留时自动清理重试）
import { openSync, unlinkSync, statSync, closeSync } from "node:fs"
import { join } from "node:path"

// 陈旧阈值：锁文件存在超过该时长即视为上次进程残留（10 分钟），可自动清理
const STALE_MS = 10 * 60 * 1000

// 获取排他锁，成功返回 fd；被并发占用（非陈旧）或重试仍失败返回 null
// staleMs 仅测试注入用，默认 10 分钟
export function acquireArchiveLock(tasksDir: string, staleMs = STALE_MS): number | null {
  const lockPath = join(tasksDir, ".archive.lock")
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return openSync(lockPath, "wx")
    } catch {
      try {
        const st = statSync(lockPath)
        if (Date.now() - st.mtimeMs <= staleMs) return null
        // 陈旧锁：清理后进入下一轮重试
        unlinkSync(lockPath)
      } catch {
        // 锁文件刚被其他进程释放，视为被占用
        return null
      }
    }
  }
  return null
}

// 释放排他锁（close + unlink，失败忽略）
export function releaseArchiveLock(tasksDir: string, fd: number): void {
  closeSync(fd)
  try {
    unlinkSync(join(tasksDir, ".archive.lock"))
  } catch {
    // 锁文件已被清理，忽略
  }
}
