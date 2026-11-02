// 技能现场状态：全局（软链 / 副本）与项目（真源副本 + 薄壳）两面体检
// missing 只表示「已选择但缺失」；未选择且无产物不展示；未选择但有产物单列 installed-unselected，不计入 problems
import { existsSync } from "node:fs"
import { join } from "node:path"
import {
  buildSkillShell,
  classifyExisting,
  currentSkillShellVersion,
  dirsEqual,
  findSkillVersionMismatches,
  isEmptyDir,
  legacySkillDirLabel,
  listDirEntries,
  listPackageSkills,
  pathKey,
  readSkillDescription,
  readSkillShellVersion,
  resolveCanonicalReaders,
  resolveProjectTargets,
  resolveSkillTargets,
  skillTargetLabel,
  skillsLinkDir,
  skillsSourceDir,
  toRepoRel,
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
  type SkillStateEntry,
  type SkillStateTarget,
  type SkillsStatusReport,
  type TargetStatus,
} from "./types"

// 技能名 → 状态条目：同一目标内按名字取登记
function entryMap(target: SkillStateTarget | undefined): Map<string, SkillStateEntry> {
  return new Map((target?.entries ?? []).map((entry) => [entry.name, entry]))
}

// 选择集：配置未保存过时按 core 处理，与首次安装只装 core 的口径一致
function resolveSelection(saved: string[] | undefined, skills: PackageSkill[]): string[] {
  const all = skills.map((skill) => skill.name)
  if (!saved) return skills.filter((skill) => skill.tier === "core").map((skill) => skill.name)
  const known = saved.filter((name) => all.includes(name))
  const unknown = saved.filter((name) => !all.includes(name))
  if (unknown.length > 0) console.warn(`⚠️ 已保存的技能选择含包内不存在的技能：${unknown.join("、")}（已忽略）`)
  return known
}

// 状态判定的技能名集合：已选择技能 ∪ 该目标既有登记 ∪ 目录内实际存在的包内技能
// 第三项保证「未选择但已安装」能被识别并单列，而不是因不在选择集与登记里被静默忽略
function statusNames(selected: Set<string>, recorded?: SkillStateTarget, present: string[] = []): string[] {
  const names = new Set([...selected, ...(recorded?.entries.map((entry) => entry.name) ?? []), ...present])
  return [...names].sort()
}

// 目录内实际存在的包内技能名：只收包内已知技能，避免把用户自装的其他技能卷进报告
function presentSkillNames(dir: string, skills: PackageSkill[]): string[] {
  const known = new Set(skills.map((skill) => skill.name))
  return listDirEntries(dir)
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((name) => known.has(name))
}

// 逐技能判定现场状态：真源存在与否、现场形态、是否已选择、既有登记四者共同决定
function statusItems(
  dir: string,
  names: string[],
  selected: Set<string>,
  versionByName: Map<string, string>,
  recorded?: SkillStateTarget,
  targetSelected = true,
): Array<{ name: string; state: SkillItemState; version: string }> {
  const entries = entryMap(recorded)
  const items: Array<{ name: string; state: SkillItemState; version: string }> = []
  for (const name of names) {
    const isSelected = selected.has(name)
    const source = join(skillsSourceDir(), name)
    const dest = join(dir, name)
    // 链接接受稳定锚点与真源两种指向（新链接锚在入口、旧链接直指真源），只把指向别处且内容与真源不一致的判为错误
    const kind = classifyExisting(dest, join(skillsLinkDir(), name), undefined, source)
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
      // 实体目录按来源分流：状态登记为本包副本才叫漂移（裸 install 可刷新），
      // 未登记的同名目录属用户/上游产物，裸 install 会按冲突跳过、需 --force
      if (existsSync(source) && dirsEqual(source, dest)) state = isSelected ? "copy" : "installed-unselected"
      else state = entries.get(name)?.mode === "copy" ? "copy-drift" : "conflict"
    } else state = isSelected ? "missing" : "not-selected"
    if (state !== "not-selected") items.push({ name, state, version: versionByName.get(name) ?? "" })
  }
  return items
}

