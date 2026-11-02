// 技能安装与卸载：全局（软链 / 副本到各 agent 目录）与项目（唯一真源副本 + 各候选目录薄壳）
// 安装按选择集写产物；--prune 只清理本包登记且内容一致的未选择产物；remove 顺序为「配置 → 产物 → 状态」
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { getConfigSection } from "../config"
import { writeFileAtomic } from "../write-atomic"
import { readTextFile } from "../read-text"
import {
  buildSkillShell,
  classifyExisting,
  copyArtifact,
  currentSkillShellVersion,
  dirsEqual,
  isEmptyDir,
  isInside,
  listPackageSkills,
  packageVersion,
  pathKey,
  readSkillDescription,
  readSkillShellVersion,
  removeArtifact,
  resolveProjectTargets,
  resolveSkillTargets,
  skillTargetLabel,
  skillsLinkDir,
  skillsSourceDir,
  targetId,
  toRepoRel,
  writeArtifact,
} from "./source"
import {
  projectStateFile,
  readProjectState,
  readSkillsState,
  removeProjectStateFile,
  skillsStateFile,
  targetsByDir,
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
  type PackageSkill,
  type ProjectDirResult,
  type ProjectInstallReport,
  type ProjectRemoveReport,
  type ProjectRemoveResult,
  type RemoveResult,
  type SkillStateEntry,
  type SkillStateSource,
  type SkillStateTarget,
  type SkillsRemoveReport,
  type SkillsState,
  type TargetInstallResult,
} from "./types"

export interface InstallOptions {
  copy?: boolean
  dirs?: string[]
  dryRun?: boolean
  force?: boolean
  // 本次安装的技能名；省略时安装包内全部技能（库调用默认值，CLI 总会显式传入选择集）
  skills?: string[]
  // 清理未选择且内容一致的本包产物
  prune?: boolean
}

export interface RemoveSkillsOptions {
  dryRun?: boolean
  // 只清理指定技能的选择与产物；省略时清空全部选择
  skills?: string[]
}

// 按选择集过滤包内技能：未知名称告警后剔除（降级不静默）
function filterSkills(skills: PackageSkill[], requested?: string[]): PackageSkill[] {
  if (!requested) return skills
  const unknown = requested.filter((name) => !skills.some((skill) => skill.name === name))
  if (unknown.length > 0) console.warn(`⚠️ 忽略包内不存在的技能：${unknown.join("、")}`)
  const wanted = new Set(requested)
  return skills.filter((skill) => wanted.has(skill.name))
}

// 状态条目：按实际产物形态生成
function entriesFromResult(result: TargetInstallResult, skills: PackageSkill[]): SkillStateEntry[] {
  const links = new Set(result.links)
  const copies = new Set(result.copies)
  return skills
    .filter((skill) => links.has(skill.name) || copies.has(skill.name))
    .map((skill) => ({ name: skill.name, version: skill.version, mode: links.has(skill.name) ? "link" : "copy" }))
}

// 保留未选择但仍有产物的历史条目：已不存在的现场记录一并剔除
function carryEntries(previous: SkillStateTarget | undefined, selected: Set<string>, dir: string, keepNames?: Set<string>): SkillStateEntry[] {
  if (!previous) return []
  return previous.entries.filter((entry) => !selected.has(entry.name) && (!keepNames || keepNames.has(entry.name)) && existsSync(join(dir, entry.name)))
}

