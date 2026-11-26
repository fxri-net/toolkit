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
    // 复制失败可能留下半截 next：旧路径仍在时以旧路径为准，并清理半截新路径
    if (existsSync(legacyAbs)) {
      try {
        rmSync(next, { recursive: true, force: true })
      } catch {
        // 清理失败忽略，至少不把半截新路径当成有效缓存
      }
      return legacyAbs
    }
    return existsSync(next) ? next : legacyAbs
  }
}