// 现场状态：目标目录存在或状态文件有记录时逐技能判定，供 status 报告悬空 / 指向其他版本 / 副本漂移 / 未选择却已安装等
export function skillsStatus(): SkillsStatusReport {
  const skills = listPackageSkills()
  const config = readSkillsInstallConfig()
  const saved = config.selection?.[BUILTIN_SOURCE]
  const selection = resolveSelection(saved, skills)
  const baseSelected = new Set(selection)
  // 目标选择：未保存过时沿用全部可用目标；保存过则只把选中目标算作本次分发范围
  const savedTargets = config.targets && config.targets.length > 0 ? config.targets : undefined
  const targetSelectedByName = (name: string): boolean => !savedTargets || savedTargets.includes(name)
  const targets = resolveSkillTargets([])
  const nameByDir = new Map(targets.filter((target) => target.name).map((target) => [pathKey(target.dir), target.name]))
  const state = readSkillsState()
  const stateByDir = new Map<string, SkillStateTarget>()
  for (const source of Object.values(state?.sources ?? {})) {
    for (const target of source.targets) stateByDir.set(pathKey(target.dir), target)
  }
  const versionByName = new Map(skills.map((skill) => [skill.name, skill.version]))
  // 未保存过选择集时（升级前的旧状态）按既有登记视为已选择，避免把历史安装误报成「未选择但已安装」
  const selectedFor = (recorded?: SkillStateTarget): Set<string> =>
    saved === undefined ? new Set([...baseSelected, ...(recorded?.entries.map((entry) => entry.name) ?? [])]) : baseSelected

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
    // 主目标即使未创建也要报告（提示执行 install）；agent / custom 目标仅在目录已有内容或有本包记录时展开，
    // 空壳目录（如卸载后残留）与无记录目标不占版面无噪音
    if (target.kind !== "primary" && !recorded && (!target.dirExists || isEmptyDir(target.dir))) continue
    resolved.add(pathKey(target.dir))
    const selected = selectedFor(recorded)
    const targetSelected = target.name ? targetSelectedByName(target.name) : true
    const items = statusItems(target.dir, statusNames(selected, recorded, presentSkillNames(target.dir, skills)), selected, versionByName, recorded, targetSelected)
    // 未选中的目标且现场无产物时不占版面
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
  // 其中属于历史落点且目录仍在的，另收进 legacyTargets 供提示清理（只提示，不自动删除）
  const legacyTargets: Array<{ dir: string; label: string }> = []
  for (const target of stateByDir.values()) {
    if (resolved.has(pathKey(target.dir))) continue
    const legacy = legacySkillDirLabel(target.dir)
    if (legacy && existsSync(target.dir)) legacyTargets.push({ dir: target.dir, label: legacy })
    const selected = selectedFor(target)
    const targetName = nameByDir.get(pathKey(target.dir)) ?? ""
    const targetSelected = targetName ? targetSelectedByName(targetName) : true
    const items = statusItems(target.dir, statusNames(selected, target, presentSkillNames(target.dir, skills)), selected, versionByName, target, targetSelected)
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
  return {
    source: skillsSourceDir(),
    skills: skills.map((skill) => skill.name),
    selection,
    targetSelection: savedTargets ?? [],
    skillVersions: Object.fromEntries(skills.map((skill) => [skill.name, skill.version])),
    versionMismatches: findSkillVersionMismatches(skills),
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
function shellItemState(file: string, skill: PackageSkill, sourceDir: string): ProjectItemState {
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
  const skills = listPackageSkills()
  const targets = resolveProjectTargets(cwd)
  const root = targets.root
  const config = readProjectSkillsConfig(root)
  const saved = config.selection
  const savedTargets = config.targets && config.targets.length > 0 ? config.targets : undefined
  const targetSelected = (dir: string): boolean => !savedTargets || savedTargets.includes(dir)
  const selection = resolveSelection(saved, skills)
  const baseSelected = new Set(selection)
  const state = readProjectState(root)
  const versionByName = new Map(skills.map((skill) => [skill.name, skill.version]))
  const stateTargets = Object.values(state?.sources ?? {}).flatMap((source) => source.targets)
  const recordedSource = stateTargets.find((target) => target.kind === "source" && target.dir === targets.sourceDir)
  const recordedShells = new Map(stateTargets.filter((target) => target.kind === "shell").map((target) => [target.dir, target]))
  const sourceRecorded = new Set(recordedSource?.entries.map((entry) => entry.name) ?? [])
  // 未保存过选择集时（升级前的旧归属账）按既有登记视为已选择，避免把历史安装误报成「未选择但已安装」
  const selectedFor = (names: Set<string>): Set<string> => (saved === undefined ? new Set([...baseSelected, ...names]) : baseSelected)

  // 真源目录：缺失 / 内容一致 / 有归属记录但被改动（漂移） / 无记录的同名目录（冲突）
  const sourceSelected = selectedFor(sourceRecorded)
  const sourceNames = statusNames(sourceSelected, recordedSource, presentSkillNames(join(root, targets.sourceDir), skills))
  const sourceItems: ProjectSkillItem[] = []
  for (const name of sourceNames) {
    const skill = skills.find((item) => item.name === name)
    const dest = join(root, targets.sourceDir, name)
    let stateName: ProjectItemState
    if (!existsSync(dest)) stateName = sourceSelected.has(name) ? "missing" : "not-selected"
    else if (skill && dirsEqual(skill.dir, dest)) stateName = sourceSelected.has(name) ? "ready" : "installed-unselected"
    else stateName = sourceRecorded.has(name) ? "drift" : "conflict"
    if (stateName !== "not-selected") sourceItems.push({ name, state: stateName, version: versionByName.get(name) ?? "" })
  }
  const dirs: ProjectDirStatus[] = [{ dir: targets.sourceDir, kind: "source", selected: true, items: sourceItems }]

  // 单薄壳目录逐技能判定：目标未选中时既有产物单列 installed-unselected，缺失不展示
  const shellStatus = (dir: string, recorded?: SkillStateTarget): ProjectDirStatus => {
    const dirSelected = targetSelected(dir)
    const recordedNames = new Set(recorded?.entries.map((entry) => entry.name) ?? [])
    const shellSelected = selectedFor(recordedNames)
    const items: ProjectSkillItem[] = []
    for (const name of statusNames(shellSelected, recorded, presentSkillNames(join(root, dir), skills))) {
      const skill = skills.find((item) => item.name === name)
      let stateName: ProjectItemState
      if (!skill) stateName = "conflict"
      else {
        const file = join(root, dir, name, SKILL_ENTRY)
        stateName = shellItemState(file, skill, targets.sourceDir)
        // 无标记但本包曾登记：视为被外部改动（漂移）而非陌生同名产物，便于区分「需重写」与「需人工确认」
        if (stateName === "conflict" && recordedNames.has(name)) stateName = "drift"
        if (!dirSelected) {
          if (stateName === "missing") stateName = "not-selected"
          else if (stateName === "ready" || stateName === "drift") stateName = "installed-unselected"
        } else {
          if (stateName === "ready" && !shellSelected.has(name)) stateName = "installed-unselected"
          if (stateName === "missing" && !shellSelected.has(name)) stateName = "not-selected"
        }
      }
      if (stateName !== "not-selected") items.push({ name, state: stateName, version: versionByName.get(name) ?? "" })
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

  return {
    root,
    sourceDir: targets.sourceDir,
    skills: skills.map((skill) => skill.name),
    selection,
    targetSelection: savedTargets ?? [],
    skillVersions: Object.fromEntries(skills.map((skill) => [skill.name, skill.version])),
    versionMismatches: findSkillVersionMismatches(skills),
    stateFile: toRepoRel(root, projectStateFile(root)),
    stateExists: Boolean(state),
    dirs,
    missingDirs: targets.missingDirs,
  }
}