// 清理未选择的本包产物：只删链接指向本包 / 副本内容与真源一致的条目
function pruneUnselected(previous: SkillStateTarget | undefined, selected: Set<string>, dir: string, sourceDir: string, linkDir: string): string[] {
  if (!previous) return []
  const pruned: string[] = []
  for (const entry of previous.entries) {
    if (selected.has(entry.name)) continue
    const dest = join(dir, entry.name)
    const source = join(sourceDir, entry.name)
    const kind = classifyExisting(dest, join(linkDir, entry.name), undefined, source)
    const consistent = kind === "link-ok" || (kind === "dir" && existsSync(source) && dirsEqual(source, dest))
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
  const allSkills = listPackageSkills()
  const skills = filterSkills(allSkills, options.skills)
  const selected = new Set(skills.map((skill) => skill.name))
  const targets = resolveSkillTargets(options.dirs ?? [])
  // 期望链接目标：锚点目录下逐技能一项；判型与写链都用它，保证链接指向跨版本存活的入口
  const linkDir = skillsLinkDir()
  const sourceDir = skillsSourceDir()
  const previous = readSkillsState()
  const previousByDir = targetsByDir(previous)

  const results: TargetInstallResult[] = []
  const skippedTargets: Array<{ dir: string; label: string }> = []
  const nextTargets: SkillStateTarget[] = []

  for (const target of targets) {
    // 目标不可用（agent 未安装）只报告不创建，避免在用户机器上凭空造目录；历史记录原样保留
    if (!target.available) {
      skippedTargets.push({ dir: target.dir, label: target.label })
      const carried = carryEntries(previousByDir.get(pathKey(target.dir)), new Set(), target.dir)
      if (carried.length > 0) {
        const old = previousByDir.get(pathKey(target.dir))
        nextTargets.push({ id: old?.id ?? targetId(target.dir, target.kind), dir: target.dir, label: target.label, kind: target.kind, entries: carried })
      }
      continue
    }
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
    }
    const previousEntry = previousByDir.get(pathKey(target.dir))
    for (const skill of skills) {
      const dest = join(target.dir, skill.name)
      const linkTarget = join(linkDir, skill.name)
      const kind = classifyExisting(dest, linkTarget)
      // 既有登记：本目标下该技能此前是否由本包以副本形式写入——决定 --force 与裸 install 的落点形态
      const recordedCopyHere = previousEntry?.entries.some((entry) => entry.name === skill.name && entry.mode === "copy") ?? false
      if (kind === "link-ok") {
        result.skipped.push(skill.name)
        result.links.push(skill.name)
        continue
      }
      if (kind === "dir" && !options.force) {
        // 实体目录：若状态文件记载为本包副本则比对内容，否则视为用户自装技能不覆盖
        if (!recordedCopyHere) {
          result.conflicts.push(skill.name)
          continue
        }
        if (dirsEqual(skill.dir, dest)) {
          result.skipped.push(skill.name)
          result.copies.push(skill.name)
          continue
        }
      }
      if (kind === "file" && !options.force) {
        result.conflicts.push(skill.name)
        continue
      }
      // 落点形态沿用既有登记：已登记的副本仍是副本，--force 只解除冲突判定、不把副本翻回软链
      const useCopy = Boolean(options.copy) || (kind === "dir" && recordedCopyHere)
      if (options.dryRun) {
        if (kind === "absent") result.created.push(skill.name)
        else result.updated.push(skill.name)
        if (useCopy) result.copies.push(skill.name)
        else result.links.push(skill.name)
        continue
      }
      try {
        if (!(kind === "absent")) removeArtifact(dest)
        const written = writeArtifact(linkTarget, skill.dir, dest, useCopy)
        if (kind === "absent") result.created.push(skill.name)
        else result.updated.push(skill.name)
        if (written.mode === "link") {
          result.links.push(skill.name)
        } else {
          result.copies.push(skill.name)
          if (written.reason) result.degraded.push({ name: skill.name, reason: written.reason })
        }
      } catch (e) {
        result.failed.push({ name: skill.name, reason: (e as Error).message })
      }
    }
    if (options.prune && !options.dryRun) result.pruned = pruneUnselected(previousEntry, selected, target.dir, sourceDir, linkDir)
    results.push(result)
    if (!options.dryRun) {
      const prunedSet = new Set(result.pruned)
      const entries = [
        ...entriesFromResult(result, skills),
        ...(previousEntry?.entries.filter((entry) => !selected.has(entry.name) && !prunedSet.has(entry.name) && existsSync(join(target.dir, entry.name))) ?? []),
      ]
      if (entries.length > 0) {
        nextTargets.push({ id: previousEntry?.id ?? targetId(target.dir, target.kind), dir: target.dir, label: target.label, kind: target.kind, entries })
      }
    }
  }

  if (!options.dryRun) {
    // 本次真正写入的目标取新记录；未参与本次运行的历史目标原样保留，卸载时仍能清理旧产物
    const written = new Set(results.map((result) => pathKey(result.dir)))
    const carried = previousTargets(previous).filter((target) => !written.has(pathKey(target.dir)) && target.entries.length > 0)
    writeGlobalState([...nextTargets, ...carried], previous)
    // 未显式传 skills 时本次即安装全部，同样保存选择集，保证 status 回显与现场一致
    saveGlobalSelection(skills.map((skill) => skill.name))
  }

  return {
    source: sourceDir,
    skills: skills.map((skill) => skill.name),
    selection: skills.map((skill) => skill.name),
    targets: results,
    skippedTargets,
    stateFile: skillsStateFile(),
  }
}

// 取状态里的全部目标（本任务只有内置源，仍按来源展开以兼容后续扩展）
function previousTargets(state: SkillsState | null): SkillStateTarget[] {
  if (!state) return []
  return Object.values(state.sources).flatMap((source) => source.targets)
}

