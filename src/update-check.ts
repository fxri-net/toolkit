// 升级检查：父进程同步读缓存并提示，缓存过期时派生分离子进程联网刷新（参考 update-notifier 的成熟设计）
// 设计原则：父进程零网络、不阻塞进程退出；任何失败（离线/内网/超时）静默忽略、失败也记负缓存；默认开启且可关闭
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawn } from "node:child_process"
import { fetchLatestVersion, versionGt } from "./version"
import { loadToolkitConfig } from "./config"
import { writeFileAtomic } from "./write-atomic"

// 成功缓存有效期：24 小时内不重复请求 registry
const CACHE_TTL = 24 * 60 * 60 * 1000
// 负缓存有效期：查询失败后 1 小时内不重试，避免离线环境下每条命令都联网等待
const FAIL_TTL = 60 * 60 * 1000
// 环境变量名：设为任意「真值」即关闭检查（CI/离线环境可显式关闭）
export const UPDATE_CHECK_ENV = "FX_NO_UPDATE_CHECK"
// 内部 worker 参数：子进程以 `cli.js <该参数>` 启动，只刷新缓存、不执行用户命令
export const UPDATE_CHECK_WORKER_ARG = "--fxri-update-check-worker"

// 缓存记录：ok 标记本次查询是否成功（失败时无版本号，仅用于抑制短期重复请求）
type UpdateCache = { ts: number; ok: boolean; latest: string }

// tmp 缓存文件路径：{tmpdir}/.toolkit-update-check.json（按用户级缓存，跨项目共享）
function cacheFile(): string {
  return join(tmpdir(), ".toolkit-update-check.json")
}

// 读取有效缓存：未过期返回记录，过期则清理缓存文件并返回 null（null 表示需要后台刷新）
function readCache(): UpdateCache | null {
  const file = cacheFile()
  try {
    if (!existsSync(file)) return null
    // 与 config.ts / skills.ts 同口径：先剥 BOM 再解析，避免带 BOM 缓存被误判为损坏
    const data = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as {
      ts?: unknown
      ok?: unknown
      latest?: unknown
    }
    const ts = typeof data.ts === "number" ? data.ts : 0
    const latest = typeof data.latest === "string" ? data.latest : ""
    // 兼容旧版缓存：历史实现仅在成功时写缓存，缺 ok 字段时按成功态处理
    const ok = data.ok === undefined ? true : data.ok === true
    const ttl = ok ? CACHE_TTL : FAIL_TTL
    if (Date.now() - ts >= ttl) {
      // 缓存过期：删除文件让下次重新请求
      rmSync(file, { force: true })
      return null
    }
    // 成功缓存必须有版本号，缺失视为损坏按无缓存处理
    if (ok && !latest) return null
    return { ts, ok, latest }
  } catch {
    // 缓存损坏：按无缓存处理，不阻塞主流程
    return null
  }
}

// 写入缓存：失败静默（只读文件系统等场景不影响主流程）
function writeCache(ok: boolean, latest: string): void {
  try {
    const file = cacheFile()
    mkdirSync(tmpdir(), { recursive: true })
    writeFileAtomic(file, JSON.stringify({ ts: Date.now(), ok, latest }))
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

// 发起升级检查（父进程入口，同步、零网络）：命中缓存则提示，缓存不新鲜则派生后台 worker 后立即返回
// 提示延后一次命令生效：首次运行只静默刷新缓存，下一次命令才从缓存提示（与 update-notifier 语义一致）
export function startUpdateCheck(currentVersion: string): void {
  if (isDisabled()) return
  const cached = readCache()
  if (cached) {
    // 仅成功缓存携带版本号，负缓存只用于抑制重复请求
    if (cached.ok && versionGt(cached.latest, currentVersion)) notify(cached.latest, currentVersion)
    return
  }
  spawnUpdateCheckWorker()
}

// 派生后台 worker：detached + stdio ignore + unref，父进程照常退出、子进程独立完成刷新
function spawnUpdateCheckWorker(): void {
  const entry = process.argv[1]
  if (!entry) return
  try {
    const child = spawn(process.execPath, [entry, UPDATE_CHECK_WORKER_ARG], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    })
    child.unref()
  } catch {
    // 派生失败忽略：升级检查不阻塞主流程
  }
}

// 后台 worker：联网拉取最新版本并写缓存；失败也写负缓存，供 CLI 侧在独立子进程中调用
export async function runUpdateCheckWorker(): Promise<void> {
  const fetched = await fetchLatestVersion().catch(() => null)
  writeCache(fetched !== null, fetched ?? "")
}

// 输出一行升级提示到 stderr：stdout 为机器可读输出（--format json）的专用通道，不得混入诊断信息
function notify(latest: string, current: string): void {
  console.error(
    `⬆️ 发现新版本 ${latest}（当前 ${current}）：pnpm add -g @fxri/toolkit 升级后请开新会话加载最新 skills 规则；` +
      "本地技能可用 toolkit skills status 检查（软链自动跟随，副本形式需重跑 toolkit skills install）",
  )
}
