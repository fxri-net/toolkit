// 技能现场状态：全局（软链 / 副本）与项目（真源副本 + 薄壳）两面体检，按来源统一呈现
// missing 只表示「已选择但缺失」；未选择且无产物不展示；未选择但有产物单列 installed-unselected，不计入 problems
import { existsSync, lstatSync, readlinkSync } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import {
  buildSkillShell,
  classifyExisting,
  currentSkillShellVersion,
  dirsEqual,
  findSkillVersionMismatches,
  isEmptyDir,
  legacySkillDirLabel,
  listDirEntries,
  pathKey,
  readSkillDescription,
  readSkillShellVersion,
  resolveBuiltinSource,
  resolveCanonicalReaders,
  resolveLocalSource,
  resolveProjectTargets,
  resolveSkillTargets,
  skillTargetLabel,
  skillsSourceDir,
  sourceSkillItems,
  stripTailSep,
  toRepoRel,
  type ExistingKind,
} from "./source"
import { projectStateFile, readProjectState, readSkillsState, skillsStateFile } from "./state"
import { readProjectSkillsConfig, readSkillsInstallConfig } from "./config"
import { readTextFile } from "../read-text"
import {
  BUILTIN_SOURCE,
  SKILL_ENTRY,
  type PackageSkill,
  type ProjectDirStatus,
  type ProjectItemState,
  type ProjectSkillItem,
  type ProjectStatusReport,
  type SkillItemState,
  type SkillSourceStatus,
  type SkillStateEntry,
  type SkillStateTarget,
  type SkillsStatusReport,
  type SkillStatusItem,
  type SkillTier,
  type TargetStatus,
} from "./types"

// 状态判定所需的技能真源信息：按技能名索引，跨来源唯一（安装时已保证同名报错）
interface SkillRef {
  source: string
  version: string
  dir: string
  linkTarget: string
  tier: SkillTier
}

// 技能名 → 状态条目：同一目标内按名字取登记
function entryMap(target: SkillStateTarget | undefined): Map<string, SkillStateEntry> {
  return new Map((target?.entries ?? []).map((entry) => [entry.name, entry]))
}

// 状态文件里的条目版本：来源已失效时作为版本兜底
function stateVersions(state: ReturnType<typeof readSkillsState>): Map<string, string> {
  const map = new Map<string, string>()
  for (const source of Object.values(state?.sources ?? {})) {
    for (const target of source.targets) {
      for (const entry of target.entries) map.set(entry.name, entry.version)
    }
  }
  return map
}

