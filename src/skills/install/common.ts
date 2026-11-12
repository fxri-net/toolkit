// 技能安装与卸载（common）：自 install.ts 按面拆分，逻辑逐字未改
import { existsSync, lstatSync, mkdirSync, readlinkSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { writeFileAtomic } from "../../write-atomic"
import { readTextFile } from "../../read-text"
import { assertUniqueSkillNames, classifyExisting, copyArtifact, currentSkillShellVersion, dirsEqual, expandSkillRequires, isInside, isToolkitArtifactLink, pathKey, readSkillShellVersion, removeArtifact, resolveBuiltinSource, resolveLocalSource, resolveSource, sourceSkillItems, stripTailSep, type SkillSource } from "../source"
import { readSkillsInstallConfig } from "../config"
import { BUILTIN_SOURCE, SKILL_ENTRY, type ProjectDirResult, type SkillStateSource, type SkillStateTarget, type SkillItem, type SkillsMode } from "../types"


export interface InstallOptions {
  copy?: boolean
  dirs?: string[]
  dryRun?: boolean
  force?: boolean
  // 本次安装的技能名；省略时安装包内全部技能（库调用默认值，CLI 总会显式传入选择集）
  skills?: string[]
  // 本次写入的目标名（canonical / agent name）；省略时沿用已保存选择，未保存过则写全部可用目标
  targets?: string[]
  // 是否把本次目标选择写回配置；--no-save-agents 时为 false
  saveTargets?: boolean
  // 本次临时外部来源（--from）；永久来源从 skillsInstall.sources 读取
  externalSources?: ExternalSourceOption[]
  // 清理未选择且内容一致的本包产物
  prune?: boolean
  // 本次选择是否写回配置；--no-skills 时为 false
  saveSelection?: boolean
  // 本次生效的安装模式；省略时读配置，默认 skills
  mode?: SkillsMode
}

// 外部来源入参：path 为来源根，name 可与目录派生名不同（--save 名）
export interface ExternalSourceOption {
  path: string
  name?: string
  temporary?: boolean
}

export interface RemoveSkillsOptions {
  dryRun?: boolean
  // 只清理指定技能的选择与产物；省略时清空全部选择
  skills?: string[]
  // 只清理指定来源的登记与产物；省略时清理全部来源
  source?: string
}

// 按选择集过滤统一技能条目：未知名称告警后剔除；requires 依赖自动补全，缺失依赖告警
export function filterSkillItems(items: SkillItem[], requested?: string[]): SkillItem[] {
  if (!requested) return items
  const unknown = requested.filter((name) => !items.some((item) => item.name === name))
  if (unknown.length > 0) console.warn(`⚠️ 忽略不存在的技能：${unknown.join("、")}`)
  const known = requested.filter((name) => items.some((item) => item.name === name))
  const expanded = expandSkillRequires(items, known)
  if (expanded.missing.length > 0) console.warn(`⚠️ 忽略缺失的依赖技能：${expanded.missing.join("、")}`)
  const wanted = new Set(expanded.names)
  return items.filter((item) => wanted.has(item.name))
}

// 收集本次参与安装的来源：内置源 + 已登记永久来源 + 临时 --from
// 已登记来源失效时告警跳过（不阻断其他来源）；临时来源显式传入，解析失败直接抛错
export function collectSources(options: { externalSources?: ExternalSourceOption[]; dryRun?: boolean } = {}): SkillSource[] {
  const sources: SkillSource[] = [resolveBuiltinSource()]
  const config = readSkillsInstallConfig()
  for (const [name, entry] of Object.entries(config.sources ?? {})) {
    const location = entry.url ?? entry.root
    if (!location) continue
    try {
      const source = resolveSource(location, { name, temporary: false })
      const duplicate = sources.find((item) => item.name === source.name)
      if (duplicate) {
        if (pathKey(duplicate.root) !== pathKey(source.root)) throw new Error(`来源名冲突：${name}（${duplicate.root} / ${source.root}）`)
        continue
      }
      sources.push(source)
    } catch (e) {
      console.warn(`⚠️ 跳过失效的外部来源 ${name}：${(e as Error).message}`)
    }
  }
  for (const ext of options.externalSources ?? []) {
    const source = resolveSource(ext.path, { name: ext.name, temporary: ext.temporary, dryRun: options.dryRun })
    const duplicate = sources.find((item) => item.name === source.name)
    if (duplicate && pathKey(duplicate.root) !== pathKey(source.root)) {
      throw new Error(`来源名冲突：${source.name}（${duplicate.root} / ${source.root}）`)
    }
    if (!duplicate) sources.push(source)
  }
  return sources
}

// 收集统一技能条目：CLI 选择交互、安装与状态共用同一份视图
export function collectSkillItems(options: { externalSources?: ExternalSourceOption[]; dryRun?: boolean } = {}): SkillItem[] {
  const items = collectSources(options).flatMap(sourceSkillItems)
  assertUniqueSkillNames(items)
  return items
}

// 技能名 → 真源目录与链接指向：供修剪与状态判定按来源取真源
export function skillTargetsBySource(sources: SkillSource[]): Map<string, { dir: string; linkTarget: string }> {
  const map = new Map<string, { dir: string; linkTarget: string }>()
  for (const source of sources) {
    for (const item of sourceSkillItems(source)) map.set(item.name, { dir: item.dir, linkTarget: item.linkTarget })
  }
  return map
}

// 清理未选择的本包产物：只删链接指向本包 / 副本内容与真源一致的条目；来源已不可解析时保留
// 来源已无此名（改名 / 移除）的条目：链接形态仍可确认归属（含悬空），直接摘除；副本无从校验，保留交人工
export function pruneEntries(
  previous: SkillStateTarget | undefined,
  selected: Set<string>,
  dir: string,
  byName: Map<string, { dir: string; linkTarget: string }>,
): string[] {
  if (!previous) return []
  const pruned: string[] = []
  for (const entry of previous.entries) {
    if (selected.has(entry.name)) continue
    const dest = join(dir, entry.name)
    const skill = byName.get(entry.name)
    if (!skill) {
      if (entry.mode !== "link") continue
      try {
        if (!lstatSync(dest).isSymbolicLink()) continue
        removeArtifact(dest)
        pruned.push(entry.name)
      } catch {
        // 清理失败保留记录，下次再试
      }
      continue
    }
    const kind = classifyExisting(dest, skill.linkTarget, undefined, skill.dir)
    const consistent = kind === "link-ok" || (kind === "dir" && existsSync(skill.dir) && dirsEqual(skill.dir, dest))
    if (!consistent) continue
    try {
      removeArtifact(dest)
      pruned.push(entry.name)
    } catch {
      // 清理失败保留记录，下次再试
    }
  }
  return pruned
}

// 安装：对每个可用目标逐个技能做幂等处理——指向正确（含同内容异地锚点）跳过、指向其他版本或悬空重建、非本包实体目录默认跳过（--force 覆盖）

export function sourceSkillMap(name: string, source: SkillStateSource): Map<string, { dir: string; linkTarget: string }> {
  if (name === BUILTIN_SOURCE || source.kind === "builtin") return skillTargetsBySource([resolveBuiltinSource()])
  if (!source.root || !existsSync(source.root)) return new Map()
  try {
    return skillTargetsBySource([resolveLocalSource(source.root, { name, temporary: source.temporary })])
  } catch {
    return new Map()
  }
}

// 未登记旧名的兜底判定：只认本工具形态链接（技能源缓存 / 本包目录）或指向已登记来源根的链接
// 用户显式点名才走到这里，仍要求形态可确认归属，避免误删用户自装产物
export function orphanArtifactRemovable(dest: string, roots: string[]): boolean {
  if (isToolkitArtifactLink(dest)) return true
  try {
    if (!lstatSync(dest).isSymbolicLink()) return false
    const target = readlinkSync(dest)
    const abs = stripTailSep(isAbsolute(target) ? target : resolve(dirname(dest), target))
    return roots.some((root) => isInside(abs, root))
  } catch {
    return false
  }
}

// 卸载：只处理状态文件记载的本包产物；链接（含悬空）直接摘除，副本内容与真源一致才删，其余交人工确认
// 顺序：先清选择 / 来源配置（失败即中止、不删产物）→ 清产物 → 重写状态

export function recordAction(result: ProjectDirResult, action: "created" | "updated" | "skipped" | "conflict", name: string): void {
  if (action === "created") result.created.push(name)
  else if (action === "updated") result.updated.push(name)
  else if (action === "skipped") result.skipped.push(name)
  else result.conflicts.push(name)
}

// 真源副本写入：缺则建；内容一致跳过；有本包归属记录或 --force 时刷新（升级场景），否则视为他人同名技能交人工
export function applySourceCopy(source: string, dest: string, recorded: boolean, force: boolean, dryRun: boolean): "created" | "updated" | "skipped" | "conflict" {
  if (!existsSync(dest)) {
    if (!dryRun) copyArtifact(source, dest)
    return "created"
  }
  if (dirsEqual(source, dest)) return "skipped"
  if (!recorded && !force) return "conflict"
  if (!dryRun) {
    removeArtifact(dest)
    copyArtifact(source, dest)
  }
  return "updated"
}

// 薄壳写入：缺则建；内容全等跳过；标记超前不降级覆盖；无标记视为他人产物（非 --force 不改）；否则就地重写
export function applyShell(file: string, expected: string, force: boolean, dryRun: boolean): "created" | "updated" | "skipped" | "conflict" {
  const exists = existsSync(file)
  const actual = exists ? readTextFile(file) : ""
  const version = exists ? readSkillShellVersion(actual) : null
  let action: "created" | "updated" | "skipped" | "conflict"
  if (!exists) action = "created"
  else if (version !== null && version > currentSkillShellVersion()) action = "skipped"
  else if (actual === expected) action = "skipped"
  else if (version === null && !force) action = "conflict"
  else action = "updated"
  if (!dryRun && (action === "created" || action === "updated")) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileAtomic(file, expected)
  }
  return action
}

// 项目侧安装：真源副本（仓库内唯一一份，入库）+ 各候选目录薄壳（指向真源）
// 真源只此一份，其余目录放薄壳引用，避免多份副本互相漂移

export function consistentSourceCopy(dest: string, sourceDir: string | undefined): boolean {
  return Boolean(sourceDir) && dirsEqual(sourceDir as string, dest)
}

// 薄壳一致性：带本包标记即可安全删除（内容已由真源派生，不逐字比对）
export function consistentShell(skillDir: string): boolean {
  try {
    return readSkillShellVersion(readTextFile(join(skillDir, SKILL_ENTRY))) !== null
  } catch {
    return false
  }
}

// 链接自愈（skills.autoLink，默认 true）：只对状态文件记载的链接做补链与修链
// 不含首次安装、不含升级副本；CI 环境跳过，任何失败静默（不阻塞用户命令）
// 现场被替换为实体目录/普通文件时默认清理重建；skills.autoLinkReplaceForeign=false 则一律不动
