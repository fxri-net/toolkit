// 项目内回收站：用户可见删除先移动到本地 trash，由用户决定何时彻底清理
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { getHomeDir } from "../config"
import { findProjectRoot, isHomeDirectory } from "../scope/paths"
import { assertWithinRoot, isSingleSegmentName, rootForPath, safeRemoveArtifact } from "../safe-remove"
import { isInside as isPathInside } from "../skills/source/paths"

export type TrashScope = "project" | "global"
export type TrashScopeChoice = TrashScope | "all"
export type TrashKind = "file" | "dir" | "link"

export interface TrashContext {
  command: string
  scope: TrashScopeChoice
  cwd: string
}

export interface TrashEntry {
  id: string
  dir: string
  root: string
  scope: TrashScope
  createdAt: string
  command: string
  files: number
  bytes: number
  status: TrashManifest["status"]
}

export interface TrashManifestEntry {
  original: string
  stored: string
  kind: TrashKind
  size: number
  linkTarget?: string
}

export interface TrashManifest {
  schemaVersion: 1
  id: string
  createdAt: string
  command: string
  scope: TrashScope
  root: string
  entries: TrashManifestEntry[]
  status: "complete" | "partial"
}

const MANIFEST = "manifest.json"

let activeContext: TrashContext | null = null

export function setTrashContext(context: TrashContext | null): void {
  activeContext = context
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, "0")
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

// 项目根与全局根；home 与项目根相同时只保留全局一份
function rootsFor(cwd: string, scope: TrashScopeChoice): Array<{ scope: TrashScope; root: string }> {
  const project = findProjectRoot(cwd)
  const all: Array<{ scope: TrashScope; root: string }> = [
    { scope: "project", root: join(project, ".toolkit", "trash") },
    { scope: "global", root: join(getHomeDir(), ".toolkit", "trash") },
  ]
  if (scope === "all") return all.filter((item, index, list) => list.findIndex((other) => other.root === item.root) === index)
  return all.filter((item) => item.scope === scope)
}

function trashRootFor(target: string, context: TrashContext): { scope: TrashScope; root: string } {
  if (context.scope !== "all") return rootsFor(context.cwd, context.scope)[0]!
  const project = findProjectRoot(context.cwd)
  const scope: TrashScope = isPathInside(target, project) ? "project" : "global"
  return rootsFor(context.cwd, scope)[0]!
}

function readManifest(dir: string): TrashManifest | null {
  try {
    const data = JSON.parse(readFileSync(join(dir, MANIFEST), "utf8")) as TrashManifest
    return data && data.schemaVersion === 1 && Array.isArray(data.entries) ? data : null
  } catch {
    return null
  }
}

function writeManifest(dir: string, manifest: TrashManifest): void {
  writeFileSync(join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
}

function sizeOf(target: string): number {
  try {
    const stat = lstatSync(target)
    if (stat.isFile()) return stat.size
    if (stat.isDirectory()) return readdirSync(target).reduce((sum, name) => sum + sizeOf(join(target, name)), 0)
  } catch {
    // 读取失败按 0 处理，不阻断卸载
  }
  return 0
}

function moveOne(target: string, stored: string, root: string): TrashManifestEntry {
  const stat = lstatSync(target)
  if (stat.isSymbolicLink()) {
    const linkTarget = readlinkSync(target)
    unlinkSync(target)
    return { original: target, stored: "", kind: "link", size: 0, linkTarget }
  }
  mkdirSync(dirname(stored), { recursive: true })
  try {
    renameSync(target, stored)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "EXDEV") throw error
    cpSync(target, stored, { recursive: stat.isDirectory() })
    safeRemoveArtifact(target, root)
  }
  return { original: target, stored, kind: stat.isDirectory() ? "dir" : "file", size: sizeOf(stored) }
}