// 收集状态呈现所需的来源与技能真源：内置源 + 已登记永久来源 + 状态中的临时来源
function collectStatusSources(state: ReturnType<typeof readSkillsState>): { refs: Map<string, SkillRef>; sources: SkillSourceStatus[] } {
  const refs = new Map<string, SkillRef>()
  const sources: SkillSourceStatus[] = []
  const fallbackVersions = stateVersions(state)
  const addSource = (name: string, kind: "builtin" | "local", root: string, version: string, temporary: boolean, skills: PackageSkill[]) => {
    if (sources.some((source) => source.name === name)) return
    sources.push({ name, kind, root, version, temporary, skills: skills.map((skill) => skill.name) })
    for (const item of skills) {
      if (refs.has(item.name)) continue
      refs.set(item.name, {
        source: name,
        version: item.version,
        dir: item.dir,
        linkTarget: kind === "builtin" ? join(root, "skills", item.name) : item.dir,
        tier: item.tier,
      })
    }
  }

  const builtin = resolveBuiltinSource()
  addSource(builtin.name, "builtin", builtin.root, builtin.version, false, builtin.skills)
  // 内置源链接锚在 pnpm 稳定入口，不能用包根拼
  for (const item of sourceSkillItems(builtin)) {
    refs.set(item.name, { source: item.source, version: item.version, dir: item.dir, linkTarget: item.linkTarget, tier: item.tier })
  }

  const config = readSkillsInstallConfig()
  for (const [name, entry] of Object.entries(config.sources ?? {})) {
    if (sources.some((source) => source.name === name)) continue
    try {
      const source = resolveLocalSource(entry.root, { name, temporary: false })
      addSource(source.name, "local", source.root, source.version, false, source.skills)
    } catch {
      // 失效来源由安装侧告警；状态侧不阻断其余来源
    }
  }

  for (const [name, source] of Object.entries(state?.sources ?? {})) {
    if (sources.some((item) => item.name === name)) continue
    let skills: PackageSkill[] = []
    if (source.root && existsSync(source.root)) {
      try {
        skills = resolveLocalSource(source.root, { name, temporary: source.temporary }).skills
      } catch {
        skills = []
      }
    }
    // 来源不可解析时按状态条目兜底：仍能呈现现场与版本，缺真源无法比对的条目按冲突/悬空上报
    const names = new Set(skills.map((skill) => skill.name))
    for (const target of source.targets) for (const entry of target.entries) names.add(entry.name)
    const synthetic: PackageSkill[] = [...names].map((skillName) => {
      const resolved = skills.find((skill) => skill.name === skillName)
      if (resolved) return resolved
      const dir = source.root ? join(source.root, skillName) : skillName
      return { name: skillName, dir, version: fallbackVersions.get(skillName) ?? "", tier: "optional", requires: [] }
    })
    addSource(name, source.kind === "builtin" ? "builtin" : "local", source.root, source.version, source.temporary, synthetic)
    // 兜底条目的链接指向按来源根拼，来源缺失时表现为悬空
    if (synthetic.length > 0 && source.kind !== "builtin") {
      for (const skill of synthetic) {
        const current = refs.get(skill.name)
        if (current) refs.set(skill.name, { ...current, linkTarget: skill.dir })
      }
    }
  }
  return { refs, sources }
}

// 无真源信息时的现场判型：链接按目标是否存在判悬空，实体按目录 / 文件分类
function classifyOrphan(dest: string): ExistingKind {
  let stat
  try {
    stat = lstatSync(dest)
  } catch {
    return "absent"
  }
  if (!stat.isSymbolicLink()) return stat.isDirectory() ? "dir" : "file"
  try {
    const target = readlinkSync(dest)
    const abs = stripTailSep(isAbsolute(target) ? target : join(dirname(dest), target))
    return existsSync(abs) ? "wrong" : "dangling"
  } catch {
    return "dangling"
  }
}

// 状态判定的技能名集合：已选择技能 ∪ 该目标既有登记 ∪ 目录内实际存在的技能
function statusNames(selected: Set<string>, recorded?: SkillStateTarget, present: string[] = []): string[] {
  const names = new Set([...selected, ...(recorded?.entries.map((entry) => entry.name) ?? []), ...present])
  return [...names].sort()
}

// 目录内实际存在的已知技能名
function presentSkillNames(dir: string, known: Set<string>): string[] {
  return listDirEntries(dir)
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((name) => known.has(name))
}

// 逐技能判定现场状态：真源形态、是否已选择、目标是否已选择、既有登记四者共同决定
function statusItems(
  dir: string,
  names: string[],
  selected: Set<string>,
  refs: Map<string, SkillRef>,
  recorded?: SkillStateTarget,
  targetSelected = true,
): SkillStatusItem[] {
  const entries = entryMap(recorded)
  const items: SkillStatusItem[] = []
  for (const name of names) {
    const ref = refs.get(name)
    const isSelected = selected.has(name)
    const dest = join(dir, name)
    const kind = ref ? classifyExisting(dest, ref.linkTarget, undefined, ref.dir) : classifyOrphan(dest)
    let state: SkillItemState
    if (!targetSelected) {
      // 目标本身未被选中：既有本包产物单列 installed-unselected，缺失不展示；异常现场仍按问题上报
      if (kind === "absent") state = "not-selected"
      else if (kind === "wrong" || kind === "file") state = kind === "wrong" ? "wrong" : "conflict"
      else state = "installed-unselected"
    } else if (kind === "link-ok") state = isSelected ? "link" : "installed-unselected"
    else if (kind === "dangling") state = "dangling"
    else if (kind === "wrong") state = "wrong"
    else if (kind === "file") state = "conflict"
    else if (kind === "dir") {
      // 实体目录按来源分流：状态登记为本包副本才叫漂移，未登记的同名目录属用户/上游产物
      if (ref && existsSync(ref.dir) && dirsEqual(ref.dir, dest)) state = isSelected ? "copy" : "installed-unselected"
      else state = entries.get(name)?.mode === "copy" ? "copy-drift" : "conflict"
    } else state = isSelected ? "missing" : "not-selected"
    if (state !== "not-selected") items.push({ name, state, version: ref?.version ?? "", source: ref?.source ?? "" })
  }
  return items
}

