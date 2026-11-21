// 技能矩阵与内容闸门联动：矩阵已配置但闸门未接管、策略失效与死技能提示
import { readSkillsInstallConfig } from "../skills/config"
import { isSkillGated, resolveGateSetting } from "../skills/gate"
import { listPackageSkills } from "../skills/source"
import { readProjectState, readSkillsState } from "../skills/state"
import { resolveScope } from "./load"
import { findProjectRoot } from "./paths"

export interface SkillLinkageReport {
  // 是否存在技能维度策略（矩阵）
  matrixConfigured: boolean
  gateEnabled: boolean
  // 策略限制了技能但闸门未接管：正文仍会全文加载
  ineffective: string[]
  // 已安装但当前目录矩阵未允许的技能
  dead: string[]
}

// 命中策略 id：matchedRule 形如 policy:<id> 或 policy:<id> (name)
function matchedPolicyId(matchedRule: string | null): string | null {
  if (!matchedRule?.startsWith("policy:")) return null
  const rest = matchedRule.slice("policy:".length)
  const space = rest.indexOf(" ")
  return space < 0 ? rest : rest.slice(0, space)
}

// 已安装技能名：包内真源 + 全局 / 项目状态登记，去重后排序
function installedNames(startDir: string): string[] {
  const names = new Set<string>(listPackageSkills().map((skill) => skill.name))
  const states = [readSkillsState(), readProjectState(findProjectRoot(startDir))]
  for (const state of states) {
    for (const source of Object.values(state?.sources ?? {})) {
      for (const target of source.targets) {
        for (const entry of target.entries) names.add(entry.name)
      }
    }
  }
  return [...names].sort()
}

// 分析当前目录：矩阵是否存在、闸门是否接管、哪些技能策略无效或成为死技能
export function analyzeSkillLinkage(startDir = process.cwd()): SkillLinkageReport {
  const report = resolveScope(startDir)
  const matrixConfigured = report.policies.some(
    (policy) => policy.skills && Object.keys(policy.skills).length > 0,
  )
  const setting = resolveGateSetting(readSkillsInstallConfig(startDir).gate)
  const packageSkills = new Map(listPackageSkills().map((skill) => [skill.name, skill]))
  const ineffective: string[] = []
  const dead: string[] = []
  if (!matrixConfigured) {
    return { matrixConfigured, gateEnabled: setting.enabled, ineffective, dead }
  }
  for (const name of installedNames(startDir)) {
    const skillReport = resolveScope(startDir, name)
    if (skillReport.decision.active) continue
    const id = matchedPolicyId(skillReport.decision.matchedRule)
    const policy = id ? skillReport.policies.find((item) => item.id === id) : undefined
    // 只统计技能维度策略：路径 / 标记 / 远端拒绝不代表矩阵限制
    if (!policy?.skills) continue
    dead.push(name)
    const skill = packageSkills.get(name)
    if (!setting.enabled || !isSkillGated(name, skill?.gate, setting.rules)) ineffective.push(name)
  }
  return { matrixConfigured, gateEnabled: setting.enabled, ineffective, dead }
}

// 联动提示文案：命令层统一用 line.hint 着色
export function formatLinkageHints(linkage: SkillLinkageReport): string[] {
  if (!linkage.matrixConfigured) return []
  const hints: string[] = []
  if (!linkage.gateEnabled) hints.push("矩阵已配置，但正文仍全量加载：运行 toolkit skills gate on 开启内容闸门")
  if (linkage.ineffective.length > 0) {
    hints.push(`策略无效：${linkage.ineffective.join("、")} 仍全文加载（内容闸门未接管）`)
  }
  if (linkage.dead.length > 0) {
    hints.push(`已安装但矩阵未允许：${linkage.dead.join("、")}（不会自动删除，可用 toolkit skills uninstall 清理）`)
  }
  return hints
}
