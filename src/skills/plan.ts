// 技能分发计划：逐技能给出目标形态 / 当前形态 / 动作与判定来源，install --dry-run 与 skills plan 共用
// 只读现场，不写任何文件；真正落盘仍由 installSkills 按同一 resolveDelivery 结论执行
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"
import { readProjectSkillsConfig, readSkillsDeliveryConfig, readSkillsInstallConfig } from "./config"
import { gateRulesToDeliveryRules, resolveDelivery, type DeliveryDecision, type DeliveryMode } from "./delivery"
import { derivePolicyDelivery, loadPolicyDeliveryContext } from "./policy-delivery"
import { assertUniqueSkillNames, buildSkillGateShell, buildSkillShell, classifyExisting, isSameDir, isSkillGateShell, readSkillDescription, readSkillShellVersion, resolveProjectTargets, resolveSkillTargets, resolveTargetsByName, sourceSkillItems } from "./source"
import { projectStateFile, readProjectState, readSkillsState, skillsStateFile } from "./state"
import { PROJECT_SOURCE_DIR, SKILL_ENTRY, type GateRules, type TargetKind } from "./types"
import { collectSources, filterSkillItems, type ExternalSourceOption } from "./install/common"

// 计划动作：保持 / 建壳 / 换全文 / 清理
export type DeliveryAction = "keep" | "shell" | "full" | "clean"

// 当前形态：none 无产物 / drift 与任何目标形态都不符（悬空、指向其他版本、壳过期等）
export type CurrentForm = DeliveryMode | "none" | "drift"

export interface SkillPlanItem {
  name: string
  version: string
  target: DeliveryMode
  current: CurrentForm
  action: DeliveryAction
  source: string
  reason: string
}

export interface SkillPlanTarget {
  dir: string
  label: string
  kind: TargetKind | "source"
  items: SkillPlanItem[]
  // 曾用名迁移预览：旧名产物存在且可确认归属，实跑时由 install 清理
  migrations: Array<{ from: string; to: string }>
}

export interface SkillsPlanReport {
  scope: "global" | "project"
  // 项目面计划的项目根；全局面为空
  root?: string
  skills: string[]
  targetSelection: string[]
  targets: SkillPlanTarget[]
  skippedTargets: Array<{ dir: string; label: string }>
  stateFile: string
  // 需要收敛的技能条目数（动作非保持）
  pending: number
}

export interface PlanOptions {
  skills?: string[]
  targets?: string[]
  dirs?: string[]
  externalSources?: ExternalSourceOption[]
  // 内容闸门：与 install 同口径的显式取值，缺省读 skillDelivery 配置
  gate?: boolean | GateRules
}

// 现场形态判定：链接 / 同内容副本算全文，本包入口壳算入口壳，其余归漂移
function currentForm(dest: string, item: { name: string; dir: string; linkTarget: string }): CurrentForm {
  const kind = classifyExisting(dest, item.linkTarget)
  if (kind === "absent") return "none"
  if (kind === "link-ok") return "full"
  if (kind !== "dir") return "drift"
  const gateFile = join(dest, SKILL_ENTRY)
  let content: string | null = null
  try {
    if (existsSync(gateFile)) content = readTextFile(gateFile)
  } catch {
    content = null
  }
  if (content !== null && isSkillGateShell(content)) {
    return content === buildSkillGateShell(item.name, readSkillDescription(item.dir)) ? "gated" : "drift"
  }
  return isSameDir(item.dir, dest) ? "full" : "drift"
}

// 动作判定：目标与现场一致即保持；否则按目标形态建壳 / 换全文，off 的残留标记为清理
function planAction(target: DeliveryMode, current: CurrentForm): DeliveryAction {
  if (target === "off") return current === "none" ? "keep" : "clean"
  if (target === "gated") return current === "gated" ? "keep" : "shell"
  return current === "full" ? "keep" : "full"
}

