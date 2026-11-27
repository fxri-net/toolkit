// 测试临时目录残留清扫：只扫系统临时目录、只删目录，按前缀白名单与年龄门槛判定，避开并发运行与生产短命目录
import { readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

// 默认前缀：fxts-tk- 为测试沙箱（C-57），其余为本仓历史前缀与生产短命目录
export const DEFAULT_PREFIXES = ["fxts-tk-", "fxri-", "tk-", "toolkit-"]
// 默认年龄门槛：6 小时，足以避开并发运行中的测试
export const DEFAULT_MAX_AGE_MINUTES = 6 * 60

/**
 * 列出符合前缀白名单的临时目录。
 * @param {object} [options] 选项
 * @param {string[]} [options.prefixes] 前缀白名单
 * @param {string} [options.baseDir] 扫描根，默认系统临时目录
 * @return {Array<{name: string, path: string, mtimeMs: number}>} 目录名、绝对路径与修改时间
 */
export function listTempDirs(options = {}) {
  const prefixes = options.prefixes ?? DEFAULT_PREFIXES
  const base = options.baseDir ?? tmpdir()
  const found = []
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (!prefixes.some((prefix) => entry.name.startsWith(prefix))) continue
    const path = join(base, entry.name)
    try {
      found.push({ name: entry.name, path, mtimeMs: statSync(path).mtimeMs })
    } catch {
      // 并发删除或权限不足的目录直接跳过
    }
  }
  return found
}

// 递归求目录字节数：失败按 0 计，只用于打印释放空间
function dirSize(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    try {
      total += entry.isDirectory() ? dirSize(path) : statSync(path).size
    } catch {
      // 单个条目不可读时忽略
    }
  }
  return total
}

/**
 * 清扫超过年龄门槛的临时目录。
 * @param {object} [options] 选项
 * @param {string[]} [options.prefixes] 前缀白名单
 * @param {string} [options.baseDir] 扫描根
 * @param {number} [options.maxAgeMinutes] 年龄门槛（分钟）
 * @param {boolean} [options.dryRun] 只列出不删除
 * @return {{removed: Array<{name: string, path: string, mtimeMs: number}>, failed: number, bytes: number}} 结果
 */
export function sweepTempDirs(options = {}) {
  const cutoff = Date.now() - (options.maxAgeMinutes ?? DEFAULT_MAX_AGE_MINUTES) * 60_000
  const removed = []
  let failed = 0
  let bytes = 0
  for (const dir of listTempDirs(options)) {
    if (dir.mtimeMs > cutoff) continue
    const size = dirSize(dir.path)
    if (!options.dryRun) {
      try {
        rmSync(dir.path, { recursive: true, force: true })
      } catch {
        failed += 1
        continue
      }
    }
    removed.push(dir)
    bytes += size
  }
  return { removed, failed, bytes }
}

// 参数解析：未知参数与非法数值直接报错，不静默回落
function parseArgs(argv) {
  const options = { dryRun: false, maxAgeMinutes: DEFAULT_MAX_AGE_MINUTES, prefixes: DEFAULT_PREFIXES }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--dry-run") {
      options.dryRun = true
    } else if (arg === "--older-than") {
      const value = Number(argv[++i])
      if (!Number.isFinite(value) || value < 0) throw new Error(`--older-than 需要非负分钟数，收到「${argv[i] ?? ""}」`)
      options.maxAgeMinutes = value
    } else if (arg === "--prefix") {
      const value = argv[++i] ?? ""
      const prefixes = value.split(",").map((item) => item.trim()).filter(Boolean)
      if (prefixes.length === 0) throw new Error("--prefix 需要逗号分隔的前缀，收到空值")
      options.prefixes = prefixes
    } else {
      throw new Error(`未知参数「${arg}」；可用：--dry-run / --older-than <分钟> / --prefix <a,b>`)
    }
  }
  return options
}

// 直接执行时输出结果；作为模块被 verify.mjs 导入时不进入
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = sweepTempDirs(options)
    const megabytes = (result.bytes / 1024 / 1024).toFixed(1)
    const action = options.dryRun ? "将删除" : "已删除"
    console.log(
      `${action} ${result.removed.length} 个临时目录（约 ${megabytes} MB，年龄门槛 ${options.maxAgeMinutes} 分钟，前缀 ${options.prefixes.join(" / ")}）`,
    )
    if (result.failed > 0) console.warn(`⚠️ ${result.failed} 个目录删除失败，下次运行会重试`)
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
