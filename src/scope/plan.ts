// 作用域向导的纯计划：目录扫描与 activation 段合并，便于单测
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { ActivationMode } from "./types"

// 扫描时跳过的目录：避免把依赖与产物当仓库
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git", ".turbo", ".next"])

export interface RepositoryEntry {
  name: string
  path: string
}

// 扫描父目录一层：以 .git / package.json / .tasks 任一存在判定为仓库，结果按名称排序
export function scanRepositories(parent: string, limit = 500): RepositoryEntry[] {
  const entries = readdirSync(parent, { withFileTypes: true })
  const repos: RepositoryEntry[] = []
  for (const entry of entries) {
    if (repos.length >= limit) break
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue
    const dir = join(parent, entry.name)
    if (existsSync(join(dir, ".git")) || existsSync(join(dir, "package.json")) || existsSync(join(dir, ".tasks"))) {
      repos.push({ name: entry.name, path: dir })
    }
  }
  return repos.sort((left, right) => left.name.localeCompare(right.name))
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