// 删除入口：有活动上下文时移动到回收站，否则保持原有永久删除
export function trashAwareRemove(target: string, root: string): void {
  const context = activeContext
  if (!context) {
    safeRemoveArtifact(target, root)
    return
  }
  assertWithinRoot(target, root, "回收")
  const { scope, root: base } = trashRootFor(target, context)
  const id = `${stamp()}-${randomSuffix()}`
  const dir = join(base, id)
  const items = join(dir, "items")
  mkdirSync(items, { recursive: true, mode: 0o700 })
  const manifest: TrashManifest = {
    schemaVersion: 1,
    id,
    createdAt: new Date().toISOString(),
    command: context.command,
    scope,
    root: scope === "project" ? findProjectRoot(context.cwd) : getHomeDir(),
    entries: [],
    status: "complete",
  }
  try {
    const entry = moveOne(target, join(items, "0"), root)
    manifest.entries.push(entry)
  } catch (error) {
    manifest.status = "partial"
    writeManifest(dir, manifest)
    throw error
  }
  writeManifest(dir, manifest)
}

// 列出回收站条目：按时间倒序
export function listTrash(cwd: string, scope: TrashScopeChoice = "all"): TrashEntry[] {
  const out: TrashEntry[] = []
  for (const { scope: itemScope, root } of rootsFor(cwd, scope)) {
    if (!existsSync(root)) continue
    for (const name of readdirSync(root)) {
      if (!isSingleSegmentName(name)) continue
      const dir = join(root, name)
      const manifest = readManifest(dir)
      if (!manifest) continue
      out.push({
        id: manifest.id,
        dir,
        root,
        scope: itemScope,
        createdAt: manifest.createdAt,
        command: manifest.command,
        files: manifest.entries.length,
        bytes: manifest.entries.reduce((sum, entry) => sum + entry.size, 0),
        status: manifest.status,
      })
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export interface TrashRestoreFailure {
  path: string
  message: string
}

export interface TrashRestoreResult {
  id: string
  restored: string[]
  skipped: string[]
  failed: TrashRestoreFailure[]
  removedEntry: boolean
}

// 恢复条目：默认最新；--to 替换目标根，覆盖前先把现有目标再收进回收站
export function restoreTrash(
  cwd: string,
  idOrLatest: string,
  options: { scope?: TrashScopeChoice; overwrite?: boolean; to?: string; dryRun?: boolean } = {},
): TrashRestoreResult {
  const entries = listTrash(cwd, options.scope ?? "all")
  const entry = idOrLatest === "latest" ? entries[0] : entries.find((item) => item.id === idOrLatest)
  if (!entry) throw new Error(`未找到回收站条目：${idOrLatest}`)
  const manifest = readManifest(entry.dir)
  if (!manifest) throw new Error(`回收站清单损坏：${entry.dir}`)
  const result: TrashRestoreResult = { id: entry.id, restored: [], skipped: [], failed: [], removedEntry: false }
  for (const item of manifest.entries) {
    const base = options.to ? resolve(options.to) : manifest.root
    const rel = relative(manifest.root, item.original)
    const target = options.to ? join(base, rel.startsWith("..") ? item.original.split(/[\\/]/).pop()! : rel) : item.original
    if (!rootForPath(target, [base, getHomeDir(), cwd])) {
      console.warn(`⚠️ 跳过越界恢复路径：${target}`)
      result.skipped.push(item.original)
      continue
    }
    if (existsSync(target) && !options.overwrite) {
      result.skipped.push(item.original)
      continue
    }
    const linkTarget = item.kind === "link" && item.linkTarget
      ? (isAbsolute(item.linkTarget) ? item.linkTarget : resolve(dirname(target), item.linkTarget))
      : ""
    if (item.kind === "link" && !item.linkTarget) {
      console.warn(`⚠️ 跳过清单缺少链接目标的条目：${item.original}`)
      result.skipped.push(item.original)
      continue
    }
    if (item.kind === "link" && !existsSync(linkTarget)) {
      console.warn(`⚠️ 跳过悬空链接：${target}（目标不存在：${item.linkTarget}）`)
      result.skipped.push(item.original)
      continue
    }
    if (item.kind !== "link" && !item.stored) {
      console.warn(`⚠️ 跳过清单缺少存储路径的条目：${item.original}`)
      result.skipped.push(item.original)
      continue
    }
    if (options.dryRun) {
      result.restored.push(target)
      continue
    }
    try {
      if (existsSync(target)) {
        setTrashContext({ command: "trash restore", scope: "all", cwd })
        try {
          trashAwareRemove(target, dirname(target))
        } finally {
          setTrashContext(null)
        }
      }
      mkdirSync(dirname(target), { recursive: true })
      if (item.kind === "link") {
        const isDir = statSync(linkTarget).isDirectory()
        symlinkSync(item.linkTarget as string, target, process.platform === "win32" ? (isDir ? "junction" : "file") : (isDir ? "dir" : "file"))
      } else {
        cpSync(item.stored, target, { recursive: item.kind === "dir" })
      }
      result.restored.push(target)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`⚠️ 恢复失败：${target}（${message}）`)
      result.failed.push({ path: item.original, message })
    }
  }
  if (!options.dryRun) {
    if (result.failed.length > 0) {
      manifest.status = "partial"
      writeManifest(entry.dir, manifest)
    } else if (result.skipped.length === 0) {
      safeRemoveArtifact(entry.dir, entry.root)
      result.removedEntry = true
    }
  }
  return result
}

export interface TrashPruneResult {
  removed: string[]
  kept: string[]
  dryRun: boolean
}

// 清理条目：--keep / --older-than / --all 三选一；不自动清理
export function pruneTrash(
  cwd: string,
  options: { scope?: TrashScopeChoice; keep?: number; olderThan?: number; all?: boolean; dryRun?: boolean },
): TrashPruneResult {
  const entries = listTrash(cwd, options.scope ?? (isHomeDirectory(cwd) ? "global" : "project"))
  const result: TrashPruneResult = { removed: [], kept: [], dryRun: Boolean(options.dryRun) }
  if (options.all) {
    for (const entry of entries) {
      if (!options.dryRun) safeRemoveArtifact(entry.dir, entry.root)
      result.removed.push(entry.id)
    }
    return result
  }
  const keep = Math.max(0, Math.trunc(options.keep ?? 0))
  const cutoff = options.olderThan === undefined ? Number.NaN : Date.now() - options.olderThan * 86_400_000
  // keep 按每个回收站根分别计算，避免两面条目互相挤占保留名额
  const groups = new Map<string, TrashEntry[]>()
  for (const entry of entries) {
    const group = groups.get(entry.root) ?? []
    group.push(entry)
    groups.set(entry.root, group)
  }
  for (const group of groups.values()) {
    group
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .forEach((entry, index) => {
        const byKeep = options.keep !== undefined && index >= keep
        const byAge = options.olderThan !== undefined && Date.parse(entry.createdAt) < cutoff
        if (byKeep || byAge) {
          if (!options.dryRun) safeRemoveArtifact(entry.dir, entry.root)
          result.removed.push(entry.id)
        } else {
          result.kept.push(entry.id)
        }
      })
  }
  return result
}

export interface TrashStats {
  entries: number
  bytes: number
  oldest: string | null
  newest: string | null
  byCommand: Record<string, number>
}

export function statsTrash(cwd: string, scope: TrashScopeChoice = "all"): TrashStats {
  const entries = listTrash(cwd, scope)
  const byCommand: Record<string, number> = {}
  for (const entry of entries) byCommand[entry.command] = (byCommand[entry.command] ?? 0) + 1
  return {
    entries: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    oldest: entries.length > 0 ? entries[entries.length - 1]!.createdAt : null,
    newest: entries.length > 0 ? entries[0]!.createdAt : null,
    byCommand,
  }
}