// 保存全局选择集：只合并 skillsInstall 段，保留 targets / sources 与其他来源的选择
function saveGlobalSelection(names: string[]): void {
  try {
    const config = readSkillsInstallConfig()
    const selection = { ...(config.selection ?? {}), [BUILTIN_SOURCE]: names }
    writeSkillsInstallConfig({ selection })
  } catch (e) {
    // 配置写入失败不回滚已安装产物：状态已记录，下次安装会重试保存
    console.warn(`⚠️ 技能选择保存失败：${(e as Error).message}`)
  }
}

// 写全局状态：保留其他来源，重建内置源目标；没有任何目标时不写盘（避免空壳状态文件）
function writeGlobalState(targets: SkillStateTarget[], previous: SkillsState | null): void {
  const sources: Record<string, SkillStateSource> = { ...(previous?.sources ?? {}) }
  sources[BUILTIN_SOURCE] = { kind: "builtin", version: packageVersion(), temporary: false, targets }
  const hasAny = Object.values(sources).some((source) => source.targets.length > 0)
  if (!hasAny) return
  writeSkillsState({ format: STATE_FORMAT, schemaVersion: STATE_SCHEMA_VERSION, updatedAt: new Date().toISOString(), sources })
}

// 清空全局选择：remove 默认清空全部 selection，--skills 只清指定名字；保留 targets / sources 偏好
function clearGlobalSelection(skills?: string[]): void {
  const config = readSkillsInstallConfig()
  if (!config.selection) return
  if (!skills) {
    writeSkillsInstallConfig({ selection: undefined })
    return
  }
  const dropping = new Set(skills)
  const next: Record<string, string[]> = {}
  for (const [source, names] of Object.entries(config.selection)) {
    const kept = names.filter((name) => !dropping.has(name))
    if (kept.length > 0) next[source] = kept
  }
  writeSkillsInstallConfig({ selection: Object.keys(next).length > 0 ? next : undefined })
}

