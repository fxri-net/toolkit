// 技能安装与卸载（project）：自 install.ts 按面拆分，逻辑逐字未改
import { existsSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { readTextFile } from "../../read-text"
import { assertUniqueSkillNames, buildSkillShell, isEmptyDir, isInside, listPackageSkills, pathPresent, readSkillDescription, readSkillShellVersion, removeArtifact, resolveProjectTargets, sourceSkillItems, toRepoRel } from "../source"
import { acquireSkillsLock, projectSkillsLockFile } from "../lock"
import { projectStateFile, readProjectState, removeProjectStateFile, writeProjectState } from "../state"
import { readProjectSkillsConfig, writeProjectSkillsConfig } from "../config"
import { BUILTIN_SOURCE, SKILL_ENTRY, type ProjectDirResult, type ProjectInstallReport, type ProjectRemoveReport, type ProjectRemoveResult, type SkillStateEntry, type SkillStateSource, type SkillStateTarget, type SkillsMode } from "../types"
import { applyShell, applySourceCopy, collectSources, consistentShell, consistentSourceCopy, filterSkillItems, pruneEntries, recordAction, type ExternalSourceOption } from "./common"


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
