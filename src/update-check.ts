// 升级检查：CLI 命令执行末尾异步查询 npm registry 最新版本，落后时输出一行升级提示
// 设计原则：不阻塞主流程、任何失败（离线/内网/超时）静默忽略、默认开启且可关闭
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fetchLatestVersion, versionGt } from "./version"
import { loadToolkitConfig } from "./config"
import { writeFileAtomic } from "./write-atomic"

// 缓存有效期：24 小时内不重复请求 registry
const CACHE_TTL = 24 * 60 * 60 * 1000
// 环境变量名：设为任意「真值」即关闭检查（CI/离线环境可显式关闭）
export const UPDATE_CHECK_ENV = "FX_NO_UPDATE_CHECK"

// tmp 缓存文件路径：{tmpdir}/.toolkit-update-check.json（按用户级缓存，跨项目共享）
function cacheFile(): string {
  return join(tmpdir(), ".toolkit-update-check.json")
}

// 读取有效缓存：未过期返回 { latest }，过期则清理缓存文件并返回 null
function readCache(): { latest: string } | null {
  const file = cacheFile()
  try {
    if (!existsSync(file)) return null
    const data = JSON.parse(readFileSync(file, "utf8")) as { ts?: unknown; latest?: unknown }
    const ts = typeof data.ts === "number" ? data.ts : 0
    const latest = typeof data.latest === "string" ? data.latest : ""
    if (!latest) return null
    if (Date.now() - ts >= CACHE_TTL) {
      // 缓存过期：删除文件让下次重新请求
      rmSync(file, { force: true })
      return null
    }
    return { latest }
  } catch {
    // 缓存损坏：按无缓存处理，不阻塞主流程
    return null
  }
}

// 写入缓存：失败静默（只读文件系统等场景不影响主流程）
function writeCache(latest: string): void {
  try {
    const file = cacheFile()
    mkdirSync(tmpdir(), { recursive: true })
    writeFileAtomic(file, JSON.stringify({ ts: Date.now(), latest }))
  } catch {
    // 缓存写入失败忽略
  }
}

// 关闭判定：FX_NO_UPDATE_CHECK 环境变量为真值，或配置文件 updateCheck.enabled === false
function isDisabled(): boolean {
  const v = process.env[UPDATE_CHECK_ENV]
  if (v !== undefined && v !== "") {
    // 与 soft-switch 同口径：0/false/off/no 视为「未关闭」，其余视为关闭
    return !["0", "false", "off", "no"].includes(v.trim().toLowerCase())
  }
  const section = loadToolkitConfig()?.updateCheck
  if (section && typeof section === "object") {
    // 配置节为宽松 Record：断言出可选 enabled 字段后再比较
    return (section as { enabled?: unknown }).enabled === false
  }
  return false
}

// 发起升级检查：完成或失败均不抛错、不影响退出码；CLI 侧用 void 调用（fire-and-forget），测试侧 await 断言
export async function startUpdateCheck(currentVersion: string): Promise<void> {
  if (isDisabled()) return
  const cached = readCache()
  // 缓存窗口内不发起请求；已有缓存且不落后时也无需提示
  const latest = cached?.latest
  if (latest) {
    if (versionGt(latest, currentVersion)) notify(latest, currentVersion)
    return
  }
  const fetched = await fetchLatestVersion().catch(() => null)
  if (!fetched) return
  writeCache(fetched)
  if (versionGt(fetched, currentVersion)) notify(fetched, currentVersion)
}

// 输出一行升级提示（异步回调中执行，可能与后续输出交错但间隔极短，不影响可读性）
function notify(latest: string, current: string): void {
  console.log(
    `⬆️ 发现新版本 ${latest}（当前 ${current}）：pnpm add -g @fxri/toolkit 升级后请开新会话加载最新 skills 规则`,
  )
}