// 计划入口：与 installSkills 共用来源收集、选择过滤与目标解析，避免两套口径漂移
export function planSkills(options: PlanOptions = {}): SkillsPlanReport {
  const sources = collectSources({ externalSources: options.externalSources, dryRun: true })
  const allItems = sources.flatMap(sourceSkillItems)
  assertUniqueSkillNames(allItems)
  const items = filterSkillItems(allItems, options.skills)
  // 目标选择：显式参数 > 已保存选择 > 全部可用目标；--dir 一次性追加
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
  if (requestedTargets === undefined) {
    for (const target of allTargets) {
      if (target.kind === "agent" && !target.available) skippedTargets.push({ dir: target.dir, label: target.label })
    }
  }

  // 分发形态：命令行显式取值 > skillDelivery 配置 > 旧键兼容
  const gateOption = options.gate
  const deliveryConfig = gateOption === undefined ? readSkillsDeliveryConfig("global") : { rules: [] }
  const cliRules = gateOption !== undefined && typeof gateOption === "object" ? gateRulesToDeliveryRules(gateOption) : []
  const override: DeliveryMode | undefined = gateOption === true ? "gated" : gateOption === false ? "full" : undefined
  const policyContext = loadPolicyDeliveryContext()
  const decisions = new Map<string, DeliveryDecision>(
    items.map((item) => [
      item.name,
      resolveDelivery({
        name: item.name,
        config: deliveryConfig,
        rules: cliRules,
        override,
        gate: item.gate,
        packageDefault: item.delivery,
        policy: derivePolicyDelivery(item.name, policyContext),
      }),
    ]),
  )

  // 归属账登记但当前来源不可解析的技能：与 status 的缺失口径一致，纳入计划待收敛
  const state = readSkillsState()
  const recordedVersions = new Map<string, string>()
  for (const source of Object.values(state?.sources ?? {})) {
    for (const target of source.targets) for (const entry of target.entries) recordedVersions.set(entry.name, entry.version)
  }
  // 与 status 的选择集口径对齐：已保存选择时只统计选择集内的名字；未保存过时把既有登记视为已选择
  const savedSelection = readSkillsInstallConfig().selection
  const savedNames = new Set(Object.values(savedSelection ?? {}).flat())
  const unresolved = [...recordedVersions.entries()].filter(
    ([name]) =>
      !allItems.some((item) => item.name === name) &&
      (options.skills?.includes(name) || savedSelection === undefined || savedNames.has(name)),
  )
  const unresolvedDecisions = new Map(
    unresolved.map(([name]) => [
      name,
      resolveDelivery({ name, config: deliveryConfig, policy: derivePolicyDelivery(name, policyContext) }),
    ]),
  )

  const targets: SkillPlanTarget[] = []
  let pending = 0
  for (const target of resolved.targets) {
    const rows: SkillPlanItem[] = []
    for (const item of items) {
      const decision = decisions.get(item.name)!
      const current = currentForm(join(target.dir, item.name), item)
      const action = planAction(decision.mode, current)
      if (action !== "keep") pending += 1
      rows.push({
        name: item.name,
        version: item.version,
        target: decision.mode,
        current,
        action,
        source: decision.source,
        reason: decision.reason,
      })
    }
    // 不可解析的已登记技能：缺失记 none、残留记 drift，动作按目标形态收敛
    for (const [name, version] of unresolved) {
      const decision = unresolvedDecisions.get(name)!
      const exists = existsSync(join(target.dir, name))
      const current: CurrentForm = exists ? "drift" : "none"
      const action: DeliveryAction = decision.mode === "off" ? (exists ? "clean" : "keep") : decision.mode === "gated" ? "shell" : "full"
      if (action !== "keep") pending += 1
      rows.push({
        name,
        version,
        target: decision.mode,
        current,
        action,
        source: "来源不可解析",
        reason: "归属账已登记但当前来源不可解析（来源缺失或技能已移除）",
      })
    }
    // 曾用名迁移：旧名仍存在且可确认归属时才预览，与 install 的清理判据一致
    const migrations: Array<{ from: string; to: string }> = []
    for (const item of items) {
      for (const old of item.previousNames) {
        const dest = join(target.dir, old)
        const kind = classifyExisting(dest, item.linkTarget, undefined, item.dir)
        if (kind === "absent") continue
        const removable = kind === "dangling" || kind === "link-ok" || (kind === "dir" && existsSync(item.dir) && isSameDir(item.dir, dest))
        if (removable) migrations.push({ from: old, to: item.name })
      }
    }
    targets.push({ dir: target.dir, label: target.label, kind: target.kind, items: rows, migrations })
  }

  return {
    scope: "global",
    skills: items.map((item) => item.name),
    targetSelection: resolved.targets.filter((target) => target.name).map((target) => target.name),
    targets,
    skippedTargets,
    stateFile: skillsStateFile(),
    pending,
  }
}

