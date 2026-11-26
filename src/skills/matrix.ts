// 技能矩阵视图：逐技能给出产物形态、当前目录形态与命中规则的依据，供排查「为什么是入口壳 / 不安装」
import { listInstalledSkillNames } from "../scope/linkage"
import { resolveScope } from "../scope/load"
import type { ScopeCondition, ScopePolicy, ScopeProfile } from "../scope/types"
import { readSkillsDeliveryConfig } from "./config"
import { deliveryModeLabel, resolveDelivery, type DeliveryMode } from "./delivery"
import { derivePolicyDelivery, evaluatePolicy } from "./policy-delivery"

// 单条规则的形态依据
export interface SkillMatrixRow {
  policy: string
  name: string | null
  when: string
  delivery: DeliveryMode
}

// 单个技能：产物形态（跨目录汇总）与当前目录形态
export interface SkillMatrixEntry {
  name: string
  artifact: DeliveryMode
  source: string
  current: DeliveryMode
  rows: SkillMatrixRow[]
}

// 条件人读：未写条件即全部目录
function describeWhen(when: ScopeCondition | undefined): string {
  if (!when) return "全部目录"
  const parts: string[] = []
  if (when.paths?.length) parts.push(`路径 ${when.paths.join("、")}`)
  if (when.subpaths?.length) parts.push(`子路径 ${when.subpaths.join("、")}`)
  if (when.markers?.length) parts.push(`标记 ${when.markers.join("、")}`)
  if (when.gitRemotes?.length) parts.push(`远端 ${when.gitRemotes.join("、")}`)
  return parts.length > 0 ? parts.join("；") : "全部目录"
}

// 命中规则：只列确实限制该技能的规则，带策略 id 与条件
function rowsOf(policies: ScopePolicy[], profiles: ScopeProfile[], name: string): SkillMatrixRow[] {
  const rows: SkillMatrixRow[] = []
  for (const policy of policies) {
    const hit = evaluatePolicy(policy, profiles, name)
    if (!hit) continue
    rows.push({ policy: `policy:${policy.id}`, name: policy.name ?? null, when: describeWhen(policy.when), delivery: hit.mode })
  }
  return rows
}

// 矩阵入口：一次解析后逐技能复用，避免重复加载配置
export function buildSkillMatrix(startDir = process.cwd()): SkillMatrixEntry[] {
  const report = resolveScope(startDir)
  const config = readSkillsDeliveryConfig("global", startDir)
  return listInstalledSkillNames(startDir).map((name) => {
    const policy = derivePolicyDelivery(name, { policies: report.policies, profiles: report.profiles })
    const artifact = resolveDelivery({ name, config, policy }).mode
    const current = resolveScope(startDir, name).decision.delivery ?? "full"
    return {
      name,
      artifact,
      source: policy?.source ?? "默认",
      current,
      rows: rowsOf(report.policies, report.profiles, name),
    }
  })
}

// 文本渲染：先给结论，再给依据，最后给旧配置迁移提示
export function printSkillMatrix(entries: SkillMatrixEntry[], startDir: string): void {
  console.log(`技能矩阵（判定起点：${startDir}）：`)
  for (const entry of entries) {
    console.log(
      `  ${entry.name}：产物 ${deliveryModeLabel(entry.artifact)} · 当前目录 ${deliveryModeLabel(entry.current)}（来源 ${entry.source}）`,
    )
    for (const row of entry.rows) {
      const label = row.name ? `（${row.name}）` : ""
      console.log(`    规则 ${row.policy}${label} · ${row.when} → ${deliveryModeLabel(row.delivery)}`)
    }
  }
  if (entries.every((entry) => entry.rows.length === 0)) console.log("  没有策略限制这些技能（按默认形态）")
}

// 旧配置迁移提示：只提示，不自动改写
export function legacyShapeHints(startDir = process.cwd()): string[] {
  const hints: string[] = []
  const activation = resolveScope(startDir).activation
  if (activation) {
    const empty = (activation.include?.length ?? 0) === 0 && (activation.exclude?.length ?? 0) === 0
    hints.push(
      empty
        ? "旧 activation 仍在生效但名单为空：可直接 toolkit config unset activation --layer <global|project|local> 删除（行为不变）"
        : "旧 activation 仍在生效（已编译为策略）：先用 toolkit scope allow <路径> --delivery full|gated 或 deny <路径> 改写，确认后 toolkit config unset activation --layer <global|project|local>",
    )
  }
  if (readSkillsDeliveryConfig("global", startDir).rules.length > 0) {
    hints.push("skillDelivery.rules 可迁移为策略 delivery；两条真源并存时以 rules 为准")
  }
  return hints
}
