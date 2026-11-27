// 迁移备份：集中存放、清单记录哈希，恢复时先校验再写回
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { getHomeDir } from "../config"
import { rootForPath } from "../safe-remove"
import { trashAwareRemove } from "../trash/store"
import { readTextFile } from "../read-text"
import { findProjectRoot, isHomeDirectory } from "../scope/paths"
import { PROJECT_STATE_DIR, PROJECT_STATE_FILE, SKILLS_STATE_FILE } from "../skills/types"
import { writeFileAtomic } from "../write-atomic"
import type { BackupEntry, BackupManifest, UpgradeLayer } from "./types"

const MANIFEST = "manifest.json"

// 文件哈希：不存在返回空串，供恢复前比对
function sha256(file: string): string {
  if (!existsSync(file)) return ""
  return createHash("sha256").update(readFileSync(file)).digest("hex")
}

// 备份目录根：项目面落 .toolkit/backup，全局面落 ~/.toolkit/backup
function backupRoot(cwd: string, scope: "project" | "global"): string {
  return scope === "global" ? join(getHomeDir(), ".toolkit", "backup") : join(cwd, ".toolkit", "backup")
}

// 迁移允许根：当前目录 + 项目根 + 用户主目录；从子目录执行时祖先配置与 .bak 仍可恢复/收编
export function upgradeRoots(cwd: string): string[] {
  return [...new Set([resolve(cwd), findProjectRoot(cwd), getHomeDir()])]
}

// 时间戳目录名：本地时间，秒级足够区分一次迁移
function stamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

// 一次迁移的备份会话：capture 记录改前内容，finalize 记录改后哈希
export class BackupSession {
  readonly dir: string
  private readonly entries: BackupEntry[] = []
  private readonly created: Array<{ path: string; postSha: string }> = []
  private dataTouched = false
  private saved = false

  constructor(
    private readonly cwd: string,
    scope: "project" | "global" = "project",
  ) {
    this.dir = join(backupRoot(cwd, scope), stamp())
  }

  // 备份即将改写的文件：已不存在则跳过（调用方按新建文件处理）
  capture(files: string[]): void {
    for (const file of files) {
      if (!existsSync(file)) continue
      const stored = join(this.dir, "files", `${this.entries.length}-${basename(file)}`)
      mkdirSync(join(this.dir, "files"), { recursive: true })
      copyFileSync(file, stored)
      this.entries.push({ original: file, stored, beforeSha: sha256(file) })
    }
  }

  // 收编历史 .bak：先备份再删除原文件，恢复时按备份内容重建
  absorb(files: string[]): void {
    for (const file of files) {
      if (!existsSync(file)) continue
      const stored = join(this.dir, "files", `${this.entries.length}-${basename(file)}`)
      mkdirSync(join(this.dir, "files"), { recursive: true })
      copyFileSync(file, stored)
      this.entries.push({ original: file, stored, beforeSha: sha256(file), absorbed: true })
      const root = rootForPath(file, upgradeRoots(this.cwd))
      if (!root) throw new Error(`收编 .bak 时路径不在项目或用户主目录内：${file}`)
      trashAwareRemove(file, root)
    }
  }

  // 标记本次备份包含本机契约数据：清理备份时据此提示数据回滚点
  markData(): void {
    this.dataTouched = true
  }

  // 记录本次新建的文件：恢复时按改后哈希判断是否可安全删除
  trackCreated(files: string[]): void {
    for (const file of files) {
      if (existsSync(file)) this.created.push({ path: file, postSha: sha256(file) })
    }
  }