export interface ProjectPlanOptions {
  cwd?: string
  skills?: string[]
  targetDirs?: string[]
  // 只预览归属账已登记的技能：prepare 钩子刷新时不新增技能
  refreshOnly?: boolean
}

// 项目面现场形态：真源比对内容，薄壳按目标形态比对入口壳或项目薄壳
function projectCurrent(absDir: string, item: { name: string; dir: string }, target: DeliveryMode, source: boolean): CurrentForm {
  const dest = join(absDir, item.name)
  if (source) {
    if (!existsSync(dest)) return "none"
    return isSameDir(item.dir, dest) ? "full" : "drift"
  }
  if (!existsSync(dest)) return "none"
  if (target === "off") return "drift"
  const file = join(dest, SKILL_ENTRY)
  if (!existsSync(file)) return "drift"
  const content = readTextFile(file)
  if (target === "gated") {
    if (!isSkillGateShell(content)) return "drift"
    return content === buildSkillGateShell(item.name, readSkillDescription(item.dir)) ? "gated" : "drift"
  }
  const version = readSkillShellVersion(content)
  if (version === null) return "drift"
  return content === buildSkillShell(item.name, PROJECT_SOURCE_DIR, readSkillDescription(item.dir)) ? "full" : "drift"
}

// 项目面动作：真源副本恒为全文；薄壳目录按目标形态建壳或换全文；off 的残留标记清理
function projectAction(target: DeliveryMode, current: CurrentForm, source: boolean): DeliveryAction {
  if (target === "off") return current === "none" ? "keep" : "clean"
  if (source) return current === "full" ? "keep" : "full"
  if (target === "gated") return current === "gated" ? "keep" : "shell"
  return current === "full" ? "keep" : "full"
}

