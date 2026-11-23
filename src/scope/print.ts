// 作用域输出的统一文本：命令与向导共用同一套人读口径
import { getHomeDir } from "../config"
import { normalizePathForCompare, toPosix } from "../git-ignore"
import { policyEffectText, policyLayerText, scopeModeText, termText } from "../term-style"
import type { ScopeReport } from "./load"
import { isLegacyPolicyId } from "./policy"
import type { ActivationMode } from "./types"

// 展示用路径：折叠 home 前缀，便于人读
// 前缀判断按大小写口径归一（Windows / macOS 默认不区分大小写），输出保留用户原始写法
export function displayPath(path: string | null): string {
  if (!path) return "未配置"
  const home = getHomeDir()
  if (!home) return path
  const pathKey = normalizePathForCompare(path)
  const homeKey = normalizePathForCompare(home)
  if (pathKey === homeKey) return "~"
  if (!pathKey.startsWith(`${homeKey}/`)) return path
  return `~${toPosix(path).slice(toPosix(home).replace(/\/+$/, "").length)}`
}

// 空列表显示「未配置」
function displayList(items: string[]): string {
  return items.length > 0 ? items.join("、") : "未配置"
}

// 名单模式人读：denylist 兼容读取为全部生效，保留原值提示
function displayMode(mode: ActivationMode): string {
  return termText(scopeModeText, mode)
}

// 默认全部生效时，白名单不参与判定：有内容时明确标注
function displayInclude(items: string[], mode: ActivationMode): string {
  const text = displayList(items)
  return mode !== "allowlist" && items.length > 0 ? `${text}（当前默认全部生效，未参与判定）` : text
}

// 命中策略的人读名：名单配置生成的规则只显示中文名，避免把内部 id 暴露到人读输出
function matchedRuleText(report: ScopeReport): string | null {
  const rule = report.decision.matchedRule
  if (!rule) return null
  const id = rule.startsWith("policy:") ? (rule.slice("policy:".length).split(/[（( ]/)[0] ?? "") : ""
  const policy = id ? report.policies.find((item) => item.id === id) : undefined
  if (!policy) return rule
  if (isLegacyPolicyId(policy.id)) return policy.name ?? "名单规则"
  return policy.name ? `${rule}（${policy.name}）` : rule
}

// status 文本行：旧 activation 与策略分开呈现，避免只有策略时显示「未配置 / 模式 all」
export function formatStatus(report: ScopeReport): string[] {
  const { decision } = report
  const legacyCount = report.policies.filter((policy) => isLegacyPolicyId(policy.id)).length
  const lines = [
    "作用域状态：",
    `  当前目录：${displayPath(report.context.cwd)}`,
    `  判定目录：${displayPath(decision.baseDir)}${decision.baseDir === report.context.cwd ? "" : "（项目根）"}`,
    `  结果：${decision.active ? "生效" : "未生效"}`,
  ]
  if (report.activation) lines.push(`  名单模式：${displayMode(decision.mode)}`)
  if (legacyCount > 0) lines.push(`  名单规则：${legacyCount} 条（由名单配置生成）`)
  if (report.policyCount > 0) lines.push(`  策略规则：${report.policyCount} 条（查看：toolkit scope policy list）`)
  lines.push(`  命中策略：${matchedRuleText(report) ?? "未命中"}`)
  lines.push(`  配置来源：${displayPath(report.activation ? decision.sourceFile : report.policySourceFile)}`)
  if (
    report.activation &&
    report.policyCount > 0 &&
    report.policySourceFile &&
    report.policySourceFile !== decision.sourceFile
  ) {
    lines.push(`  策略来源：${displayPath(report.policySourceFile)}`)
  }
  lines.push(`  判定说明：${decision.reason}`)
  return lines
}

// 白名单裸路径提示：仅名单内生效且条目无通配符时，提示覆盖不到子目录
export function plainIncludeHint(report: ScopeReport): string | null {
  if (!report.activation || report.decision.mode !== "allowlist") return null
  const plain = report.activation.include.filter((item) => !item.startsWith("re:") && !/[*?]/.test(item))
  if (plain.length === 0) return null
  return `白名单条目 ${plain.join("、")} 只匹配该目录自身；要覆盖其下项目请改为 <目录>/**（或在添加时加 --tree）`
}

// list 文本行：旧 activation 字段 + 新策略条目；旧字段编译产物已在 activation 段呈现，不重复列出
export function formatList(report: ScopeReport): string[] {
  const activation = report.activation
  const policies = report.policies.filter((policy) => !isLegacyPolicyId(policy.id))
  const lines = [
    "作用域名单与策略：",
    `  配置来源：${displayPath(activation ? report.decision.sourceFile : report.policySourceFile)}${report.layer ? `（${report.layer}）` : ""}`,
    `  判定目录：${displayPath(report.decision.baseDir)}`,
  ]
  if (activation) {
    lines.push(
      `  名单模式：${displayMode(report.decision.mode)}`,
      `  白名单：${displayInclude(activation.include, report.decision.mode)}`,
      `  黑名单：${displayList(activation.exclude)}`,
      `  启用标记：${displayList(activation.markers.include)}`,
      `  排除标记：${displayList(activation.markers.exclude)}`,
      `  git 远端：${displayList(activation.gitRemotes)}`,
      `  技能级规则：${formatSkillRules(activation.skills ?? {})}`,
    )
  }
  if (activation && report.policyCount > 0 && report.policySourceFile && report.policySourceFile !== report.decision.sourceFile) {
    lines.push(`  策略来源：${displayPath(report.policySourceFile)}`)
  }
  if (policies.length > 0) {
    lines.push("  策略规则：")
    for (const policy of policies) {
      const name = policy.name ? `（${policy.name}）` : ""
      const layer = termText(policyLayerText, policy.layer ?? "global")
      const effect = termText(policyEffectText, policy.effect ?? "allow")
      lines.push(`    ${layer} ${policy.id}${name} ${effect}`)
    }
  }
  return lines
}

// 技能级规则摘要：键 + 覆盖的模式，避免把整段对象塞进一行
function formatSkillRules(rules: Record<string, { mode?: string }>): string {
  const entries = Object.entries(rules)
  if (entries.length === 0) return "未配置"
  return entries.map(([key, rule]) => `${key}（${rule.mode ?? "继承模式"}）`).join("、")
}
