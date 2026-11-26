// 作用域向导的纯计划：目录扫描与 activation 段合并，便于单测
import { existsSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { normalizePathForCompare } from "../git-ignore"
import { isProjectRoot } from "./paths"
import type { ActivationMode } from "./types"

// 扫描时跳过的目录：避免把依赖与产物当仓库
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".turbo",
  ".next",
  "vendor",
  "bower_components",
  "jspm_packages",
  "Pods",
  ".venv",
  "venv",
  "target",
  "build",
  "out",
  ".pnpm-store",
  ".cache",
])
// 非 git 项目的判定补充：存在任一 lock 才算真实项目，避免脚手架与 monorepo 子包误判
const LOCK_FILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]

export type RepositoryKind = "git" | "project" | "npm"

export interface RepositoryEntry {
  name: string
  path: string
  // 识别依据：git 仓库 / 含 .tasks 的项目 / 带 lock 的非 git 项目
  kind?: RepositoryKind
}

// 扫描结果：仓库列表、跳过明细与截断原因
export interface ScanResult {
  repos: RepositoryEntry[]
  skipped: Array<{ path: string; reason: string }>
  truncated: string | null
  // 因 nested=false 被剪枝的仓库根数量：只计数，不展开内部嵌套
  nestedPruned: number
}

export interface ScanOptions {
  // 安全上限：深度、访问目录数、耗时，任一触发即截断
  maxDepth?: number
  maxDirs?: number
  maxMs?: number
  // 默认跳过隐藏目录与已识别仓库内部（嵌套仓库需显式开启）
  hidden?: boolean
  nested?: boolean
  interrupted?: () => boolean
}

// 单目录身份判定：.git 优先，其次项目标志（配置 / 项目产物），最后「package.json + lock」作为非 git Node 项目线索
// `.tasks` 是任务区路径、可配置到项目外，不参与项目身份
function detectRepository(dir: string): RepositoryKind | null {
  if (existsSync(join(dir, ".git"))) return "git"
  if (isProjectRoot(dir)) return "project"
  if (existsSync(join(dir, "package.json")) && LOCK_FILES.some((file) => existsSync(join(dir, file)))) return "npm"
  return null
}

// 扫描父目录一层：以 .git / 项目标志 / package.json 任一存在判定为仓库，结果按名称排序
// 单层扫描沿用宽松口径（package.json 即可），递归扫描仍以 package.json + lock 识别非 git Node 项目
export function scanRepositories(parent: string, limit = 500): RepositoryEntry[] {
  const entries = readdirSync(parent, { withFileTypes: true })
  const repos: RepositoryEntry[] = []
  for (const entry of entries) {
    if (repos.length >= limit) break
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue
    const dir = join(parent, entry.name)
    if (existsSync(join(dir, ".git")) || isProjectRoot(dir) || existsSync(join(dir, "package.json"))) {
      repos.push({ name: entry.name, path: dir })
    }
  }
  return repos.sort((left, right) => left.name.localeCompare(right.name, "en"))
}

// 递归发现仓库：命中 .git 即收录并剪枝，依赖与产物目录永不进入；深度只作安全上限
export function scanRepositoryTree(parent: string, options: ScanOptions = {}): ScanResult {
  const maxDepth = options.maxDepth ?? 8
  const maxDirs = options.maxDirs ?? 5000
  const maxMs = options.maxMs ?? 3000
  const started = Date.now()
  const repos: RepositoryEntry[] = []
  const skipped: ScanResult["skipped"] = []
  const seen = new Set<string>()
  let visited = 0
  let truncated: string | null = null
  let nestedPruned = 0

  // 上限判定：命中即停止后续遍历，并记录首个原因
  const limitHit = (): boolean => {
    if (truncated) return true
    if (options.interrupted?.()) truncated = "扫描已中断"
    else if (visited >= maxDirs) truncated = `目录数超过上限 ${maxDirs}`
    else if (Date.now() - started > maxMs) truncated = `耗时超过上限 ${maxMs}ms`
    return truncated !== null
  }

  const walk = (dir: string, depth: number): void => {
    if (limitHit()) return
    if (depth > maxDepth) {
      truncated = `深度超过上限 ${maxDepth}`
      return
    }
    visited += 1
    const kind = detectRepository(dir)
    if (kind) {
      // 按字符串口径去重：同一路径的不同写法只收录一次，不解析符号链接
      const key = normalizePathForCompare(dir)
      if (!seen.has(key)) {
        seen.add(key)
        repos.push({ name: basename(dir), path: dir, kind })
      }
      // 仓库内部不再下探：node_modules / vendor 等依赖因此永远不会被当成项目
      if (kind === "git" && !options.nested) {
        nestedPruned += 1
        return
      }
    }
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      skipped.push({ path: dir, reason: `无法读取：${(error as Error).message}` })
      return
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      if (limitHit()) return
      const name = entry.name
      if (entry.isSymbolicLink()) {
        skipped.push({ path: join(dir, name), reason: "符号链接未跟随" })
        continue
      }
      if (name.startsWith(".")) {
        // .git 是仓库标识本身，不作为目录进入；其余隐藏目录默认跳过
        if (name === ".git") continue
        if (!options.hidden) {
          skipped.push({ path: join(dir, name), reason: "隐藏目录" })
          continue
        }
      }
      if (SKIP_DIRS.has(name)) {
        skipped.push({ path: join(dir, name), reason: "依赖 / 产物目录" })
        continue
      }
      if (!entry.isDirectory()) continue
      walk(join(dir, name), depth + 1)
    }
  }

  walk(parent, 0)
  repos.sort((left, right) => left.name.localeCompare(right.name, "en") || left.path.localeCompare(right.path, "en"))
  return { repos, skipped, truncated, nestedPruned }
}

// 合并 activation 段：只改 mode 与指定数组，保留 markers / gitRemotes 等用户已有字段
export function mergeActivation(
  config: Record<string, unknown>,
  edit: { mode: ActivationMode; include?: string[]; exclude?: string[] },
): Record<string, unknown> {
  const current = config.activation
  const base = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {}
  const next: Record<string, unknown> = { ...base, mode: edit.mode }
  if (edit.include) next.include = dedupe(edit.include)
  if (edit.exclude) next.exclude = dedupe(edit.exclude)
  return { ...config, activation: next }
}

// 去空去重并保持原顺序
export function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}