// 现场状态：目标目录存在或状态文件有记录时逐技能判定，供 status 报告悬空 / 指向其他版本 / 副本漂移 / 未选择却已安装等
export function skillsStatus(): SkillsStatusReport {
  const state = readSkillsState()
  const config = readSkillsInstallConfig()
  const { refs, sources } = collectStatusSources(state)
  const allNames = [...refs.keys()].sort()
  const savedBySource = config.selection
  const hasSaved = savedBySource !== undefined && Object.keys(savedBySource).length > 0
  const selection = hasSaved
    ? allNames.filter((name) => {
        const ref = refs.get(name)!
        const saved = savedBySource[ref.source]
        return saved === undefined || saved.includes(name)
      })
    : allNames.filter((name) => refs.get(name)!.tier === "core")
  const baseSelected = new Set(selection)
  const savedTargets = config.targets && config.targets.length > 0 ? config.targets : undefined
  const targetSelectedByName = (name: string): boolean => !savedTargets || savedTargets.includes(name)
  const targets = resolveSkillTargets([])
  const nameByDir = new Map(targets.filter((target) => target.name).map((target) => [pathKey(target.dir), target.name]))
  const stateByDir = new Map<string, SkillStateTarget>()
  for (const source of Object.values(state?.sources ?? {})) {
    for (const target of source.targets) stateByDir.set(pathKey(target.dir), target)
  }
  const knownNames = new Set(allNames)

  // 未保存过选择集时（升级前的旧状态）按既有登记视为已选择，避免把历史安装误报成「未选择但已安装」
  const selectedFor = (recorded?: SkillStateTarget): Set<string> =>
    hasSaved ? baseSelected : new Set([...baseSelected, ...(recorded?.entries.map((entry) => entry.name) ?? [])])

  const out: TargetStatus[] = []
  const pendingAgents: Array<{ dir: string; label: string }> = []
  // 已纳入报告的目录，用于循环后补报「状态文件登记但不在解析结果里」的目标
  const resolved = new Set<string>()
  for (const target of targets) {
    const recorded = stateByDir.get(pathKey(target.dir))
    if (!target.available && target.kind === "agent") {
      pendingAgents.push({ dir: target.dir, label: target.label })
      continue
    }
    // 主目标即使未创建也要报告（提示执行 install）；agent / custom 目标仅在目录已有内容或有本包记录时展开
    if (target.kind !== "primary" && !recorded && (!target.dirExists || isEmptyDir(target.dir))) continue
    resolved.add(pathKey(target.dir))
    const selected = selectedFor(recorded)
    const targetSelected = target.name ? targetSelectedByName(target.name) : true
    const items = statusItems(target.dir, statusNames(selected, recorded, presentSkillNames(target.dir, knownNames)), selected, refs, recorded, targetSelected)
    if (!targetSelected && items.length === 0) continue
    out.push({
      dir: target.dir,
      label: target.label,
      kind: target.kind,
      available: target.available,
      dirExists: target.dirExists,
      recorded: Boolean(recorded),
      selected: targetSelected,
      items,
    })
  }
  // 补报状态文件登记但本次未解析到的目标（如 --dir 安装后不再传参、agent 目录已被移除）：如实呈现，避免静默丢弃
  const legacyTargets: Array<{ dir: string; label: string }> = []
  for (const target of stateByDir.values()) {
    if (resolved.has(pathKey(target.dir))) continue
    const legacy = legacySkillDirLabel(target.dir)
    if (legacy && existsSync(target.dir)) legacyTargets.push({ dir: target.dir, label: legacy })
    const selected = selectedFor(target)
    const targetName = nameByDir.get(pathKey(target.dir)) ?? ""
    const targetSelected = targetName ? targetSelectedByName(targetName) : true
    const items = statusItems(target.dir, statusNames(selected, target, presentSkillNames(target.dir, knownNames)), selected, refs, target, targetSelected)
    if (!targetSelected && items.length === 0) continue
    out.push({
      dir: target.dir,
      label: legacy ?? (target.label || skillTargetLabel(target.dir) || "自定义 --dir"),
      kind: target.kind === "primary" || target.kind === "agent" ? target.kind : "custom",
      available: true,
      dirExists: existsSync(target.dir),
      recorded: true,
      selected: targetSelected,
      items,
    })
  }

  const packageSkills = [...refs.entries()].map(([name, ref]) => ({ name, dir: ref.dir, version: ref.version, tier: ref.tier, requires: [] }))
  return {
    source: skillsSourceDir(),
    skills: allNames,
    selection,
    targetSelection: savedTargets ?? [],
    sources,
    skillVersions: Object.fromEntries([...refs.entries()].map(([name, ref]) => [name, ref.version])),
    versionMismatches: findSkillVersionMismatches(packageSkills),
    stateFile: skillsStateFile(),
    stateExists: Boolean(state),
    targets: out,
    pendingAgents,
    canonicalReaders: resolveCanonicalReaders(),
    legacyTargets,
  }
}

