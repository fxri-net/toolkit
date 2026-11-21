// 作用域输出的统一文本：命令与向导共用同一套人读口径
import { getHomeDir } from "../config"
import { normalizePathForCompare, toPosix } from "../git-ignore"
import type { ScopeReport } from "./load"
import { isLegacyPolicyId } from "./policy"
import type { ActivationMode } from "./types"

// 展示用路径：折叠 home 前缀，便于人读
// 前缀判断按大小写口径归一（Windows / macOS 默认不区分大小写），输出保留用户原始写法
export function displayPath(path: string | null): string {
  if (!path) return "默认（未配置）"
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

// 模式人读：denylist 兼容读为 all，旧配置照实标注
function displayMode(mode: ActivationMode): string {
  return mode === "denylist" ? "all（兼容读取 denylist）" : mode
}

// 默认全部生效时，白名单不参与判定：有内容时明确标注
function displayInclude(items: string[], mode: ActivationMode): string {
  const text = displayList(items)
  return mode !== "allowlist" && items.length > 0 ? `${text}（当前默认全部生效，未参与判定）` : text
}

// status 文本行：旧 activation 与策略分开呈现，避免只有策略时显示「未配置 / 模式 all」
export function formatStatus(report: ScopeReport): string[] {
  const { decision } = report
  const lines = [
    "作用域状态：",
    `  当前目录：${displayPath(report.context.cwd)}`,
    `  判定基准：${displayPath(decision.baseDir)}${decision.baseDir === report.context.cwd ? "" : "（项目根）"}`,
    `  结果：${decision.active ? "生效" : "未生效"}`,
  ]
  if (report.activation) lines.push(`  模式：${displayMode(decision.mode)}`)
  if (report.policyCount > 0) lines.push(`  策略：${report.policyCount} 条（toolkit scope policy list）`)
  lines.push(`  命中规则：${decision.matchedRule ?? "未命中"}`)
  lines.push(`  来源：${displayPath(report.activation ? decision.sourceFile : report.policySourceFile)}`)
  if (
    report.activation &&
    report.policyCount > 0 &&
    report.policySourceFile &&
    report.policySourceFile !== decision.sourceFile
  ) {
    lines.push(`  策略来源：${displayPath(report.policySourceFile)}`)
  }
  lines.push(`  原因：${decision.reason}`)
  return lines
}

// list 文本行：旧 activation 字段 + 新策略条目；旧字段编译产物已在 activation 段呈现，不重复列出
export function formatList(report: ScopeReport): string[] {
  const activation = report.activation
  const policies = report.policies.filter((policy) => !isLegacyPolicyId(policy.id))
  const lines = [
    "作用域规则：",
    `  来源：${displayPath(activation ? report.decision.sourceFile : report.policySourceFile)}${report.layer ? `（${report.layer}）` : ""}`,
    `  判定基准：${displayPath(report.decision.baseDir)}`,
  ]
  if (activation) {
    lines.push(
      `  模式：${displayMode(report.decision.mode)}`,
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
      lines.push(`    [${policy.layer}] ${policy.id}${name} ${policy.effect ?? "allow"}`)
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
