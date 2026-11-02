// 技能状态文件：全局 ~/.agents/.toolkit-skills.json 与项目 `<repo>/.toolkit/state.json` 同构
// 新结构单文件（format + schemaVersion + sources）；读取旧结构时一次性导入为新结构，导入前备份 .bak
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { getHomeDir } from "../config"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { classifyTargetKind, listPackageSkills, packageVersion, pathKey, skillTargetLabel, skillsPackageDir, targetId } from "./source"
import {
  BUILTIN_SOURCE,
  PROJECT_STATE_DIR,
  PROJECT_STATE_FILE,
  SKILLS_STATE_FILE,
  STATE_FORMAT,
  STATE_SCHEMA_VERSION,
  type SkillStateEntry,
  type SkillStateSource,
  type SkillStateTarget,
  type SkillsState,
} from "./types"

// 全局状态文件路径：~/.agents/.toolkit-skills.json
export function skillsStateFile(): string {
  return join(getHomeDir(), ".agents", SKILLS_STATE_FILE)
}

// 项目态账文件绝对路径：<repo>/.toolkit/state.json
export function projectStateFile(root: string): string {
  return join(root, PROJECT_STATE_DIR, PROJECT_STATE_FILE)
}

// 普通对象判定：null 与数组不算
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 读取 JSON 对象：文件缺失、读盘失败、JSON 非法、顶层非对象一律返回 null
function readJsonObject(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readTextFile(file)) as unknown
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

// 新结构判定：format / schemaVersion / sources 三段齐备且 sources 为对象
function isCurrentState(data: Record<string, unknown>): boolean {
  return data.format === STATE_FORMAT && data.schemaVersion === STATE_SCHEMA_VERSION && isPlainObject(data.sources)
}

// 空状态：导入失败或首次写入时的兜底
export function emptySkillsState(): SkillsState {
  return { format: STATE_FORMAT, schemaVersion: STATE_SCHEMA_VERSION, updatedAt: new Date().toISOString(), sources: {} }
}

// 技能名 → 版本：旧状态导入时补齐条目版本，缺失即空串
function versionMap(): Map<string, string> {
  return new Map(listPackageSkills().map((skill) => [skill.name, skill.version]))
}

// 备份既有状态文件（仅首次导入前调用；已有 .bak 时保留最早的现场）
function backupStateFile(file: string): void {
  const backup = `${file}.bak`
  if (existsSync(backup)) return
  try {
    copyFileSync(file, backup)
  } catch {
    // 备份失败不阻断导入：状态文件本身仍在，后续写盘仍走原子写
  }
}

// 旧全局状态导入：targets[].links / copies → sources.toolkit.targets[].entries（mode link / copy）
function migrateLegacyGlobalState(data: Record<string, unknown>): SkillsState {
  const versions = versionMap()
  const targets: SkillStateTarget[] = []
  for (const raw of Array.isArray(data.targets) ? data.targets : []) {
    if (!isPlainObject(raw) || typeof raw.dir !== "string") continue
    const names = new Map<string, SkillStateEntry["mode"]>()
    for (const name of Array.isArray(raw.links) ? raw.links : []) if (typeof name === "string") names.set(name, "link")
    for (const name of Array.isArray(raw.copies) ? raw.copies : []) if (typeof name === "string") names.set(name, "copy")
    if (names.size === 0) continue
    const kind = classifyTargetKind(raw.dir)
    targets.push({
      id: targetId(raw.dir, kind),
      dir: raw.dir,
      // 表外目标（自定义 --dir）无显示名，留空由报告端回落路径，避免与真实显示名混淆
      label: skillTargetLabel(raw.dir) ?? "",
      kind,
      entries: [...names].map(([name, mode]) => ({ name, version: versions.get(name) ?? "", mode })),
    })
  }
  return {
    format: STATE_FORMAT,
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    sources: { [BUILTIN_SOURCE]: { kind: "builtin", version: packageVersion(), temporary: false, root: skillsPackageDir(), targets } },
  }
}

// 旧项目态导入：source / sourceNames / shells → sources.toolkit.targets（mode copy / shell）
function migrateLegacyProjectState(data: Record<string, unknown>): SkillsState {
  const versions = versionMap()
  const targets: SkillStateTarget[] = []
  if (typeof data.source === "string") {
    const entries = (Array.isArray(data.sourceNames) ? data.sourceNames : [])
      .filter((name): name is string => typeof name === "string")
      .map((name) => ({ name, version: versions.get(name) ?? "", mode: "copy" as const }))
    if (entries.length > 0) targets.push({ id: "source", dir: data.source, label: "真源副本", kind: "source", entries })
  }
  for (const raw of Array.isArray(data.shells) ? data.shells : []) {
    if (!isPlainObject(raw) || typeof raw.dir !== "string") continue
    const entries = (Array.isArray(raw.names) ? raw.names : [])
      .filter((name): name is string => typeof name === "string")
      .map((name) => ({ name, version: versions.get(name) ?? "", mode: "shell" as const }))
    if (entries.length > 0) targets.push({ id: raw.dir, dir: raw.dir, label: "薄壳", kind: "shell", entries })
  }
  return {
    format: STATE_FORMAT,
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    sources: { [BUILTIN_SOURCE]: { kind: "builtin", version: packageVersion(), temporary: false, root: skillsPackageDir(), targets } },
  }
}

