// 迁移备份：集中存放、清单记录哈希，恢复时先校验再写回
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { getHomeDir } from "../config"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import type { BackupEntry, BackupManifest } from "./types"

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
      rmSync(file, { force: true })
    }
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

// 恢复结果：还原的文件、删除的新建文件与因冲突跳过的文件
export interface RestoreResult {
  restored: string[]
  removed: string[]
  skipped: string[]
  dir: string
}

// 从备份恢复：哈希不符的文件默认跳过，overwrite 为真才覆盖
export function restoreBackup(dir: string, options: { overwrite?: boolean } = {}): RestoreResult {
  const manifest = JSON.parse(readTextFile(join(dir, MANIFEST))) as BackupManifest
  const result: RestoreResult = { restored: [], removed: [], skipped: [], dir }
  for (const entry of manifest.entries) {
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
    if (sha256(item.path) !== item.postSha && !options.overwrite) {
      result.skipped.push(item.path)
      continue
    }
    rmSync(item.path, { force: true })
    result.removed.push(item.path)
  }
  return result
}
