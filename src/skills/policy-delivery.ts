// 分发形态的策略推导：只读策略声明意图，判断技能是否需要按目录收口，不枚举目录
// 带条件的拒绝 / 允许名单收窄 → gated；无条件拒绝 → off；无条件 allow 全量不产生限制
import { resolveScope } from "../scope/load"
import { matchPattern } from "../scope/pattern"
import type { PolicySkills, ScopeCondition, ScopePolicy, ScopeProfile } from "../scope/types"
import { deliveryModeLabel, type DeliveryDecision, type DeliveryMode } from "./delivery"

// 策略推导上下文：一次命令内只解析一次，逐技能复用
export interface PolicyDeliveryContext {
  policies: ScopePolicy[]
  profiles: ScopeProfile[]
}

// 单条策略的命中：mode 为推导形态，score 用于同一技能的「最具体一条」展示
interface PolicyHit {
  id: string
  mode: DeliveryMode
  score: number
  reason: string
}

// 读取当前目录的策略集与档案：供安装 / 计划 / 状态共用，避免各处重复加载
export function loadPolicyDeliveryContext(startDir = process.cwd()): PolicyDeliveryContext {
  const report = resolveScope(startDir)
  return { policies: report.policies, profiles: report.profiles }
}

// 是否带目录 / 标记 / 远端条件：无条件的拒绝会推导为「不安装」
function hasConditions(when: ScopeCondition | undefined): boolean {
  if (!when) return false
  return (
    (when.paths?.length ?? 0) > 0 ||
    (when.subpaths?.length ?? 0) > 0 ||
    (when.markers?.length ?? 0) > 0 ||
    (when.gitRemotes?.length ?? 0) > 0
  )
}

// 技能选择器是否覆盖该技能：未写 match 视为对全部技能生效
function selectorMatches(skills: PolicySkills | undefined, name: string): boolean {
  const match = skills?.match ?? []
  return match.length === 0 || match.some((pattern) => matchPattern(name, pattern))
}

// 选择器具体度：精确名高于 glob，仅用于多策略命中的原因展示
function selectorScore(skills: PolicySkills | undefined, name: string): number {
  const match = skills?.match ?? []
  if (match.some((pattern) => pattern.toLowerCase() === name.toLowerCase())) return 2
  return match.length > 0 ? 1 : 0
}

// 引用的档案：按名取定义，未命中的档案不参与判定
function referencedProfiles(skills: PolicySkills | undefined, profiles: ScopeProfile[]): ScopeProfile[] {
  const names = new Set(skills?.profiles ?? [])
  return profiles.filter((profile) => names.has(profile.name))
}

// 排除名单命中：策略自身的 deny 或引用档案的 deny
function denyHit(skills: PolicySkills | undefined, profiles: ScopeProfile[], name: string): boolean {
  const own = (skills?.deny ?? []).some((pattern) => matchPattern(name, pattern))
  return own || referencedProfiles(skills, profiles).some((profile) => profile.deny.some((pattern) => matchPattern(name, pattern)))
}

// 允许名单命中：策略自身的 allow 或引用档案的 allow
function allowHit(skills: PolicySkills | undefined, profiles: ScopeProfile[], name: string): boolean {
  const own = (skills?.allow ?? []).some((pattern) => matchPattern(name, pattern))
  return own || referencedProfiles(skills, profiles).some((profile) => profile.allow.some((pattern) => matchPattern(name, pattern)))
}

// 允许名单是否为收窄名单：allowlist 且名单与档案都没有全量通配 *
function allowNarrowed(skills: PolicySkills | undefined, profiles: ScopeProfile[]): boolean {
  if (!skills || (skills.mode ?? "all") !== "allowlist") return false
  const own = skills.allow ?? []
  const inherited = referencedProfiles(skills, profiles).flatMap((profile) => profile.allow)
  return ![...own, ...inherited].some((pattern) => pattern.trim() === "*")
}

// 名单配置的兜底拒绝：来自目录 / 技能名单的补集，按带条件限制处理，不按无条件拒绝
function isLegacyFallback(policy: ScopePolicy): boolean {
  return policy.id.startsWith("legacy:") && /:(?:skill-)?fallback:/.test(policy.id)
}

// 单条策略判定：返回命中结论；未限制该技能返回 null
function evaluatePolicy(policy: ScopePolicy, profiles: ScopeProfile[], name: string): PolicyHit | null {
  if (!selectorMatches(policy.skills, name)) return null
  const skills = policy.skills
  const conditional = hasConditions(policy.when)
  const fallback = isLegacyFallback(policy)
  const denial = policy.effect === "deny" || denyHit(skills, profiles, name)
  const narrowed = allowNarrowed(skills, profiles) && !allowHit(skills, profiles, name)
  const declared = policy.delivery
  // 纯允许且未声明形态不构成限制
  if (!denial && !narrowed && !declared) return null
  let mode: DeliveryMode
  let reason: string
  if (denial) {
    // 拒绝：显式声明优先；只有全站拒绝才不安装，带条件 / 名单兜底 / 收窄名单仍装入口壳
    mode = declared === "gated" || declared === "off" ? declared : conditional || fallback ? "gated" : "off"
    reason =
      declared !== undefined
        ? `策略 policy:${policy.id} 拒绝该范围并声明${deliveryModeLabel(mode)}`
        : conditional
          ? `策略 policy:${policy.id} 在该范围拒绝该技能 → 入口壳`
          : fallback
            ? `名单配置在该范围未允许该技能 → 入口壳`
            : `策略 policy:${policy.id} 无条件拒绝该技能 → 不安装`
  } else if (narrowed) {
    mode = declared === "off" ? "off" : "gated"
    reason =
      mode === "off"
        ? `策略 policy:${policy.id} 的允许名单不含该技能并声明不安装`
        : `策略 policy:${policy.id} 的允许名单不含该技能 → 入口壳`
  } else {
    // 显式声明的形态：允许 + full / gated / off 都按声明参与矩阵
    mode = declared as DeliveryMode
    reason = `策略 policy:${policy.id} 声明该范围为${deliveryModeLabel(mode)}`
  }
  const score =
    selectorScore(skills, name) * 10000 +
    Math.max(
      0,
      ...((policy.when?.paths ?? []).map((pattern) => pattern.length)),
      ...((policy.when?.subpaths ?? []).map((pattern) => pattern.length)),
    ) +
    (conditional ? 1000 : 0)
  return { id: policy.id, mode, score, reason }
}

// 策略级推导：多个策略命中时 source 列出全部 id，reason 取最具体一条
export function derivePolicyDelivery(name: string, context: PolicyDeliveryContext): DeliveryDecision | undefined {
  const hits: PolicyHit[] = []
  for (const policy of context.policies) {
    const hit = evaluatePolicy(policy, context.profiles, name)
    if (hit) hits.push(hit)
  }
  if (hits.length === 0) return undefined
  const gated = hits.some((hit) => hit.mode === "gated")
  const off = hits.some((hit) => hit.mode === "off")
  const full = hits.some((hit) => hit.mode === "full")
  // 任一目录收口或不安装都要入口壳；只有「全部不安装」才整体不安装；纯全文声明等同未限制
  const mode: DeliveryMode = gated || (full && off) ? "gated" : off ? "off" : "full"
  if (mode === "full") return undefined
  const best = [...hits].sort((left, right) => right.score - left.score)[0]!
  return {
    mode,
    source: hits.map((hit) => `policy:${hit.id}`).join("、"),
    reason: best.reason,
  }
}