// 卸载：只处理状态文件记载的本包产物；链接（含悬空）直接摘除，副本内容与真源一致才删，其余交人工确认
// 顺序：先清选择配置（失败即中止、不删产物）→ 清产物 → 重写状态
export function removeSkills(options: RemoveSkillsOptions = {}): SkillsRemoveReport {
  const stateFile = skillsStateFile()
  // 配置写失败直接向上抛出：调用方捕获后不得继续删产物；预演不改任何文件
  if (!options.dryRun) clearGlobalSelection(options.skills)
  const state = readSkillsState()
  if (!state) return { stateFile, stateExists: false, targets: [], stateRemoved: false }

  const wanted = options.skills ? new Set(options.skills) : null
  const sourceDir = skillsSourceDir()
  const linkDir = skillsLinkDir()
  const results: RemoveResult[] = []
  let failed = false
  let changed = false
  const nextSources: Record<string, SkillStateSource> = {}

  for (const [sourceName, source] of Object.entries(state.sources)) {
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
        const sourcePath = join(sourceDir, entry.name)
        // 链接锚点改造前后的两种指向都算本包产物，避免 autoLink 关闭时漏摘旧锚点链接；副本比对仍以真源为准
        const kind = classifyExisting(dest, sourcePath, undefined, join(linkDir, entry.name))
        if (kind === "absent") {
          result.missing.push(entry.name)
          changed = true
          continue
        }
        if (kind === "wrong" || kind === "file" || (kind === "dir" && !dirsEqual(sourcePath, dest))) {
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

  const nothingLeft = results.every((result) => result.skippedForeign.length === 0)
  const stateRemoved = !options.dryRun && !failed && nothingLeft && Object.keys(nextSources).length === 0
  if (!options.dryRun) {
    if (stateRemoved) rmSync(stateFile, { force: true })
    else if (changed || Object.keys(nextSources).length !== Object.keys(state.sources).length) {
      writeSkillsState({ format: STATE_FORMAT, schemaVersion: STATE_SCHEMA_VERSION, updatedAt: new Date().toISOString(), sources: nextSources })
    }
  }
  return { stateFile, stateExists: true, targets: results, stateRemoved }
}

// ===== 项目侧分发：仓库内唯一真源副本 + 各候选目录薄壳 =====

export interface ProjectInstallOptions {
  cwd?: string
  dirs?: string[]
  dryRun?: boolean
  force?: boolean
  // 本次安装的技能名；省略时安装包内全部技能
  skills?: string[]
  prune?: boolean
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
  const skills = filterSkills(listPackageSkills(), options.skills)
  const selected = new Set(skills.map((skill) => skill.name))
  const targets = resolveProjectTargets(cwd)
  const root = targets.root
  const previous = readProjectState(root)
  const prevTargets = previousTargets(previous)
  const prevSource = prevTargets.find((target) => target.kind === "source" && target.dir === targets.sourceDir)
  const prevShells = new Map(prevTargets.filter((target) => target.kind === "shell").map((target) => [target.dir, target]))
  const recordedNames = new Set(prevSource?.entries.map((entry) => entry.name) ?? [])

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
  const shellDirs = [...targets.shellDirs.filter((dir) => !extraShellDirs.includes(dir)), ...extraShellDirs]

  const source: ProjectDirResult = { dir: targets.sourceDir, created: [], updated: [], skipped: [], conflicts: [], failed: [], pruned: [] }
  const sourceAbs = join(root, targets.sourceDir)
  const sourceEntries: SkillStateEntry[] = []
  for (const skill of skills) {
    try {
      const action = applySourceCopy(skill.dir, join(sourceAbs, skill.name), recordedNames.has(skill.name), Boolean(options.force), Boolean(options.dryRun))
      recordAction(source, action, skill.name)
      if (action !== "conflict" && !options.dryRun) sourceEntries.push({ name: skill.name, version: skill.version, mode: "copy" })
    } catch (e) {
      source.failed.push({ name: skill.name, reason: (e as Error).message })
    }
  }
  // 未选择的真源副本：内容与包内真源一致才清理，其余保留记录交人工
  if (options.prune && !options.dryRun) {
    for (const entry of prevSource?.entries ?? []) {
      if (selected.has(entry.name)) continue
      const dest = join(sourceAbs, entry.name)
      const skill = listPackageSkills().find((item) => item.name === entry.name)
      if (skill && existsSync(dest) && dirsEqual(skill.dir, dest)) {
        removeArtifact(dest)
        source.pruned.push(entry.name)
      }
    }
  }
  const prunedSource = new Set(source.pruned)
  const carriedSource =
    prevSource?.entries.filter((entry) => !selected.has(entry.name) && !prunedSource.has(entry.name) && existsSync(join(sourceAbs, entry.name))) ?? []
  sourceEntries.push(...carriedSource)

  const shells: ProjectDirResult[] = []
  const shellTargets: SkillStateTarget[] = []
  for (const dir of shellDirs) {
    const result: ProjectDirResult = { dir, created: [], updated: [], skipped: [], conflicts: [], failed: [], pruned: [] }
    const prev = prevShells.get(dir)
    const entries: SkillStateEntry[] = []
    for (const skill of skills) {
      const expected = buildSkillShell(skill.name, targets.sourceDir, readSkillDescription(skill.dir))
      try {
        const action = applyShell(join(root, dir, skill.name, SKILL_ENTRY), expected, Boolean(options.force), Boolean(options.dryRun))
        recordAction(result, action, skill.name)
        if (action !== "conflict" && !options.dryRun) entries.push({ name: skill.name, version: skill.version, mode: "shell" })
      } catch (e) {
        result.failed.push({ name: skill.name, reason: (e as Error).message })
      }
    }
    if (options.prune && !options.dryRun) {
      for (const entry of prev?.entries ?? []) {
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
    const pruned = new Set(result.pruned)
    entries.push(...(prev?.entries.filter((entry) => !selected.has(entry.name) && !pruned.has(entry.name) && existsSync(join(root, dir, entry.name))) ?? []))
    shells.push(result)
    if (entries.length > 0) shellTargets.push({ id: dir, dir, label: "薄壳", kind: "shell", entries })
  }

  if (!options.dryRun) {
    const nextTargets: SkillStateTarget[] = []
    if (sourceEntries.length > 0) nextTargets.push({ id: "source", dir: targets.sourceDir, label: "真源副本", kind: "source", entries: sourceEntries })
    nextTargets.push(...shellTargets)
    writeProjectState(root, { [BUILTIN_SOURCE]: { kind: "builtin", version: packageVersion(), temporary: false, targets: nextTargets } })
    // 未显式传 skills 时本次即安装全部，同样保存选择集，保证 status 回显与现场一致
    saveProjectSelection(root, skills.map((skill) => skill.name))
  }

  return {
    root,
    skills: skills.map((skill) => skill.name),
    selection: skills.map((skill) => skill.name),
    source,
    shells,
    missingDirs: targets.missingDirs,
    ignoredDirs,
    stateFile: toRepoRel(root, projectStateFile(root)),
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
  if (process.env.CI) return 0
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
