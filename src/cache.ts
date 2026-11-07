// 用户级缓存目录：只放可安全删除的派生数据；状态账本、使用数据与锁文件不在此目录
import { copyFileSync, cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { getHomeDir } from "./config"

// 缓存根目录：~/.toolkit/cache（测试经 getHomeDir 注入隔离）
export function userCacheDir(): string {
  return join(getHomeDir(), ".toolkit", "cache")
}

// 缓存内路径：按段拼接，避免调用方各自拼字符串
export function cachePath(...segments: string[]): string {
  return join(userCacheDir(), ...segments)
}

// 惰性迁移：新路径优先；旧路径存在时尝试搬移，失败则继续使用旧路径，保证缓存不丢
// rename 优先（同卷原子）；跨卷或权限不允许时回退复制后删除；两者都失败时保留旧路径
export function resolveCacheEntry(nextRel: string, legacyAbs: string, kind: "file" | "dir" = "file"): string {
  const next = cachePath(nextRel)
  if (existsSync(next)) return next
  if (!existsSync(legacyAbs)) return next
  try {
    mkdirSync(dirname(next), { recursive: true })
    try {
      renameSync(legacyAbs, next)
    } catch {
      if (kind === "dir") cpSync(legacyAbs, next, { recursive: true })
      else copyFileSync(legacyAbs, next)
      rmSync(legacyAbs, { recursive: kind === "dir", force: true })
    }
    return next
  } catch {
    // 并发迁移时另一进程可能已完成：新路径已存在即用它，否则继续用旧路径
    return existsSync(next) ? next : legacyAbs
  }
}
