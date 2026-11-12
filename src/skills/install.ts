// 技能安装与卸载：全局（软链 / 副本到各 agent 目录）与项目（唯一真源副本 + 各候选目录薄壳）
// 安装按选择集写产物；--prune 只清理本包登记且内容一致的未选择产物；remove 顺序为「配置 → 产物 → 状态」
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { getConfigSection, getHomeDir } from "../config"
import { isCiEnv } from "../update-check"
import { writeFileAtomic } from "../write-atomic"
import { readTextFile } from "../read-text"
import {
  assertUniqueSkillNames,
  buildSkillShell,
  classifyExisting,
  copyArtifact,
  currentSkillShellVersion,
  dirsEqual,
  expandSkillRequires,
  isEmptyDir,
  isInside,
  isToolkitArtifactLink,
  listPackageSkills,
  pathKey,
  pathPresent,
  readSkillDescription,
  readSkillShellVersion,
  removeArtifact,
  resolveBuiltinSource,
  resolveLocalSource,
  resolveSource,
  resolveProjectTargets,
  resolveSkillTargets,
  resolveTargetsByName,
  skillTargetLabel,
  skillsLinkDir,
  skillsSourceDir,
  sourceSkillItems,
  stripTailSep,
  targetId,
  toRepoRel,
  writeArtifact,
  type SkillSource,
} from "./source"
import { acquireSkillsLock, projectSkillsLockFile, skillsLockFile } from "./lock"
import {
  projectStateFile,
  readProjectState,
  readSkillsState,
  removeProjectStateFile,
  skillsStateFile,
  writeProjectState,
  writeSkillsState,
} from "./state"
import { readProjectSkillsConfig, readSkillsInstallConfig, writeProjectSkillsConfig, writeSkillsInstallConfig } from "./config"
import {
  BUILTIN_SOURCE,
  SKILL_ENTRY,
  STATE_FORMAT,
  STATE_SCHEMA_VERSION,
  type InstallReport,
  type ProjectDirResult,
  type ProjectInstallReport,
  type ProjectRemoveReport,
  type ProjectRemoveResult,
  type RemoveResult,
  type SkillStateEntry,
  type SkillStateSource,
  type SkillStateTarget,
  type SkillItem,
  type SkillsMode,
  type SkillsRemoveReport,
  type TargetInstallResult,
} from "./types"

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
function filterSkillItems(items: SkillItem[], requested?: string[]): SkillItem[] {
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
function pruneEntries(
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
export function installSkills(options: InstallOptions = {}): InstallReport {
  const sources = collectSources({ externalSources: options.externalSources, dryRun: options.dryRun })
  const allItems = sources.flatMap(sourceSkillItems)
  assertUniqueSkillNames(allItems)
  const items = filterSkillItems(allItems, options.skills)
  const selected = new Set(items.map((item) => item.name))
  const byName = new Map(allItems.map((item) => [item.name, { dir: item.dir, linkTarget: item.linkTarget }]))
  // 目标选择：显式参数 > 已保存选择 > 全部可用目标；--dir 始终一次性追加，不参与长期选择
  const savedTargets = readSkillsInstallConfig().targets
  const requestedTargets = options.targets ?? (savedTargets && savedTargets.length > 0 ? savedTargets : undefined)
  const resolved = resolveTargetsByName(requestedTargets, options.dirs ?? [])
  const allTargets = resolveSkillTargets()
  const skippedTargets: Array<{ dir: string; label: string }> = []
  for (const name of resolved.invalid) console.warn(`⚠️ 忽略未知的 agent / 目标名：${name}`)
  for (const name of resolved.unavailable) {
    console.warn(`⚠️ 忽略本机未检测到的 agent：${name}（不凭空创建目录）`)
    const target = allTargets.find((item) => item.name === name)
    if (target) skippedTargets.push({ dir: target.dir, label: target.label })
  }
  // 未保存过目标选择时沿用旧口径：把全部未检测到的 agent 汇总回报，便于用户知道可 --dir 兜底
  if (requestedTargets === undefined) {
    for (const target of allTargets) {
      if (target.kind === "agent" && !target.available) skippedTargets.push({ dir: target.dir, label: target.label })
    }
  }
  const targets = resolved.targets

  const release = options.dryRun ? null : acquireSkillsLock(skillsLockFile(getHomeDir()))
  try {
    const previous = readSkillsState()
    // 既有登记按「来源 → 目标目录」建索引，供落点形态与修剪按来源取真源
    const prevBySourceDir = new Map<string, Map<string, SkillStateTarget>>()
    for (const [sourceName, source] of Object.entries(previous?.sources ?? {})) {
      const map = new Map<string, SkillStateTarget>()
      for (const target of source.targets) map.set(pathKey(target.dir), target)
      prevBySourceDir.set(sourceName, map)
    }
    const nextBySource = new Map<string, SkillStateTarget[]>()
    for (const source of sources) nextBySource.set(source.name, [])
    const handled = new Set<string>()
    const results: TargetInstallResult[] = []

    for (const target of targets) {
      const dirKey = pathKey(target.dir)
      handled.add(dirKey)
      const result: TargetInstallResult = {
        dir: target.dir,
        label: target.label,
        kind: target.kind,
        created: [],
        updated: [],
        skipped: [],
        conflicts: [],
        failed: [],
        degraded: [],
        links: [],
        copies: [],
        pruned: [],
        migrated: [],
      }
      const entriesBySource = new Map<string, SkillStateEntry[]>()
      for (const item of items) {
        const dest = join(target.dir, item.name)
        const kind = classifyExisting(dest, item.linkTarget)
        // 既有登记：本目标该来源下此技能此前是否以副本形式写入——决定 --force 与裸 install 的落点形态
        const recordedCopyHere = prevBySourceDir.get(item.source)?.get(dirKey)?.entries.some((entry) => entry.name === item.name && entry.mode === "copy") ?? false
        if (kind === "link-ok") {
          result.skipped.push(item.name)
          result.links.push(item.name)
          entriesBySource.set(item.source, [...(entriesBySource.get(item.source) ?? []), { name: item.name, version: item.version, mode: "link" }])
          continue
        }
        if (kind === "dir" && !options.force) {
          // 实体目录：若状态文件记载为本包副本则比对内容，否则视为用户自装技能不覆盖
          if (!recordedCopyHere) {
            result.conflicts.push(item.name)
            continue
          }
          if (dirsEqual(item.dir, dest)) {
            result.skipped.push(item.name)
            result.copies.push(item.name)
            entriesBySource.set(item.source, [...(entriesBySource.get(item.source) ?? []), { name: item.name, version: item.version, mode: "copy" }])
            continue
          }
        }
        if (kind === "file" && !options.force) {
          result.conflicts.push(item.name)
          continue
        }
        // 落点形态：临时外部来源恒为副本；已登记副本保持副本；--force 只解除冲突判定
        const useCopy = Boolean(options.copy) || item.temporary || (kind === "dir" && recordedCopyHere)
        if (options.dryRun) {
          if (kind === "absent") result.created.push(item.name)
          else result.updated.push(item.name)
          if (useCopy) result.copies.push(item.name)
          else result.links.push(item.name)
          continue
        }
        try {
          if (!(kind === "absent")) removeArtifact(dest)
          const written = writeArtifact(item.linkTarget, item.dir, dest, useCopy)
          if (kind === "absent") result.created.push(item.name)
          else result.updated.push(item.name)
          if (written.mode === "link") result.links.push(item.name)
          else {
            result.copies.push(item.name)
            if (written.reason) result.degraded.push({ name: item.name, reason: written.reason })
          }
          entriesBySource.set(item.source, [...(entriesBySource.get(item.source) ?? []), { name: item.name, version: item.version, mode: written.mode }])
        } catch (e) {
          result.failed.push({ name: item.name, reason: (e as Error).message })
        }
      }
      // 曾用名迁移：仅当新名本次已就绪（新建 / 更新 / 跳过）时才清理旧名，避免新名冲突或失败时两头落空
      const readyNames = new Set([...result.created, ...result.updated, ...result.skipped])
      const removedAliases = new Set<string>()
      for (const item of items) {
        if (!readyNames.has(item.name)) continue
        for (const old of item.previousNames) {
          const dest = join(target.dir, old)
          const kind = classifyExisting(dest, item.linkTarget, undefined, item.dir)
          if (kind === "absent") continue
          const removable = kind === "dangling" || kind === "link-ok" || (kind === "dir" && existsSync(item.dir) && dirsEqual(item.dir, dest))
          if (!removable) {
            // 不以 conflicts 呈现：--force 对旧名副本无效，按失败条目给出人工清理指引
            result.failed.push({ name: old, reason: `旧名产物无法确认归属，需人工清理：${dest}` })
            continue
          }
          if (!options.dryRun) {
            try {
              removeArtifact(dest)
            } catch {
              result.failed.push({ name: old, reason: `旧名产物清理失败，需人工处理：${dest}` })
              continue
            }
          }
          removedAliases.add(old)
          result.migrated.push({ from: old, to: item.name })
        }
      }
      if (options.prune && !options.dryRun) {
        for (const source of sources) {
          result.pruned.push(...pruneEntries(prevBySourceDir.get(source.name)?.get(dirKey), selected, target.dir, byName))
        }
      }
      results.push(result)
      if (!options.dryRun) {
        const prunedSet = new Set(result.pruned)
        for (const source of sources) {
          const previousTarget = prevBySourceDir.get(source.name)?.get(dirKey)
          const entries = [
            ...(entriesBySource.get(source.name) ?? []),
            ...(previousTarget?.entries.filter(
              (entry) => !selected.has(entry.name) && !prunedSet.has(entry.name) && !removedAliases.has(entry.name) && pathPresent(join(target.dir, entry.name)),
            ) ?? []),
          ]
          if (entries.length > 0) {
            nextBySource.get(source.name)!.push({
              id: previousTarget?.id ?? targetId(target.dir, target.kind),
              dir: target.dir,
              label: target.label,
              kind: target.kind,
              entries,
            })
          }
        }
      }
    }

    // 未参与本次选择的历史目标：默认保留产物与登记；显式收窄目标选择后，--prune 才清理内容一致的本包产物
    const pruneDeselected = Boolean(options.prune) && requestedTargets !== undefined
    for (const source of sources) {
      for (const target of previous?.sources?.[source.name]?.targets ?? []) {
        if (handled.has(pathKey(target.dir))) continue
        let entries = target.entries
        if (pruneDeselected) {
          const pruned = pruneEntries(target, new Set(), target.dir, byName)
          if (pruned.length > 0) {
            results.push({
              dir: target.dir,
              label: target.label || skillTargetLabel(target.dir) || target.dir,
              kind: target.kind === "primary" || target.kind === "agent" ? target.kind : "custom",
              created: [],
              updated: [],
              skipped: [],
              conflicts: [],
              failed: [],
              degraded: [],
              links: [],
              copies: [],
              pruned,
              migrated: [],
            })
            const prunedSet = new Set(pruned)
            entries = entries.filter((entry) => !prunedSet.has(entry.name))
          }
        }
        if (entries.length > 0) nextBySource.get(source.name)!.push({ ...target, entries })
      }
    }

    if (!options.dryRun) {
      // 组装来源状态：本次未参与的历史来源原样保留
      const nextSources: Record<string, SkillStateSource> = {}
      for (const [name, source] of Object.entries(previous?.sources ?? {})) {
        if (!sources.some((item) => item.name === name) && source.targets.length > 0) nextSources[name] = source
      }
      for (const source of sources) {
        const sourceTargets = nextBySource.get(source.name) ?? []
        if (sourceTargets.length > 0) {
          nextSources[source.name] = {
            kind: source.kind,
            version: source.version,
            temporary: source.temporary,
            root: source.root,
            url: source.url,
            ref: source.ref,
            targets: sourceTargets,
          }
        }
      }
      writeGlobalSources(nextSources)
      // 未显式传 skills 时本次即安装全部，同样保存选择集，保证 status 回显与现场一致；--no-skills 不写
      if (options.saveSelection !== false) saveGlobalSelection(sources, items)
      if (options.saveTargets !== false) {
        const known = new Set(allTargets.filter((target) => target.name).map((target) => target.name))
        const names = requestedTargets
          ? requestedTargets.filter((name) => known.has(name))
          : targets.filter((target) => target.name).map((target) => target.name)
        saveGlobalTargets([...new Set(names)])
      }
    }

    // 本次选择的真源版本：外部技能也按自身 frontmatter 取值，不再只认包内技能
    const versions = Object.fromEntries(items.map((item) => [item.name, item.version]))
    // 重建 / 更新时给出「当前 → 目标」：旧值取安装前的登记版本
    const previousVersion = (name: string): string => {
      for (const byDir of prevBySourceDir.values()) {
        for (const target of byDir.values()) {
          const entry = target.entries.find((item) => item.name === name)
          if (entry?.version) return entry.version
        }
      }
      return ""
    }
    const transitions: Array<{ name: string; from: string; to: string }> = []
    for (const result of results) {
      for (const name of result.updated) {
        const from = previousVersion(name)
        const to = versions[name] ?? ""
        if (from && to && from !== to) transitions.push({ name, from, to })
      }
    }
    const missingVersions = items.filter((item) => !item.version).map((item) => item.name)

    return {
      source: skillsSourceDir(),
      skills: items.map((item) => item.name),
      selection: items.map((item) => item.name),
      mode: options.mode ?? readSkillsInstallConfig().mode ?? "skills",
      targetSelection: targets.filter((target) => target.name).map((target) => target.name),
      targets: results,
      skippedTargets,
      stateFile: skillsStateFile(),
      versions,
      transitions,
      missingVersions,
    }
  } finally {
    release?.()
  }
}

// 保存全局选择集：按来源覆盖本次涉及的选择，保留其他来源与 targets / sources
function saveGlobalSelection(sources: SkillSource[], items: SkillItem[]): void {
  try {
    const config = readSkillsInstallConfig()
    const selection = { ...(config.selection ?? {}) }
    for (const source of sources) {
      // 临时来源只写本次产物，不把来源键留在选择集里
      if (source.temporary) {
        delete selection[source.name]
        continue
      }
      const names = items.filter((item) => item.source === source.name).map((item) => item.name)
      // 本次零装不写空数组：空名单会被当成「该来源一个都不选」，把一次性的名单失效固化成永久排除
      if (names.length > 0) selection[source.name] = names
      else delete selection[source.name]
    }
    writeSkillsInstallConfig({ selection: Object.keys(selection).length > 0 ? selection : undefined })
  } catch (e) {
    // 配置写入失败不回滚已安装产物：状态已记录，下次安装会重试保存
    console.warn(`⚠️ 技能选择保存失败：${(e as Error).message}`)
  }
}

// 保存全局目标选择：只合并 skillsInstall 段，保留 selection / sources
function saveGlobalTargets(names: string[]): void {
  try {
    writeSkillsInstallConfig({ targets: names })
  } catch (e) {
    console.warn(`⚠️ 目标选择保存失败：${(e as Error).message}`)
  }
}

// 写全局状态：覆盖本次来源、保留未参与的历史来源；全部为空时删除状态文件
function writeGlobalSources(sources: Record<string, SkillStateSource>): void {
  const cleaned = Object.fromEntries(Object.entries(sources).filter(([, source]) => source.targets.length > 0))
  const file = skillsStateFile()
  if (Object.keys(cleaned).length === 0) {
    rmSync(file, { force: true })
    return
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileAtomic(
    file,
    `${JSON.stringify({ format: STATE_FORMAT, schemaVersion: STATE_SCHEMA_VERSION, updatedAt: new Date().toISOString(), sources: cleaned }, null, 2)}\n`,
  )
}

// 清空全局选择：--source 限定来源、--skills 限定技能名；两者都省略时清空全部
function clearGlobalSelection(skills?: string[], source?: string): void {
  const config = readSkillsInstallConfig()
  if (!config.selection) return
  const next = { ...config.selection }
  if (!skills && !source) {
    writeSkillsInstallConfig({ selection: undefined })
    return
  }
  const dropping = new Set(skills ?? [])
  for (const name of Object.keys(next)) {
    if (source && name !== source) continue
    const kept = skills ? (next[name] ?? []).filter((item) => !dropping.has(item)) : []
    if (kept.length > 0) next[name] = kept
    else delete next[name]
  }
  writeSkillsInstallConfig({ selection: Object.keys(next).length > 0 ? next : undefined })
}

// 移除来源登记：sources 与 selection 同时删；调用方须在删产物前完成
function removeSourceConfig(sourceName: string): void {
  const config = readSkillsInstallConfig()
  const sources = { ...(config.sources ?? {}) }
  delete sources[sourceName]
  const selection = { ...(config.selection ?? {}) }
  delete selection[sourceName]
  writeSkillsInstallConfig({
    sources: Object.keys(sources).length > 0 ? sources : undefined,
    selection: Object.keys(selection).length > 0 ? selection : undefined,
  })
}

// 来源 → 技能名映射：内置源取包内真源，外部来源按状态登记的 root 重新解析；来源失效时返回空映射
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
function orphanArtifactRemovable(dest: string, roots: string[]): boolean {
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
export function removeSkills(options: RemoveSkillsOptions = {}): SkillsRemoveReport {
  const stateFile = skillsStateFile()
  // 配置写失败直接向上抛出：调用方捕获后不得继续删产物；预演不改任何文件
  if (!options.dryRun) {
    clearGlobalSelection(options.skills, options.source)
    if (options.source) removeSourceConfig(options.source)
  }
  const release = options.dryRun ? null : acquireSkillsLock(skillsLockFile(getHomeDir()))
  try {
    const state = readSkillsState()
    if (!state) return { stateFile, stateExists: false, targets: [], stateRemoved: false }

    const wanted = options.skills ? new Set(options.skills) : null
    const results: RemoveResult[] = []
    let failed = false
    let changed = false
    const nextSources: Record<string, SkillStateSource> = {}

    for (const [sourceName, source] of Object.entries(state.sources)) {
      if (options.source && options.source !== sourceName) {
        nextSources[sourceName] = source
        continue
      }
      const skillMap = sourceSkillMap(sourceName, source)
      const nextTargets: SkillStateTarget[] = []
      for (const target of source.targets) {
        const result: RemoveResult = { dir: target.dir, label: target.label || skillTargetLabel(target.dir) || null, removed: [], missing: [], skippedForeign: [], dirReclaimed: false }
        const kept: SkillStateEntry[] = []
        for (const entry of target.entries) {
          if (wanted && !wanted.has(entry.name)) {
            kept.push(entry)
            continue
          }
          const dest = join(target.dir, entry.name)
          const skill = skillMap.get(entry.name)
          // 来源已失效：只清可确认悬空的链接，副本无从校验，交人工确认
          if (!skill) {
            let danglingLink = false
            try {
              danglingLink = lstatSync(dest).isSymbolicLink() && !existsSync(dest)
            } catch {
              danglingLink = false
            }
            if (danglingLink && !options.dryRun) {
              removeArtifact(dest)
              result.removed.push(entry.name)
              changed = true
              continue
            }
            if (danglingLink) {
              result.removed.push(entry.name)
              continue
            }
            result.skippedForeign.push(entry.name)
            kept.push(entry)
            continue
          }
          // 链接锚点改造前后的两种指向都算本包产物，避免 autoLink 关闭时漏摘旧锚点链接；副本比对仍以真源为准
          const kind = classifyExisting(dest, skill.linkTarget, undefined, skill.dir)
          if (kind === "absent") {
            result.missing.push(entry.name)
            changed = true
            continue
          }
          if (kind === "wrong" || kind === "file" || (kind === "dir" && !dirsEqual(skill.dir, dest))) {
            result.skippedForeign.push(entry.name)
            kept.push(entry)
            continue
          }
          if (options.dryRun) {
            result.removed.push(entry.name)
            continue
          }
          try {
            removeArtifact(dest)
            result.removed.push(entry.name)
            changed = true
          } catch {
            failed = true
            result.skippedForeign.push(entry.name)
            kept.push(entry)
          }
        }
        // 清理后目标目录已空则一并回收，避免留下空壳目录（dryRun 不动现场；非空或不可读时跳过）
        if (!options.dryRun && isEmptyDir(target.dir)) {
          try {
            rmSync(target.dir, { recursive: true, force: true })
            result.dirReclaimed = true
          } catch {
            // 回收失败不影响卸载结果：产物已清理，仅多留一个空目录
          }
        }
        results.push(result)
        if (kept.length > 0) nextTargets.push({ ...target, entries: kept })
      }
      if (nextTargets.length > 0) nextSources[sourceName] = { ...source, targets: nextTargets }
    }

    // 状态里未登记、但用户显式点名的旧名：按本工具形态链接兜底摘除，恢复改名后的卸载路径
    if (wanted) {
      const registered = new Set<string>()
      const dirs = new Set<string>()
      const roots = new Set<string>()
      for (const [sourceName, source] of Object.entries(state.sources)) {
        if (options.source && options.source !== sourceName) continue
        if (source.root) roots.add(source.root)
        for (const target of source.targets) {
          dirs.add(target.dir)
          for (const entry of target.entries) registered.add(entry.name)
        }
      }
      for (const entry of Object.values(readSkillsInstallConfig().sources ?? {})) {
        if (entry.root) roots.add(entry.root)
      }
      for (const name of [...wanted].filter((item) => !registered.has(item))) {
        for (const dir of dirs) {
          const dest = join(dir, name)
          if (!orphanArtifactRemovable(dest, [...roots])) continue
          if (!options.dryRun) {
            try {
              removeArtifact(dest)
            } catch {
              failed = true
              continue
            }
          }
          const existing = results.find((item) => pathKey(item.dir) === pathKey(dir))
          const bucket =
            existing ?? { dir, label: skillTargetLabel(dir) || null, removed: [], missing: [], skippedForeign: [], dirReclaimed: false }
          if (!existing) results.push(bucket)
          bucket.removed.push(name)
        }
      }
      // 旧名清理后目标目录若已空则一并回收，与常规卸载路径保持同一口径
      if (!options.dryRun) {
        for (const dir of dirs) {
          const bucket = results.find((item) => pathKey(item.dir) === pathKey(dir))
          if (!bucket || bucket.removed.length === 0 || !isEmptyDir(dir)) continue
          try {
            rmSync(dir, { recursive: true, force: true })
            bucket.dirReclaimed = true
          } catch {
            // 回收失败不影响移除结果：产物已清理，仅多留一个空目录
          }
        }
      }
    }

    const nothingLeft = results.every((result) => result.skippedForeign.length === 0)
    const stateRemoved = !options.dryRun && !failed && nothingLeft && Object.keys(nextSources).length === 0
    if (!options.dryRun) {
      if (stateRemoved) rmSync(stateFile, { force: true })
      else if (changed || Object.keys(nextSources).length !== Object.keys(state.sources).length) {
        writeSkillsState({ format: STATE_FORMAT, schemaVersion: STATE_SCHEMA_VERSION, updatedAt: new Date().toISOString(), sources: nextSources })
      }
    }
    return { stateFile, stateExists: true, targets: results, stateRemoved }
  } finally {
    release?.()
  }
}

// ===== 项目侧分发：仓库内唯一真源副本 + 各候选目录薄壳 =====

export interface ProjectInstallOptions {
  cwd?: string
  dirs?: string[]
  dryRun?: boolean
  force?: boolean
  // 本次安装的技能名；省略时安装包内全部技能
  skills?: string[]
  // 本次写入的薄壳目录（仓库根相对）；省略时沿用已保存选择，未保存过则写全部已存在候选目录
  targetDirs?: string[]
  // 是否把本次目录选择写回 projectSkills.targets；--no-save-agents 时为 false
  saveTargets?: boolean
  // 本次临时外部来源（--from）；永久来源从 skillsInstall.sources 读取
  externalSources?: ExternalSourceOption[]
  prune?: boolean
  // 本次选择是否写回配置；--no-skills 时为 false
  saveSelection?: boolean
  // 本次生效的安装模式；省略时读配置，默认 skills
  mode?: SkillsMode
}

// 逐技能结果归档：按动作分派到对应清单
function recordAction(result: ProjectDirResult, action: "created" | "updated" | "skipped" | "conflict", name: string): void {
  if (action === "created") result.created.push(name)
  else if (action === "updated") result.updated.push(name)
  else if (action === "skipped") result.skipped.push(name)
  else result.conflicts.push(name)
}

// 真源副本写入：缺则建；内容一致跳过；有本包归属记录或 --force 时刷新（升级场景），否则视为他人同名技能交人工
function applySourceCopy(source: string, dest: string, recorded: boolean, force: boolean, dryRun: boolean): "created" | "updated" | "skipped" | "conflict" {
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
function applyShell(file: string, expected: string, force: boolean, dryRun: boolean): "created" | "updated" | "skipped" | "conflict" {
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
export function installProjectSkills(options: ProjectInstallOptions = {}): ProjectInstallReport {
  const cwd = options.cwd ?? process.cwd()
  const sources = collectSources({ externalSources: options.externalSources, dryRun: options.dryRun })
  const allItems = sources.flatMap(sourceSkillItems)
  assertUniqueSkillNames(allItems)
  const items = filterSkillItems(allItems, options.skills)
  const selected = new Set(items.map((item) => item.name))
  const byName = new Map(allItems.map((item) => [item.name, { dir: item.dir, linkTarget: item.linkTarget }]))
  const targets = resolveProjectTargets(cwd)
  const root = targets.root
  const previous = readProjectState(root)
  const prevTarget = (sourceName: string, kind: "source" | "shell", dir: string): SkillStateTarget | undefined =>
    previous?.sources?.[sourceName]?.targets.find((target) => target.kind === kind && target.dir === dir)

  // 额外薄壳目录：只接受落在仓库内的取值，库外取值剔除并回报（降级不静默）
  const ignoredDirs: string[] = []
  const extraShellDirs: string[] = []
  for (const raw of options.dirs ?? []) {
    const abs = resolve(cwd, raw)
    if (!isInside(abs, root)) {
      ignoredDirs.push(raw)
      continue
    }
    const rel = toRepoRel(root, abs)
    if (rel !== targets.sourceDir && !extraShellDirs.includes(rel)) extraShellDirs.push(rel)
  }

  // 目录选择：显式参数 > 已保存选择 > 全部已存在候选目录；--dir 始终一次性追加
  const savedTargets = readProjectSkillsConfig(root).targets
  const requestedTargets = options.targetDirs ?? (savedTargets && savedTargets.length > 0 ? savedTargets : undefined)
  let selectedShellDirs: string[]
  if (requestedTargets === undefined) {
    selectedShellDirs = [...targets.shellDirs]
  } else {
    selectedShellDirs = []
    for (const raw of requestedTargets) {
      const abs = resolve(root, raw)
      if (!isInside(abs, root)) {
        console.warn(`⚠️ 忽略仓库之外的技能目录：${raw}`)
        continue
      }
      const rel = toRepoRel(root, abs)
      if (rel === targets.sourceDir) continue
      if (!existsSync(abs)) {
        console.warn(`⚠️ 忽略不存在的技能目录：${rel}（补齐目录后重跑即可）`)
        continue
      }
      if (!selectedShellDirs.includes(rel)) selectedShellDirs.push(rel)
    }
  }
  const shellDirs = [...selectedShellDirs.filter((dir) => !extraShellDirs.includes(dir)), ...extraShellDirs]

  const release = options.dryRun ? null : acquireSkillsLock(projectSkillsLockFile(root))
  try {
    const source: ProjectDirResult = { dir: targets.sourceDir, created: [], updated: [], skipped: [], conflicts: [], failed: [], pruned: [] }
    const sourceAbs = join(root, targets.sourceDir)
    const sourceEntriesBySource = new Map<string, SkillStateEntry[]>()
    for (const item of items) {
      const recorded = prevTarget(item.source, "source", targets.sourceDir)?.entries.some((entry) => entry.name === item.name) ?? false
      try {
        const action = applySourceCopy(item.dir, join(sourceAbs, item.name), recorded, Boolean(options.force), Boolean(options.dryRun))
        recordAction(source, action, item.name)
        if (action !== "conflict" && !options.dryRun) {
          sourceEntriesBySource.set(item.source, [...(sourceEntriesBySource.get(item.source) ?? []), { name: item.name, version: item.version, mode: "copy" }])
        }
      } catch (e) {
        source.failed.push({ name: item.name, reason: (e as Error).message })
      }
    }
    // 未选择的真源副本：内容与包内真源一致才清理，其余保留记录交人工
    if (options.prune && !options.dryRun) {
      for (const item of sources) source.pruned.push(...pruneEntries(prevTarget(item.name, "source", targets.sourceDir), selected, sourceAbs, byName))
    }
    const prunedSource = new Set(source.pruned)

    const shells: ProjectDirResult[] = []
    const nextBySource = new Map<string, SkillStateTarget[]>()
    for (const item of sources) nextBySource.set(item.name, [])
    for (const item of sources) {
      const previousTarget = prevTarget(item.name, "source", targets.sourceDir)
      const entries = [
        ...(sourceEntriesBySource.get(item.name) ?? []),
        ...(previousTarget?.entries.filter((entry) => !selected.has(entry.name) && !prunedSource.has(entry.name) && pathPresent(join(sourceAbs, entry.name))) ?? []),
      ]
      if (entries.length > 0) nextBySource.get(item.name)!.push({ id: "source", dir: targets.sourceDir, label: "真源副本", kind: "source", entries })
    }

    for (const dir of shellDirs) {
      const result: ProjectDirResult = { dir, created: [], updated: [], skipped: [], conflicts: [], failed: [], pruned: [] }
      const entriesBySource = new Map<string, SkillStateEntry[]>()
      for (const item of items) {
        const expected = buildSkillShell(item.name, targets.sourceDir, readSkillDescription(item.dir))
        try {
          const action = applyShell(join(root, dir, item.name, SKILL_ENTRY), expected, Boolean(options.force), Boolean(options.dryRun))
          recordAction(result, action, item.name)
          if (action !== "conflict" && !options.dryRun) {
            entriesBySource.set(item.source, [...(entriesBySource.get(item.source) ?? []), { name: item.name, version: item.version, mode: "shell" }])
          }
        } catch (e) {
          result.failed.push({ name: item.name, reason: (e as Error).message })
        }
      }
      // 曾用名迁移：旧名薄壳带本包标记才清理（标记即归属证明，旧真源已不存在、无从比对内容）
      for (const item of items) {
        for (const old of item.previousNames) {
          const oldDir = join(root, dir, old)
          const oldFile = join(oldDir, SKILL_ENTRY)
          if (!existsSync(oldFile)) continue
          let content: string
          try {
            content = readTextFile(oldFile)
          } catch {
            continue
          }
          if (readSkillShellVersion(content) === null) continue
          if (options.dryRun) {
            result.pruned.push(old)
            continue
          }
          try {
            removeArtifact(oldDir)
            result.pruned.push(old)
          } catch {
            // 清理失败保留现场，由状态报告暴露
          }
        }
      }
      if (options.prune && !options.dryRun) {
        for (const source of sources) {
          for (const entry of prevTarget(source.name, "shell", dir)?.entries ?? []) {
            if (selected.has(entry.name)) continue
            const file = join(root, dir, entry.name, SKILL_ENTRY)
            if (!existsSync(file)) continue
            const content = readTextFile(file)
            if (readSkillShellVersion(content) !== null) {
              removeArtifact(join(root, dir, entry.name))
              result.pruned.push(entry.name)
            }
          }
        }
      }
      const pruned = new Set(result.pruned)
      for (const source of sources) {
        const previousTarget = prevTarget(source.name, "shell", dir)
        const entries = [
          ...(entriesBySource.get(source.name) ?? []),
          ...(previousTarget?.entries.filter((entry) => !selected.has(entry.name) && !pruned.has(entry.name) && pathPresent(join(root, dir, entry.name))) ?? []),
        ]
        if (entries.length > 0) nextBySource.get(source.name)!.push({ id: dir, dir, label: "薄壳", kind: "shell", entries })
      }
      shells.push(result)
    }

    // 未参与本次选择的薄壳目录：默认保留产物与登记；显式收窄目录选择后，--prune 才清理带本包标记的薄壳
    const shellDirSet = new Set(shellDirs)
    const pruneDeselectedDirs = Boolean(options.prune) && requestedTargets !== undefined
    for (const source of sources) {
      for (const prev of previous?.sources?.[source.name]?.targets.filter((target) => target.kind === "shell") ?? []) {
        if (shellDirSet.has(prev.dir)) continue
        let entries = prev.entries
        if (pruneDeselectedDirs) {
          const result: ProjectDirResult = { dir: prev.dir, created: [], updated: [], skipped: [], conflicts: [], failed: [], pruned: [] }
          const kept: SkillStateEntry[] = []
          for (const entry of entries) {
            const skillDir = join(root, prev.dir, entry.name)
            const shellFile = join(skillDir, SKILL_ENTRY)
            if (!existsSync(shellFile)) continue
            let content: string
            try {
              content = readTextFile(shellFile)
            } catch {
              kept.push(entry)
              continue
            }
            if (readSkillShellVersion(content) === null) {
              kept.push(entry)
              continue
            }
            try {
              removeArtifact(skillDir)
              result.pruned.push(entry.name)
            } catch {
              kept.push(entry)
            }
          }
          entries = kept
          if (result.pruned.length > 0) shells.push(result)
        }
        if (entries.length > 0) nextBySource.get(source.name)!.push({ ...prev, entries })
      }
    }

    if (!options.dryRun) {
      const nextSources: Record<string, SkillStateSource> = {}
      for (const [name, previousSource] of Object.entries(previous?.sources ?? {})) {
        if (!sources.some((source) => source.name === name) && previousSource.targets.length > 0) nextSources[name] = previousSource
      }
      for (const item of sources) {
        const sourceTargets = nextBySource.get(item.name) ?? []
        if (sourceTargets.length > 0) {
          // 远程来源项目面不写缓存绝对路径：root 留空，只记地址与 ref
          nextSources[item.name] = {
            kind: item.kind,
            version: item.version,
            temporary: item.temporary,
            root: item.url ? "" : item.root,
            url: item.url,
            ref: item.ref,
            targets: sourceTargets,
          }
        }
      }
      writeProjectSources(root, nextSources)
      // 未显式传 skills 时本次即安装全部，同样保存选择集，保证 status 回显与现场一致；临时来源与 --no-skills 不写
      if (options.saveSelection !== false) saveProjectSelection(root, items.filter((item) => !item.temporary).map((item) => item.name))
      if (options.saveTargets !== false) saveProjectTargets(root, selectedShellDirs)
    }

    return {
      root,
      skills: items.map((item) => item.name),
      selection: items.map((item) => item.name),
      mode: options.mode ?? readProjectSkillsConfig(root).mode ?? "skills",
      targetSelection: shellDirs,
      source,
      shells,
      missingDirs: targets.missingDirs,
      ignoredDirs,
      stateFile: toRepoRel(root, projectStateFile(root)),
    }
  } finally {
    release?.()
  }
}

// 保存项目选择集：只合并 projectSkills 段；失败只告警（产物已写入）
function saveProjectSelection(root: string, names: string[]): void {
  try {
    const config = readProjectSkillsConfig(root)
    writeProjectSkillsConfig({ targets: config.targets, selection: names }, root)
  } catch (e) {
    console.warn(`⚠️ 项目面技能选择保存失败：${(e as Error).message}`)
  }
}

// 保存项目目录选择：只合并 projectSkills.targets，保留 selection
function saveProjectTargets(root: string, names: string[]): void {
  try {
    writeProjectSkillsConfig({ targets: [...new Set(names)] }, root)
  } catch (e) {
    console.warn(`⚠️ 项目面目录选择保存失败：${(e as Error).message}`)
  }
}

// 写项目状态：覆盖本次来源、保留未参与的历史来源；全部为空时删除归属账
function writeProjectSources(root: string, sources: Record<string, SkillStateSource>): void {
  const cleaned = Object.fromEntries(Object.entries(sources).filter(([, source]) => source.targets.length > 0))
  if (Object.keys(cleaned).length === 0) {
    removeProjectStateFile(root)
    return
  }
  writeProjectState(root, cleaned)
}

// 清空项目选择：remove 默认清空全部 selection，--skills 只清指定名字
function clearProjectSelection(cwd: string, skills?: string[]): void {
  const config = readProjectSkillsConfig(cwd)
  if (!config.selection) return
  if (!skills) {
    writeProjectSkillsConfig({ selection: undefined }, cwd)
    return
  }
  const dropping = new Set(skills)
  const kept = config.selection.filter((name) => !dropping.has(name))
  writeProjectSkillsConfig({ selection: kept.length > 0 ? kept : undefined }, cwd)
}

// 项目侧卸载：只清理项目态账记载的产物——真源副本内容与包内真源一致才删，薄壳带本包标记才删，其余交人工
// 顺序：先清项目选择配置（失败即中止）→ 清产物 → 重写/删除状态
export function removeProjectSkills(options: { cwd?: string; dryRun?: boolean; skills?: string[] } = {}): ProjectRemoveReport {
  const cwd = options.cwd ?? process.cwd()
  const targets = resolveProjectTargets(cwd)
  const root = targets.root
  const file = projectStateFile(root)
  const stateFile = toRepoRel(root, file)
  if (!options.dryRun) clearProjectSelection(root, options.skills)
  const state = readProjectState(root)
  if (!state) return { root, stateFile, stateExists: false, sourceDir: targets.sourceDir, dirs: [], reclaimed: [], stateRemoved: false }

  const wanted = options.skills ? new Set(options.skills) : null
  const sourceByName = new Map(listPackageSkills().map((skill) => [skill.name, skill.dir]))
  const dirs: ProjectRemoveResult[] = []
  const reclaimed: string[] = []
  const nextSources: Record<string, SkillStateSource> = {}
  let failed = false
  let changed = false

  for (const [sourceName, source] of Object.entries(state.sources)) {
    const nextTargets: SkillStateTarget[] = []
    for (const target of source.targets) {
      if (target.kind !== "source" && target.kind !== "shell") continue
      const result: ProjectRemoveResult = { dir: target.dir, kind: target.kind, removed: [], missing: [], skippedForeign: [] }
      const kept: SkillStateEntry[] = []
      for (const entry of target.entries) {
        if (wanted && !wanted.has(entry.name)) {
          kept.push(entry)
          continue
        }
        const skillDir = join(root, target.dir, entry.name)
        const present = target.kind === "source" ? existsSync(skillDir) : existsSync(join(skillDir, SKILL_ENTRY))
        if (!present) {
          result.missing.push(entry.name)
          changed = true
          continue
        }
        const consistent = target.kind === "source" ? consistentSourceCopy(skillDir, sourceByName.get(entry.name)) : consistentShell(skillDir)
        if (!consistent) {
          result.skippedForeign.push(entry.name)
          kept.push(entry)
          continue
        }
        if (options.dryRun) {
          result.removed.push(entry.name)
          continue
        }
        try {
          removeArtifact(skillDir)
          result.removed.push(entry.name)
          changed = true
        } catch {
          failed = true
          result.skippedForeign.push(entry.name)
          kept.push(entry)
        }
      }
      dirs.push(result)
      if (kept.length > 0) nextTargets.push({ ...target, entries: kept })
    }
    if (nextTargets.length > 0) nextSources[sourceName] = { ...source, targets: nextTargets }
  }

  // 目录回收：真源目录与薄壳目录清空后一并回收（仅在 isEmptyDir 为真时递归删，避免误删其他内容）
  if (!options.dryRun) {
    for (const dir of [targets.sourceDir, ...state.sources[BUILTIN_SOURCE]?.targets.filter((target) => target.kind === "shell").map((target) => target.dir) ?? []]) {
      const abs = join(root, dir)
      if (!existsSync(abs) || !isEmptyDir(abs)) continue
      try {
        rmSync(abs, { recursive: true, force: true })
        reclaimed.push(dir)
      } catch {
        // 回收失败不影响卸载结果：产物已清理，仅多留一个空目录
      }
    }
  }

  const nothingLeft = dirs.every((result) => result.skippedForeign.length === 0)
  const stateRemoved = !options.dryRun && !failed && nothingLeft && Object.keys(nextSources).length === 0
  if (!options.dryRun) {
    if (stateRemoved) removeProjectStateFile(root)
    else if (changed || Object.keys(nextSources).length !== Object.keys(state.sources).length) {
      writeProjectState(root, nextSources)
    }
  }
  return { root, stateFile, stateExists: true, sourceDir: targets.sourceDir, dirs, reclaimed, stateRemoved }
}

// 真源副本一致性：包内仍有该技能且内容逐字一致
function consistentSourceCopy(dest: string, sourceDir: string | undefined): boolean {
  return Boolean(sourceDir) && dirsEqual(sourceDir as string, dest)
}

// 薄壳一致性：带本包标记即可安全删除（内容已由真源派生，不逐字比对）
function consistentShell(skillDir: string): boolean {
  try {
    return readSkillShellVersion(readTextFile(join(skillDir, SKILL_ENTRY))) !== null
  } catch {
    return false
  }
}

// 链接自愈（skills.autoLink，默认 true）：只对状态文件记载的链接做补链与修链
// 不含首次安装、不含升级副本；CI 环境跳过，任何失败静默（不阻塞用户命令）
// 现场被替换为实体目录/普通文件时默认清理重建；skills.autoLinkReplaceForeign=false 则一律不动
export function autoLinkSkills(): number {
  const section = getConfigSection("skills")
  if (section?.autoLink === false) return 0
  if (isCiEnv()) return 0
  const state = readSkillsState()
  if (!state) return 0

  // 真源技能名集合：一次列目录替代循环内逐条探活，且只收真实存在（可解析）的名字
  const sourceRoot = skillsSourceDir()
  let sourceNames: Set<string>
  try {
    sourceNames = new Set(readdirSync(sourceRoot).filter((name) => existsSync(join(sourceRoot, name))))
  } catch {
    return 0
  }

  // 期望链接目标：稳定锚点（升级时锚点由 pnpm 重写，链接不随版本段失效）
  const linkDir = skillsLinkDir()
  const replaceForeign = section?.autoLinkReplaceForeign !== false
  const linkType = process.platform === "win32" ? "junction" : "dir"

  let repaired = 0
  const nextSources: Record<string, SkillStateSource> = {}
  for (const [sourceName, source] of Object.entries(state.sources)) {
    const nextTargets: SkillStateTarget[] = []
    for (const target of source.targets) {
      let dirents
      try {
        dirents = readdirSync(target.dir, { withFileTypes: true })
      } catch {
        nextTargets.push(target)
        continue
      }
      const present = new Map(dirents.map((dirent) => [dirent.name, dirent]))
      const entries = target.entries.filter((entry) => {
        // 非链接形态不参与自愈；已不在包内则剔除记录
        if (entry.mode !== "link") return sourceNames.has(entry.name)
        if (!sourceNames.has(entry.name)) return false
        const linkTarget = join(linkDir, entry.name)
        const dest = join(target.dir, entry.name)
        const dirent = present.get(entry.name)
        const kind = dirent ? classifyExisting(dest, linkTarget, dirent) : "absent"
        if (kind === "link-ok") return true
        // 非替换模式：现场是实体目录/普通文件时一律不动，记录照留（用户可显式 install --force 处置）
        if (!replaceForeign && (kind === "dir" || kind === "file")) return true
        // 悬空或指向其他版本：删链重建；实体目录/文件按开关先清理
        try {
          if (kind !== "absent") removeArtifact(dest)
          symlinkSync(linkTarget, dest, linkType)
          repaired += 1
          return true
        } catch {
          // 重建失败不改记账：本条仍是本包登记的产物，留着下次再试
          return true
        }
      })
      nextTargets.push({ ...target, entries })
    }
    nextSources[sourceName] = { ...source, targets: nextTargets }
  }
  if (repaired > 0) writeSkillsState({ format: STATE_FORMAT, schemaVersion: STATE_SCHEMA_VERSION, updatedAt: new Date().toISOString(), sources: nextSources })
  return repaired
}