// 项目面计划：真源副本 + 已存在候选目录，与全局面共用计划结构与渲染
export function planProjectSkills(options: ProjectPlanOptions = {}): SkillsPlanReport {
  const cwd = options.cwd ?? process.cwd()
  const sources = collectSources({ dryRun: true })
  const allItems = sources.flatMap(sourceSkillItems)
  assertUniqueSkillNames(allItems)
  const targets = resolveProjectTargets(cwd)
  const root = targets.root
  const previous = readProjectState(root)
  const recorded = new Map<string, string>()
  for (const source of Object.values(previous?.sources ?? {})) {
    for (const target of source.targets) for (const entry of target.entries) recorded.set(entry.name, entry.version)
  }
  const baseItems = filterSkillItems(allItems, options.skills)
  // refreshOnly：只刷新归属账已存在的技能，不新增
  const items = options.refreshOnly ? baseItems.filter((item) => recorded.has(item.name)) : baseItems
  const deliveryConfig = readSkillsDeliveryConfig("project", root)
  const policyContext = loadPolicyDeliveryContext(root)
  // 项目面与 status 同口径：已保存选择时只统计选择集内的名字，未保存时既有登记视为已选择
  const savedSelection = readProjectSkillsConfig(root).selection
  const unresolved = [...recorded.entries()].filter(
    ([name]) =>
      !allItems.some((item) => item.name === name) &&
      (options.skills?.includes(name) || savedSelection === undefined || savedSelection.includes(name)),
  )
  const unresolvedDecisions = new Map(
    unresolved.map(([name]) => [name, resolveDelivery({ name, config: deliveryConfig, policy: derivePolicyDelivery(name, policyContext) })]),
  )
  const decisions = new Map<string, DeliveryDecision>(
    items.map((item) => [
      item.name,
      resolveDelivery({
        name: item.name,
        config: deliveryConfig,
        gate: item.gate,
        packageDefault: item.delivery,
        policy: derivePolicyDelivery(item.name, policyContext),
      }),
    ]),
  )
  const shellDirs = options.targetDirs && options.targetDirs.length > 0 ? options.targetDirs.filter((dir) => targets.shellDirs.includes(dir)) : targets.shellDirs
  const dirs: Array<{ dir: string; label: string; kind: TargetKind | "source" }> = [
    { dir: PROJECT_SOURCE_DIR, label: "真源副本", kind: "source" },
    ...shellDirs.map((dir) => ({ dir, label: "薄壳", kind: "custom" as const })),
  ]

  let pending = 0
  const planned: SkillPlanTarget[] = []
  for (const entry of dirs) {
    const rows: SkillPlanItem[] = []
    const migrations: Array<{ from: string; to: string }> = []
    for (const item of items) {
      const decision = decisions.get(item.name)!
      const isSource = entry.dir === PROJECT_SOURCE_DIR
      const current = projectCurrent(isSource ? join(root, PROJECT_SOURCE_DIR) : join(root, entry.dir), item, decision.mode, isSource)
      const action = projectAction(decision.mode, current, isSource)
      if (action !== "keep") pending += 1
      rows.push({
        name: item.name,
        version: item.version,
        target: decision.mode,
        current,
        action,
        source: decision.source,
        reason: decision.reason,
      })
    }
    // 不可解析的已登记技能：与 status 的缺失 / 残留口径一致
    for (const [name, version] of unresolved) {
      const decision = unresolvedDecisions.get(name)!
      const isSource = entry.dir === PROJECT_SOURCE_DIR
      const dest = isSource ? join(root, PROJECT_SOURCE_DIR, name) : join(root, entry.dir, name)
      const exists = existsSync(dest)
      const current: CurrentForm = exists ? "drift" : "none"
      const action: DeliveryAction =
        decision.mode === "off" ? (exists ? "clean" : "keep") : isSource || decision.mode !== "gated" ? "full" : "shell"
      if (action !== "keep") pending += 1
      rows.push({
        name,
        version,
        target: decision.mode,
        current,
        action,
        source: "来源不可解析",
        reason: "归属账已登记但当前来源不可解析（来源缺失或技能已移除）",
      })
    }
    // 曾用名迁移：只对薄壳目录预览，旧名带本包标记才可自动清理
    if (entry.dir !== PROJECT_SOURCE_DIR) {
      for (const item of items) {
        for (const old of item.previousNames) {
          const file = join(root, entry.dir, old, SKILL_ENTRY)
          if (!existsSync(file)) continue
          const content = readTextFile(file)
          if (readSkillShellVersion(content) === null && !isSkillGateShell(content)) continue
          migrations.push({ from: old, to: item.name })
        }
      }
    }
    planned.push({ dir: entry.dir, label: entry.label, kind: entry.kind, items: rows, migrations })
  }

  return {
    scope: "project",
    root,
    skills: items.map((item) => item.name),
    targetSelection: shellDirs,
    targets: planned,
    skippedTargets: [],
    stateFile: projectStateFile(root),
    pending,
  }
}