// 校验 sources 内每个来源的结构：非对象来源直接剔除，targets / entries 非法按空处理
function normalizeSources(raw: Record<string, unknown>): Record<string, SkillStateSource> {
  const out: Record<string, SkillStateSource> = {}
  for (const [name, value] of Object.entries(raw)) {
    if (!isPlainObject(value)) continue
    const targets: SkillStateTarget[] = []
    for (const target of Array.isArray(value.targets) ? value.targets : []) {
      if (!isPlainObject(target) || typeof target.dir !== "string") continue
      const entries: SkillStateEntry[] = []
      for (const entry of Array.isArray(target.entries) ? target.entries : []) {
        if (!isPlainObject(entry) || typeof entry.name !== "string") continue
        const mode = entry.mode === "copy" || entry.mode === "shell" ? entry.mode : "link"
        entries.push({ name: entry.name, version: typeof entry.version === "string" ? entry.version : "", mode })
      }
      targets.push({
        id: typeof target.id === "string" ? target.id : target.dir,
        dir: target.dir,
        label: typeof target.label === "string" ? target.label : target.dir,
        kind: target.kind === "primary" || target.kind === "agent" || target.kind === "custom" || target.kind === "source" || target.kind === "shell" ? target.kind : "custom",
        entries,
      })
    }
    out[name] = {
      kind: typeof value.kind === "string" ? value.kind : "builtin",
      version: typeof value.version === "string" ? value.version : "",
      temporary: value.temporary === true,
      root: typeof value.root === "string" ? value.root : "",
      url: typeof value.url === "string" && value.url !== "" ? value.url : undefined,
      ref: typeof value.ref === "string" && value.ref !== "" ? value.ref : undefined,
      targets,
    }
  }
  return out
}

// 读取全局状态：不存在 / 损坏返回 null；旧结构导入成功后返回新结构，失败按空状态处理
export function readSkillsState(): SkillsState | null {
  const file = skillsStateFile()
  const data = readJsonObject(file)
  if (!data) return null
  if (isCurrentState(data)) {
    return { ...emptySkillsState(), updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "", sources: normalizeSources(data.sources as Record<string, unknown>) }
  }
  if (!Array.isArray(data.targets)) return null
  try {
    const migrated = migrateLegacyGlobalState(data)
    backupStateFile(file)
    writeSkillsState(migrated)
    return migrated
  } catch {
    // 导入失败按空状态重建：返回 null，调用方按未安装处理，后续 install 会写新结构
    return null
  }
}

// 写入全局状态：原子写入，避免半截 JSON
export function writeSkillsState(state: SkillsState): void {
  const file = skillsStateFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileAtomic(file, `${JSON.stringify(state, null, 2)}\n`)
}

// 是否已装有全局技能：只读状态文件（任一来源目标登记了技能即视为已安装），不做全量现场校验、不起进程
export function hasGlobalSkillsInstalled(): boolean {
  const state = readSkillsState()
  if (!state) return false
  return Object.values(state.sources).some((source) => source.targets.some((target) => target.entries.length > 0))
}

// 读取项目态账：不存在 / 损坏返回 null；旧结构导入成功后返回新结构
export function readProjectState(root: string): SkillsState | null {
  const file = projectStateFile(root)
  const data = readJsonObject(file)
  if (!data) return null
  if (isCurrentState(data)) {
    return { ...emptySkillsState(), updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "", sources: normalizeSources(data.sources as Record<string, unknown>) }
  }
  if (!Array.isArray(data.shells) && typeof data.source !== "string") return null
  try {
    const migrated = migrateLegacyProjectState(data)
    backupStateFile(file)
    writeSkillsStateAt(file, migrated)
    return migrated
  } catch {
    return null
  }
}

// 写入指定路径的状态（项目态与全局态共用序列化口径）
function writeSkillsStateAt(file: string, state: SkillsState): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileAtomic(file, `${JSON.stringify(state, null, 2)}\n`)
}

// 状态体比对键：不看 updatedAt，避免幂等安装每次都改写文件（否则 git 工作区常年脏）
export function stateBody(state: SkillsState): string {
  return JSON.stringify(state.sources)
}

// 写入项目态账：仅内容变化时落地，updatedAt 取实际写入时刻；返回是否实际写入
export function writeProjectState(root: string, sources: Record<string, SkillStateSource>): boolean {
  const prev = readProjectState(root)
  const next: SkillsState = { format: STATE_FORMAT, schemaVersion: STATE_SCHEMA_VERSION, updatedAt: new Date().toISOString(), sources }
  if (prev && stateBody(prev) === stateBody(next)) return false
  writeSkillsStateAt(projectStateFile(root), next)
  return true
}

// 删除项目态账（清理干净后调用）
export function removeProjectStateFile(root: string): void {
  rmSync(projectStateFile(root), { force: true })
}

// 状态目标映射：按路径键取目标，供 install 保留未参与本次运行的历史登记
export function targetsByDir(state: SkillsState | null): Map<string, SkillStateTarget> {
  const map = new Map<string, SkillStateTarget>()
  if (!state) return map
  for (const source of Object.values(state.sources)) {
    for (const target of source.targets) map.set(pathKey(target.dir), target)
  }
  return map
}
