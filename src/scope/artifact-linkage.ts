// 作用域写入后的产物联动：写前预演形态变化、写后按矩阵收敛；不改选择集、不新增技能
import { isInteractive } from "../prompts"
import { readProjectSkillsConfig, readSkillsDeliveryConfig, readSkillsInstallConfig } from "../skills/config"
import { deliveryModeLabel, resolveDelivery, type DeliveryMode } from "../skills/delivery"
import { derivePolicyDelivery } from "../skills/policy-delivery"
import { reconcileSkills, type ReconcileResult } from "../skills/reconcile"
import { listInstalledSkillNames } from "./linkage"
import { resolveScope, resolveScopeProjected, type ScopeReport } from "./load"
import type { PolicyLayer } from "./types"

// 单个安装面的形态变化
export interface ShapeChange {
  face: "global" | "project"
  name: string
  from: DeliveryMode
  to: DeliveryMode
}

// 层 → 安装面：项目层只影响项目面，其余影响全局面；本地层同时影响两面
export function facesOfLayer(layer: PolicyLayer): Array<"global" | "project"> {
  if (layer === "project") return ["project"]
  if (layer === "local") return ["global", "project"]
  return ["global"]
}

// 单面形态：策略聚合 → 显式规则 / 全局默认
function shapeFrom(
  face: "global" | "project",
  startDir: string,
  name: string,
  report: ScopeReport,
): DeliveryMode {
  const policy = derivePolicyDelivery(name, { policies: report.policies, profiles: report.profiles })
  return resolveDelivery({ name, config: readSkillsDeliveryConfig(face, startDir), policy }).mode
}

// 已装技能名：按两面已保存的选择集；都没保存过时回落到全部候选（与首次安装口径一致）
function installedNames(startDir: string): string[] {
  const globalSelection = Object.values(readSkillsInstallConfig().selection ?? {}).flat()
  const projectSelection = readProjectSkillsConfig(startDir).selection ?? []
  const saved = [...new Set([...globalSelection, ...projectSelection])]
  return saved.length > 0 ? saved : listInstalledSkillNames(startDir)
}

// 写前预演：按「即将写入的配置」重算已装技能的形态，只列有变化的
export function previewShapeChanges(
  layer: PolicyLayer,
  nextConfig: Record<string, unknown>,
  startDir = process.cwd(),
): ShapeChange[] {
  const names = installedNames(startDir)
  if (names.length === 0) return []
  const before = new Map(names.map((name) => [name, resolveScope(startDir, name)]))
  const changes: ShapeChange[] = []
  for (const face of facesOfLayer(layer)) {
    for (const name of names) {
      const from = shapeFrom(face, startDir, name, before.get(name)!)
      const to = shapeFrom(face, startDir, name, resolveScopeProjected(layer, nextConfig, startDir, name))
      if (from !== to) changes.push({ face, name, from, to })
    }
  }
  return changes
}

// 预演人读：按面标注，避免被读成全局生效
export function describeShapeChanges(changes: ShapeChange[]): string[] {
  if (changes.length === 0) return ["技能形态：无变化"]
  const faceText = (face: "global" | "project") => (face === "global" ? "全局面" : "项目面")
  return [
    `技能形态变更（${changes.length} 项）：`,
    ...changes.map((change) => `  ${faceText(change.face)} · ${change.name}：${deliveryModeLabel(change.from)} → ${deliveryModeLabel(change.to)}`),
  ]
}

export interface LinkageOutcome {
  results: ReconcileResult[]
  // 未收敛条目数
  failed: number
  // 逐技能结果与提示
  lines: string[]
}

// 写后收敛：项目面在 CI / 非 TTY 下只报告不写盘，与本包 prepare 口径一致
export function applyArtifactLinkage(changes: ShapeChange[], startDir = process.cwd()): LinkageOutcome {
  const lines: string[] = []
  const results: ReconcileResult[] = []
  // 非交互环境不写项目面产物，避免流水线与批量脚本产生意外仓库改动
  const projectReadOnly = !isInteractive() || Boolean(process.env.CI)
  for (const face of ["global", "project"] as const) {
    const names = [...new Set(changes.filter((change) => change.face === face).map((change) => change.name))]
    if (names.length === 0) continue
    if (face === "project" && projectReadOnly) {
      lines.push(`项目面：非交互环境只报告不写盘，${names.length} 项待收敛（可运行 toolkit skill reconcile --scope project）`)
      continue
    }
    results.push(reconcileSkills({ scope: face, startDir, skills: names }))
  }
  const failed = results.reduce((sum, result) => sum + result.failed, 0)
  for (const result of results) {
    const scopeText = result.scope === "global" ? "全局面" : "项目面"
    for (const item of result.items) {
      const status = item.status === "failed" ? "未收敛" : "已收敛"
      lines.push(`${scopeText} · ${item.name}：${status}（${item.message}）`)
    }
  }
  if (results.every((result) => result.items.length === 0)) lines.push("技能产物已一致，无需改写")
  return { results, failed, lines }
}
