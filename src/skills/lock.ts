// 技能操作锁：安装 / 卸载时防止多进程同时改写状态与产物
// 全局锁 ~/.agents/.toolkit-skills.lock、项目锁 <repo>/.toolkit/skills.lock；5 分钟过期，记录 pid / host / startedAt
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { hostname } from "node:os"
import { dirname, join } from "node:path"

// 锁文件名：与上游安装器的锁文件分开命名
export const SKILLS_LOCK_FILE = ".toolkit-skills.lock"
// 项目锁文件名（位于 .toolkit 目录）
export const PROJECT_SKILLS_LOCK_FILE = "skills.lock"
// 过期阈值：超过 5 分钟视为陈旧锁，可接管
export const SKILLS_LOCK_STALE_MS = 5 * 60 * 1000

// 锁内容
interface LockInfo {
  pid: number
  host: string
  startedAt: string
}

// 全局锁路径：~/.agents/.toolkit-skills.lock
export function skillsLockFile(home: string): string {
  return join(home, ".agents", SKILLS_LOCK_FILE)
}

// 项目锁路径：<repo>/.toolkit/skills.lock
export function projectSkillsLockFile(root: string): string {
  return join(root, ".toolkit", PROJECT_SKILLS_LOCK_FILE)
}

// 读取锁文件：不存在或内容非法返回 null
function readLock(file: string): LockInfo | null {
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<LockInfo>
    if (typeof parsed.pid !== "number" || typeof parsed.host !== "string" || typeof parsed.startedAt !== "string") return null
    return { pid: parsed.pid, host: parsed.host, startedAt: parsed.startedAt }
  } catch {
    return null
  }
}

// 锁是否陈旧：开始时间不可解析 / 超过阈值 / 同机进程已不存在
function isStale(info: LockInfo): boolean {
  const started = Date.parse(info.startedAt)
  if (!Number.isFinite(started)) return true
  if (Date.now() - started > SKILLS_LOCK_STALE_MS) return true
  if (info.host === hostname()) {
    try {
      process.kill(info.pid, 0)
      return false
    } catch {
      return true
    }
  }
  return false
}

// 释放锁：只删除自己持有的锁，避免接管陈旧锁后误删他人的新锁
function releaseLock(file: string, info: LockInfo): void {
  const current = readLock(file)
  if (current && current.pid === info.pid && current.host === info.host && current.startedAt === info.startedAt) {
    rmSync(file, { force: true })
  }
}

// 获取锁：返回释放函数；被占用且未过期时抛错，陈旧锁接管后重试一次
export function acquireSkillsLock(file: string): () => void {
  mkdirSync(dirname(file), { recursive: true })
  const info: LockInfo = { pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`, { flag: "wx" })
      return () => releaseLock(file, info)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e
      const existing = readLock(file)
      if (existing && !isStale(existing)) {
        throw new Error(`技能操作锁被占用：${existing.host} pid ${existing.pid}（始于 ${existing.startedAt}），请稍后重试`, { cause: e })
      }
      // 陈旧或无法解析的锁：清理后重试一次
      rmSync(file, { force: true })
    }
  }
  throw new Error(`无法获取技能操作锁：${file}`)
}