  // 写入清单：改后哈希在此统一补齐，避免调用方逐个计算
  finalize(): string | null {
    if (this.entries.length === 0 && this.created.length === 0) return null
    const manifest: BackupManifest = {
      createdAt: new Date().toISOString(),
      entries: this.entries.map((entry) => ({ ...entry, postSha: sha256(entry.original) })),
      created: this.created,
      ...(this.dataTouched ? { data: true } : {}),
    }
    mkdirSync(this.dir, { recursive: true })
    writeFileAtomic(join(this.dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
    this.saved = true
    return this.dir
  }

  // 是否真正落过备份：空会话不产生备份目录
  get hasBackup(): boolean {
    return this.saved
  }
}

// 查找最近一次备份：优先项目目录，其次全局目录
export function latestBackup(cwd: string): string | null {
  const roots = [backupRoot(cwd, "project"), backupRoot(cwd, "global")]
  for (const root of roots) {
    if (!existsSync(root)) continue
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse()
    for (const name of dirs) {
      const dir = join(root, name)
      if (existsSync(join(dir, MANIFEST))) return dir
    }
  }
  return null
}

// 清理结果：removed 为已删（预演时为将删）路径，skipped 为无法确认归属的目录，kept 为按 keep 保留的目录
export interface BackupCleanResult {
  removed: string[]
  skipped: string[]
  kept: string[]
  // 被清理（或预演将清理）的备份里含本机契约数据：清掉后数据回滚点消失
  dataBackups: string[]
  dryRun: boolean
}

// 某根下按时间戳命名的备份目录：目录名可字典序排序，倒序即最新在前
function backupDirs(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .map((name) => join(root, name))
}

// 备份清单是否收过本机契约数据：解析失败按未标记处理，不阻断清理
function readManifestDataFlag(dir: string): boolean {
  try {
    const manifest = JSON.parse(readTextFile(join(dir, MANIFEST))) as BackupManifest
    return manifest.data === true
  } catch {
    return false
  }
}

// 清理层：显式 --layers 优先；缺省时项目内只清当前项目、home 下只清全局面；local 无备份根，剔除
export function pruneLayersFor(cwd: string, explicitLayers?: readonly UpgradeLayer[]): UpgradeLayer[] {
  const source = explicitLayers ?? (isHomeDirectory(cwd) ? (["global"] as const) : (["project"] as const))
  return source.filter((layer) => layer !== "local")
}

// 清理迁移备份：只删已知备份根下含 manifest.json 的直接子目录，外来目录跳过并回报
// 同时清理本包已知的散落 .bak（配置与技能状态旁），按固定清单匹配，不扫其他 .bak
// keep 只作用于备份目录（每个根分别保留最近 n 个），.bak 无保留概念、随清理一并删除
export function pruneBackups(options: { cwd: string; layers: readonly UpgradeLayer[]; keep?: number; dryRun?: boolean }): BackupCleanResult {
  const keep = Math.max(0, Math.trunc(options.keep ?? 0))
  const dryRun = Boolean(options.dryRun)
  const result: BackupCleanResult = { removed: [], skipped: [], kept: [], dataBackups: [], dryRun }
  const roots: string[] = []
  if (options.layers.includes("global")) roots.push(backupRoot(options.cwd, "global"))
  if (options.layers.includes("project") || options.layers.includes("local")) roots.push(backupRoot(options.cwd, "project"))
  for (const root of [...new Set(roots)]) {
    let keptCount = 0
    for (const dir of backupDirs(root)) {
      if (!existsSync(join(dir, MANIFEST))) {
        result.skipped.push(dir)
        continue
      }
      if (keptCount < keep) {
        keptCount += 1
        result.kept.push(dir)
        continue
      }
      if (readManifestDataFlag(dir)) result.dataBackups.push(dir)
      if (!dryRun) trashAwareRemove(dir, root)
      result.removed.push(dir)
    }
  }
  const baks: string[] = []
  if (options.layers.includes("global")) {
    const home = getHomeDir()
    baks.push(join(home, ".toolkitrc.json.bak"), join(home, ".agents", `${SKILLS_STATE_FILE}.bak`))
  }
  if (options.layers.includes("project") || options.layers.includes("local")) {
    baks.push(
      join(options.cwd, ".toolkitrc.json.bak"),
      join(options.cwd, ".toolkitrc.local.json.bak"),
      join(options.cwd, PROJECT_STATE_DIR, `${PROJECT_STATE_FILE}.bak`),
    )
  }
  for (const file of [...new Set(baks)]) {
    if (!existsSync(file)) continue
    const root = rootForPath(file, [getHomeDir(), options.cwd])
    if (!root) {
      console.warn(`⚠️ 忽略不在项目或用户主目录内的备份文件：${file}`)
      result.skipped.push(file)
      continue
    }
    if (!dryRun) trashAwareRemove(file, root)
    result.removed.push(file)
  }
  return result
}

// 恢复结果：还原的文件、删除的新建文件与因冲突跳过的文件
export interface RestoreResult {
  restored: string[]
  removed: string[]
  skipped: string[]
  dir: string
}

// 从备份恢复：哈希不符的文件默认跳过，overwrite 为真才覆盖；所有路径必须落在 cwd 或 home 内
export function restoreBackup(dir: string, options: { overwrite?: boolean; roots?: string[] } = {}): RestoreResult {
  const manifest = JSON.parse(readTextFile(join(dir, MANIFEST))) as BackupManifest
  const roots = options.roots ?? [getHomeDir()]
  const result: RestoreResult = { restored: [], removed: [], skipped: [], dir }
  for (const entry of manifest.entries) {
    const root = rootForPath(entry.original, roots)
    if (!root) {
      console.warn(`⚠️ 忽略越界恢复路径：${entry.original}`)
      result.skipped.push(entry.original)
      continue
    }
    const current = sha256(entry.original)
    const unchanged = entry.absorbed ? current === "" : entry.postSha !== undefined && current === entry.postSha
    if (!unchanged && !options.overwrite) {
      result.skipped.push(entry.original)
      continue
    }
    if (current === "" && !entry.absorbed && !options.overwrite) {
      result.skipped.push(entry.original)
      continue
    }
    mkdirSync(dirname(entry.original), { recursive: true })
    copyFileSync(entry.stored, entry.original)
    result.restored.push(entry.original)
  }
  for (const item of manifest.created) {
    if (!existsSync(item.path)) continue
    const root = rootForPath(item.path, roots)
    if (!root) {
      console.warn(`⚠️ 忽略越界删除路径：${item.path}`)
      result.skipped.push(item.path)
      continue
    }
    if (sha256(item.path) !== item.postSha && !options.overwrite) {
      result.skipped.push(item.path)
      continue
    }
    trashAwareRemove(item.path, root)
    result.removed.push(item.path)
  }
  return result
}
