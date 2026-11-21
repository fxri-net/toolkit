// 技能分发计划：逐技能给出目标形态 / 当前形态 / 动作与判定来源，install --dry-run 与 skills plan 共用
// 只读现场，不写任何文件；真正落盘仍由 installSkills 按同一 resolveDelivery 结论执行
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"
import { readSkillsDeliveryConfig, readSkillsInstallConfig } from "./config"
import { gateRulesToDeliveryRules, resolveDelivery, type DeliveryDecision, type DeliveryMode } from "./delivery"
import { derivePolicyDelivery, loadPolicyDeliveryContext } from "./policy-delivery"
import { assertUniqueSkillNames, buildSkillGateShell, classifyExisting, isSameDir, isSkillGateShell, readSkillDescription, resolveSkillTargets, resolveTargetsByName, sourceSkillItems } from "./source"
import { skillsStateFile } from "./state"
import { SKILL_ENTRY, type GateRules, type TargetKind } from "./types"
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
  kind: TargetKind
  items: SkillPlanItem[]
  // 曾用名迁移预览：旧名产物存在且可确认归属，实跑时由 install 清理
  migrations: Array<{ from: string; to: string }>
}

export interface SkillsPlanReport {
  scope: "global"
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
  // 内容闸门：与 install 同口径的显式取值，缺省读 skillsDelivery 配置
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

  // 分发形态：命令行显式取值 > skillsDelivery 配置 > 旧键兼容
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
        policy: derivePolicyDelivery(item.name, policyContext),
      }),
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
