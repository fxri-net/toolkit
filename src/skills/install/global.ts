// 技能安装与卸载（global）：自 install.ts 按面拆分，逻辑逐字未改
import { existsSync, lstatSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { getHomeDir } from "../../config"
import { writeFileAtomic } from "../../write-atomic"
import { assertUniqueSkillNames, classifyExisting, dirsEqual, isEmptyDir, pathKey, pathPresent, removeArtifact, resolveSkillTargets, resolveTargetsByName, skillTargetLabel, skillsSourceDir, sourceSkillItems, targetId, writeArtifact, type SkillSource } from "../source"
import { acquireSkillsLock, skillsLockFile } from "../lock"
import { readSkillsState, skillsStateFile, writeSkillsState } from "../state"
import { readSkillsInstallConfig, writeSkillsInstallConfig } from "../config"
import { STATE_FORMAT, STATE_SCHEMA_VERSION, type InstallReport, type RemoveResult, type SkillStateEntry, type SkillStateSource, type SkillStateTarget, type SkillItem, type SkillsRemoveReport, type TargetInstallResult } from "../types"
import { collectSources, filterSkillItems, orphanArtifactRemovable, pruneEntries, sourceSkillMap, type InstallOptions, type RemoveSkillsOptions } from "./common"


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