// ===== 项目侧体检 =====

// 单薄壳状态判定：缺 → missing；无标记 → conflict（他人同名产物）；标记超前 → ready（不降级）；否则与期望逐字比对
function shellItemState(file: string, skill: { name: string; dir: string }, sourceDir: string): ProjectItemState {
  if (!existsSync(file)) return "missing"
  let actual: string
  try {
    actual = readTextFile(file)
  } catch {
    return "conflict"
  }
  const version = readSkillShellVersion(actual)
  if (version === null) return "conflict"
  if (version > currentSkillShellVersion()) return "ready"
  return actual === buildSkillShell(skill.name, sourceDir, readSkillDescription(skill.dir)) ? "ready" : "drift"
}

// 项目侧体检：真源副本与各薄壳目录逐技能判定，供人工决定是否重跑 install / init
export function projectSkillsStatus(cwd = process.cwd()): ProjectStatusReport {
  const targets = resolveProjectTargets(cwd)
  const root = targets.root
  const state = readProjectState(root)
  const config = readProjectSkillsConfig(root)
  const { refs, sources } = collectStatusSources(state)
  const allNames = [...refs.keys()].sort()
  const saved = config.selection !== undefined && config.selection.length > 0 ? config.selection : undefined
  // 项目面选择集是平铺名单；外部来源未单独登记时默认选中，避免新增来源被静默漏装
  const selection = saved
    ? allNames.filter((name) => saved.includes(name) || refs.get(name)!.source !== BUILTIN_SOURCE)
    : allNames.filter((name) => refs.get(name)!.tier === "core")
  const baseSelected = new Set(selection)
  const savedTargets = config.targets && config.targets.length > 0 ? config.targets : undefined
  const targetSelected = (dir: string): boolean => !savedTargets || savedTargets.includes(dir)
  const stateTargets = Object.values(state?.sources ?? {}).flatMap((source) => source.targets)
  const recordedSource = stateTargets.find((target) => target.kind === "source" && target.dir === targets.sourceDir)
  const recordedShells = new Map(stateTargets.filter((target) => target.kind === "shell").map((target) => [target.dir, target]))
  const sourceRecorded = new Set(recordedSource?.entries.map((entry) => entry.name) ?? [])
  const knownNames = new Set(allNames)
  // 未保存过选择集时（升级前的旧归属账）按既有登记视为已选择
  const selectedFor = (names: Set<string>): Set<string> => (saved === undefined ? new Set([...baseSelected, ...names]) : baseSelected)

  // 真源目录：缺失 / 内容一致 / 有归属记录但被改动（漂移） / 无记录的同名目录（冲突）
  const sourceSelected = selectedFor(sourceRecorded)
  const sourceNames = statusNames(sourceSelected, recordedSource, presentSkillNames(join(root, targets.sourceDir), knownNames))
  const sourceItems: ProjectSkillItem[] = []
  for (const name of sourceNames) {
    const ref = refs.get(name)
    const dest = join(root, targets.sourceDir, name)
    let stateName: ProjectItemState
    if (!existsSync(dest)) stateName = sourceSelected.has(name) ? "missing" : "not-selected"
    else if (ref && dirsEqual(ref.dir, dest)) stateName = sourceSelected.has(name) ? "ready" : "installed-unselected"
    else stateName = sourceRecorded.has(name) ? "drift" : "conflict"
    if (stateName !== "not-selected") sourceItems.push({ name, state: stateName, version: ref?.version ?? "", source: ref?.source ?? "" })
  }
  const dirs: ProjectDirStatus[] = [{ dir: targets.sourceDir, kind: "source", selected: true, items: sourceItems }]

  // 单薄壳目录逐技能判定：目标未选中时既有产物单列 installed-unselected，缺失不展示
  const shellStatus = (dir: string, recorded?: SkillStateTarget): ProjectDirStatus => {
    const dirSelected = targetSelected(dir)
    const recordedNames = new Set(recorded?.entries.map((entry) => entry.name) ?? [])
    const shellSelected = selectedFor(recordedNames)
    const items: ProjectSkillItem[] = []
    for (const name of statusNames(shellSelected, recorded, presentSkillNames(join(root, dir), knownNames))) {
      const ref = refs.get(name)
      let stateName: ProjectItemState
      if (!ref) stateName = "conflict"
      else {
        const file = join(root, dir, name, SKILL_ENTRY)
        stateName = shellItemState(file, { name, dir: ref.dir }, targets.sourceDir)
        // 无标记但本包曾登记：视为被外部改动（漂移）而非陌生同名产物
        if (stateName === "conflict" && recordedNames.has(name)) stateName = "drift"
        if (!dirSelected) {
          if (stateName === "missing") stateName = "not-selected"
          else if (stateName === "ready" || stateName === "drift") stateName = "installed-unselected"
        } else {
          if (stateName === "ready" && !shellSelected.has(name)) stateName = "installed-unselected"
          if (stateName === "missing" && !shellSelected.has(name)) stateName = "not-selected"
        }
      }
      if (stateName !== "not-selected") items.push({ name, state: stateName, version: ref?.version ?? "", source: ref?.source ?? "" })
    }
    return { dir, kind: "shell", selected: dirSelected, items }
  }

  for (const dir of targets.shellDirs) dirs.push(shellStatus(dir, recordedShells.get(dir)))
  // 已从选择集移除、但归属账仍有登记的薄壳目录：如实补报，避免静默丢弃
  const shellDirSet = new Set(targets.shellDirs)
  for (const [dir, recorded] of recordedShells) {
    if (shellDirSet.has(dir) || !existsSync(join(root, dir))) continue
    const status = shellStatus(dir, recorded)
    if (status.items.length > 0) dirs.push(status)
  }

  const packageSkills = [...refs.entries()].map(([name, ref]) => ({ name, dir: ref.dir, version: ref.version, tier: ref.tier, requires: [] }))
  return {
    root,
    sourceDir: targets.sourceDir,
    skills: allNames,
    selection,
    targetSelection: savedTargets ?? [],
    sources,
    skillVersions: Object.fromEntries([...refs.entries()].map(([name, ref]) => [name, ref.version])),
    versionMismatches: findSkillVersionMismatches(packageSkills),
    stateFile: toRepoRel(root, projectStateFile(root)),
    stateExists: Boolean(state),
    dirs,
    missingDirs: targets.missingDirs,
  }
}
