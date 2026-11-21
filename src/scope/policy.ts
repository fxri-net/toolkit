// 作用域策略内核：加载期编译一次（模式、具体度、顺序），判定期只做线性匹配与比较
// 多规则按覆盖语义取唯一命中：层 → 具体度 → deny 优先 → 后写覆盖，不合并多条规则
import { normalizePathForCompare } from "../git-ignore"
import { compilePattern, REGEX_PREFIX, type CompiledPattern } from "./pattern"
import { normalizeRemote, normalizeRulePath } from "./paths"
import type {
  ActivationConfig,
  ActivationMode,
  PolicyLayer,
  PolicySkills,
  ScopeCondition,
  ScopeContext,
  ScopePolicy,
} from "./types"

// 编译输入：legacyTier 只由旧字段编译产物填写，用于固定其在同层内的角色优先级
export interface ScopePolicyInput extends ScopePolicy {
  legacyTier?: number
}

// 技能档案：允许 / 拒绝名单在加载期编译
export interface SkillProfileDefinition {
  allow?: string[]
  deny?: string[]
}

type CompiledProfiles = Record<string, { allow: CompiledPattern[]; deny: CompiledPattern[] }>

// 编译后的路径规则：source 保留原文用于具体度比较，test 只接受已归一的目标变体
interface PathMatcher {
  source: string
  test(value: string): boolean
}

// 编译后的技能维度：match 为适用技能，其余为放行判定名单
interface CompiledSkillDimension {
  mode: ActivationMode
  profiles: string[]
  allow: CompiledPattern[]
  deny: CompiledPattern[]
}

export interface CompiledPolicy {
  policy: ScopePolicy
  id: string
  name: string | null
  layer: PolicyLayer
  layerRank: number
  // 同层基础层级：新策略统一高于旧字段编译产物，旧字段内部按角色固定
  tier: number
  // 声明顺序：同层同具体度时后写覆盖
  order: number
  effect: "allow" | "deny"
  paths: PathMatcher[]
  subpaths: PathMatcher[]
  markers: string[]
  remotes: CompiledPattern[]
  skillMatch: CompiledPattern[] | null
  skillDimension: CompiledSkillDimension | null
  conditionCount: number
  pathTier: number
  pathLength: number
}

export interface CompiledPolicySet {
  policies: CompiledPolicy[]
  profiles: CompiledProfiles
  legacyCount: number
}

export interface CompileOptions {
  // home 目录：测试与跨平台场景可注入
  home?: string
  // 技能档案定义：引用未知名由加载层告警，判定时按未命中处理
  profiles?: Record<string, SkillProfileDefinition>
}

export interface PolicyDecision {
  active: boolean
  matchedRule: string | null
  matchedPolicy: ScopePolicy | null
  reason: string
}

const LAYER_RANK: Record<PolicyLayer, number> = { global: 1, project: 2, local: 3 }
const DEFAULT_LAYER: PolicyLayer = "global"
// 新策略层级：恒高于同层旧字段编译产物
const NEW_POLICY_TIER = 100
const LEGACY_ID_PREFIX = "legacy:"

// 旧字段编译产物的固定角色层级：排除 > 允许 > 兜底，技能级整体高于目录级
const LEGACY_TIER = {
  directoryFallback: 10,
  directoryAllow: 20,
  directoryExclude: 30,
  skillFallback: 40,
  skillAllow: 50,
  skillExclude: 60,
  directoryMarkerExclude: 70,
} as const

// 性能计数器：只统计加载期编译与排序，判定期必须保持为零
const stats = { compiles: 0, sorts: 0 }

export function readPolicyStats(): { compiles: number; sorts: number } {
  return { ...stats }
}

export function resetPolicyStats(): void {
  stats.compiles = 0
  stats.sorts = 0
}

// 旧字段编译产物的标识前缀：命令层据此标注只读
export function isLegacyPolicyId(id: string): boolean {
  return id.startsWith(LEGACY_ID_PREFIX)
}

function nonEmpty(list: string[] | undefined): string[] {
  return (list ?? []).filter((item) => item.trim() !== "")
}

// 路径规则：glob 先按判定基准解析为绝对路径，正则保留原文，与 matchPathPattern 口径一致
function compilePathMatcher(pattern: string, baseDir: string, home?: string): PathMatcher | null {
  const source = pattern.startsWith(REGEX_PREFIX) ? pattern : normalizeRulePath(pattern, baseDir, home)
  stats.compiles += 1
  const compiled = compilePattern(source, true)
  if (!compiled.ok) return null
  return { source: pattern, test: (value) => compiled.pattern.test(value) }
}

// 扁平规则（远端 / 技能名）：只做文本匹配，不做路径归一
function compileFlatMatcher(pattern: string): CompiledPattern | null {
  stats.compiles += 1
  const compiled = compilePattern(pattern, true)
  return compiled.ok ? compiled.pattern : null
}

// 路径规则批量编译：任一项非法即整条策略作废，避免残缺规则被当成无条件匹配
function compilePathList(list: string[], baseDir: string, home?: string): PathMatcher[] | null {
  const out: PathMatcher[] = []
  for (const pattern of list) {
    const matcher = compilePathMatcher(pattern, baseDir, home)
    if (!matcher) return null
    out.push(matcher)
  }
  return out
}

function compileFlatList(list: string[]): CompiledPattern[] | null {
  const out: CompiledPattern[] = []
  for (const pattern of list) {
    const matcher = compileFlatMatcher(pattern)
    if (!matcher) return null
    out.push(matcher)
  }
  return out
}

function compileSkillDimension(skills: PolicySkills | undefined): CompiledSkillDimension | null {
  if (!skills) return null
  const profiles = nonEmpty(skills.profiles)
  const allow = compileFlatList(nonEmpty(skills.allow))
  const deny = compileFlatList(nonEmpty(skills.deny))
  if (!allow || !deny) return null
  return { mode: skills.mode ?? "all", profiles, allow, deny }
}

function compileProfiles(profiles: Record<string, SkillProfileDefinition> | undefined): CompiledProfiles {
  const out: CompiledProfiles = {}
  for (const [name, definition] of Object.entries(profiles ?? {})) {
    const allow = compileFlatList(nonEmpty(definition.allow))
    const deny = compileFlatList(nonEmpty(definition.deny))
    if (!allow || !deny) continue
    out[name] = { allow, deny }
  }
  return out
}

// 编译单条策略：字段全空视为无条件规则，非法模式使整条策略作废
function compileOne(
  input: ScopePolicyInput,
  index: number,
  baseDir: string,
  options: CompileOptions,
): CompiledPolicy | null {
  const layer = input.layer ?? DEFAULT_LAYER
  const id = input.id.trim() ? input.id : `${layer}:policy:${index}`
  const when: ScopeCondition = input.when ?? {}
  const pathList = nonEmpty(when.paths)
  const subpathList = nonEmpty(when.subpaths)
  const paths = compilePathList(pathList, baseDir, options.home)
  const subpaths = compilePathList(subpathList, baseDir, options.home)
  if (!paths || !subpaths) return null
  const remotes = compileFlatList(nonEmpty(when.gitRemotes))
  if (!remotes) return null
  const rawSkillMatch = input.skills?.match
  const skillMatchList = nonEmpty(rawSkillMatch)
  const skillMatch = rawSkillMatch === undefined || skillMatchList.length === 0 ? null : compileFlatList(skillMatchList)
  if (rawSkillMatch !== undefined && skillMatchList.length > 0 && !skillMatch) return null
  const skillDimension = compileSkillDimension(input.skills)
  if (!skillDimension && input.skills) return null
  const markers = nonEmpty(when.markers)
  const pathSources = [...paths, ...subpaths].map((matcher) => matcher.source)
  const conditionCount =
    (pathList.length > 0 ? 1 : 0) +
    (subpathList.length > 0 ? 1 : 0) +
    (markers.length > 0 ? 1 : 0) +
    (remotes.length > 0 ? 1 : 0) +
    (input.skills ? 1 : 0)
  return {
    policy: input,
    id,
    name: input.name?.trim() ? input.name : null,
    layer,
    layerRank: LAYER_RANK[layer],
    tier: input.legacyTier ?? NEW_POLICY_TIER,
    order: index,
    effect: input.effect ?? "allow",
    paths,
    subpaths,
    markers,
    remotes,
    skillMatch,
    skillDimension,
    conditionCount,
    pathTier: subpathList.length > 0 ? 2 : pathList.length > 0 ? 1 : 0,
    pathLength: pathSources.reduce((max, source) => Math.max(max, source.length), 0),
  }
}

// 基础排序：层 → 角色层级 → 具体度静态部分 → 后写；技能维度具体度依赖当前技能，判定期再补算
function compareBase(left: CompiledPolicy, right: CompiledPolicy): number {
  if (left.layerRank !== right.layerRank) return right.layerRank - left.layerRank
  if (left.tier !== right.tier) return right.tier - left.tier
  if (left.pathTier !== right.pathTier) return right.pathTier - left.pathTier
  if (left.conditionCount !== right.conditionCount) return right.conditionCount - left.conditionCount
  if (left.pathLength !== right.pathLength) return right.pathLength - left.pathLength
  return right.order - left.order
}

// 加载期一次性完成编译、具体度预计算与排序
export function compilePolicies(
  inputs: ScopePolicyInput[],
  baseDir: string,
  options: CompileOptions = {},
): CompiledPolicySet {
  const policies: CompiledPolicy[] = []
  inputs.forEach((input, index) => {
    const compiled = compileOne(input, index, baseDir, options)
    if (compiled) policies.push(compiled)
  })
  stats.sorts += 1
  policies.sort(compareBase)
  return {
    policies,
    profiles: compileProfiles(options.profiles),
    legacyCount: policies.filter((policy) => policy.id.startsWith(LEGACY_ID_PREFIX)).length,
  }
}

// 目标路径变体：Windows 带盘符时同时准备去盘符形态，使同一份规则在各系统结论一致
function targetVariants(target: string): string[] {
  const withoutDrive = target.replace(/^[a-z]:/, "")
  return withoutDrive === target ? [target] : [target, withoutDrive]
}

interface DecisionView {
  baseTargets: string[]
  cwdTargets: string[]
  atRoot: boolean
  skill: string | undefined
  markers: Set<string>
  remote: string | null
}

interface MatchResult {
  // 子目录条件在项目根执行：allow 规则按拒绝参与竞争
  failClosed: boolean
  // 命中的最长路径文本，用于同具体度比较
  length: number
  // 技能选择器具体度：精确名 2、glob 1、无约束 0
  selectorTier: number
}

// 路径字段匹配：任一规则命中即可（同字段 OR），返回命中的最长规则文本长度
function matchPathField(matchers: PathMatcher[], targets: string[]): number | null {
  let best: number | null = null
  for (const matcher of matchers) {
    const hit = targets.some((target) => matcher.test(target))
    if (hit && (best === null || matcher.source.length > best)) best = matcher.source.length
  }
  return best
}

// 远端字段匹配：远端先归一，再按扁平文本匹配
function matchRemoteField(remotes: CompiledPattern[], remote: string | null): boolean {
  if (!remote) return false
  const target = normalizePathForCompare(normalizeRemote(remote))
  return remotes.some((pattern) => pattern.test(target))
}

// 技能选择器：精确名优先于 glob，均未命中则不适用该策略
function matchSkillSelector(matchers: CompiledPattern[], skill: string | undefined): number | null {
  if (!skill) return null
  const normalized = skill.toLowerCase()
  let tier = 0
  for (const matcher of matchers) {
    if (matcher.source.toLowerCase() === normalized) return 2
    if (tier === 0 && matcher.test(skill)) tier = 1
  }
  return tier === 0 ? null : tier
}

// 单条策略匹配：跨字段 AND；子目录规则在项目根执行时 allow 失败关闭、deny 不适用
function matchPolicy(policy: CompiledPolicy, view: DecisionView): MatchResult | null {
  let length = 0
  if (policy.paths.length > 0) {
    const hit = matchPathField(policy.paths, view.baseTargets)
    if (hit === null) return null
    length = Math.max(length, hit)
  }
  if (policy.markers.length > 0 && !policy.markers.some((marker) => view.markers.has(marker))) return null
  if (policy.remotes.length > 0 && !matchRemoteField(policy.remotes, view.remote)) return null
  const selectorTier = policy.skillMatch ? matchSkillSelector(policy.skillMatch, view.skill) : 0
  if (selectorTier === null) return null
  if (policy.subpaths.length > 0) {
    if (view.atRoot) {
      // 子目录条件在项目根无法满足：allow 按拒绝参与竞争，deny 视为不适用
      if (policy.effect === "deny") return null
      return { failClosed: true, length: policy.pathLength, selectorTier }
    }
    const hit = matchPathField(policy.subpaths, view.cwdTargets)
    if (hit === null) return null
    length = Math.max(length, hit)
  }
  return { failClosed: false, length, selectorTier }
}

interface Rank {
  layerRank: number
  tier: number
  pathTier: number
  selectorTier: number
  conditionCount: number
  pathLength: number
  deny: boolean
  order: number
}

// 优先级比较：层 → 角色层级 → 具体度（子目录 > 路径 / 技能精确 > glob / 条件数 / 路径长度）→ deny → 后写
function outranks(left: Rank, right: Rank): boolean {
  if (left.layerRank !== right.layerRank) return left.layerRank > right.layerRank
  if (left.tier !== right.tier) return left.tier > right.tier
  if (left.pathTier !== right.pathTier) return left.pathTier > right.pathTier
  if (left.selectorTier !== right.selectorTier) return left.selectorTier > right.selectorTier
  if (left.conditionCount !== right.conditionCount) return left.conditionCount > right.conditionCount
  if (left.pathLength !== right.pathLength) return left.pathLength > right.pathLength
  if (left.deny !== right.deny) return left.deny
  return left.order >= right.order
}

// 技能名单判定：allowlist 需命中 profiles / allow 且不在 deny；denylist 与 all 仅 deny 排除
function evaluateSkills(
  dimension: CompiledSkillDimension | null,
  profiles: CompiledProfiles,
  skill: string | undefined,
): { allowed: boolean; note: string } {
  if (!dimension) return { allowed: true, note: "" }
  if (!skill) return { allowed: true, note: "（未指定技能，技能名单未参与）" }
  const profileMatchers = dimension.profiles.flatMap((name) => (profiles[name] ? [profiles[name]] : []))
  const denied =
    dimension.deny.some((pattern) => pattern.test(skill)) ||
    profileMatchers.some((profile) => profile.deny.some((pattern) => pattern.test(skill)))
  if (denied) return { allowed: false, note: `技能 ${skill} 在排除名单` }
  if (dimension.mode !== "allowlist") return { allowed: true, note: "" }
  const allowed =
    dimension.allow.some((pattern) => pattern.test(skill)) ||
    profileMatchers.some((profile) => profile.allow.some((pattern) => pattern.test(skill)))
  return allowed ? { allowed: true, note: "" } : { allowed: false, note: `技能 ${skill} 不在允许名单` }
}

// 命中规则的可读标识：id 为机器键，name 存在时附带展示
function policyLabel(policy: CompiledPolicy): string {
  return policy.name ? `policy:${policy.id} (${policy.name})` : `policy:${policy.id}`
}

// 纯判定：无规则命中默认允许；命中后按覆盖语义只取最高优先规则
export function decidePolicy(set: CompiledPolicySet, context: ScopeContext): PolicyDecision {
  const baseTarget = normalizeRulePath(context.baseDir)
  const cwdTarget = normalizeRulePath(context.cwd)
  const view: DecisionView = {
    baseTargets: targetVariants(baseTarget),
    cwdTargets: targetVariants(cwdTarget),
    atRoot: baseTarget === cwdTarget,
    skill: context.skill,
    markers: context.markers,
    remote: context.gitRemote,
  }
  let winner: CompiledPolicy | null = null
  let winnerRank: Rank | null = null
  let winnerMatch: MatchResult | null = null
  for (const policy of set.policies) {
    const match = matchPolicy(policy, view)
    if (!match) continue
    const rank: Rank = {
      layerRank: policy.layerRank,
      tier: policy.tier,
      pathTier: policy.pathTier,
      selectorTier: match.selectorTier,
      conditionCount: policy.conditionCount,
      pathLength: match.length,
      deny: policy.effect === "deny",
      order: policy.order,
    }
    if (winnerRank && !outranks(rank, winnerRank)) continue
    winner = policy
    winnerRank = rank
    winnerMatch = match
  }
  if (!winner || !winnerMatch) {
    return {
      active: true,
      matchedRule: null,
      matchedPolicy: null,
      reason: "未命中策略（默认全域生效）",
    }
  }
  const label = policyLabel(winner)
  if (winnerMatch.failClosed) {
    return {
      active: false,
      matchedRule: label,
      matchedPolicy: winner.policy,
      reason: `策略 ${label} 含子目录条件，在项目根执行按拒绝处理`,
    }
  }
  if (winner.effect === "deny") {
    return {
      active: false,
      matchedRule: label,
      matchedPolicy: winner.policy,
      reason: `命中策略 ${label}：拒绝该范围`,
    }
  }
  const skills = evaluateSkills(winner.skillDimension, set.profiles, context.skill)
  if (!skills.allowed) {
    return {
      active: false,
      matchedRule: label,
      matchedPolicy: winner.policy,
      reason: `命中策略 ${label}：${skills.note}`,
    }
  }
  return {
    active: true,
    matchedRule: label,
    matchedPolicy: winner.policy,
    reason: `命中策略 ${label}：允许该范围${skills.note}`,
  }
}

// 旧字段标识：层 + 角色 + 序号，稳定且跨层唯一
function legacyId(layer: PolicyLayer, role: string, suffix: string | number): string {
  return `${LEGACY_ID_PREFIX}${layer}:${role}:${suffix}`
}

// 旧字段编译：最近一份 activation 的目录条件与技能级规则转成同层策略
// 覆盖语义要求每组规则自带兜底，保证旧行为在新内核下结论不变
export function legacyToPolicies(activation: ActivationConfig, layer: PolicyLayer = DEFAULT_LAYER): ScopePolicyInput[] {
  const out: ScopePolicyInput[] = []
  const shared: ScopeCondition = {}
  if (activation.markers.include.length > 0) shared.markers = [...activation.markers.include]
  if (activation.gitRemotes.length > 0) shared.gitRemotes = [...activation.gitRemotes]
  const hasShared = Object.keys(shared).length > 0

  // 目录级排除先于启用条件：旧实现中排除无论标记 / 远端是否满足都生效
  activation.exclude.forEach((path, index) => {
    out.push({
      id: legacyId(layer, "exclude", index),
      when: { paths: [path] },
      effect: "deny",
      layer,
      legacyTier: LEGACY_TIER.directoryExclude,
    })
  })
  activation.markers.exclude.forEach((marker, index) => {
    out.push({
      id: legacyId(layer, "marker-exclude", index),
      when: { markers: [marker] },
      effect: "deny",
      layer,
      legacyTier: LEGACY_TIER.directoryMarkerExclude,
    })
  })

  // 目录级基线：allowlist 每条白名单产生允许规则，空白名单只剩兜底拒绝
  if (activation.mode === "allowlist") {
    activation.include.forEach((path, index) => {
      out.push({
        id: legacyId(layer, "include", index),
        when: { ...shared, paths: [path] },
        effect: "allow",
        layer,
        legacyTier: LEGACY_TIER.directoryAllow,
      })
    })
    out.push({
      id: legacyId(layer, "fallback", 0),
      when: {},
      effect: "deny",
      layer,
      legacyTier: LEGACY_TIER.directoryFallback,
    })
  } else if (hasShared) {
    // 标记 / 远端为正条件：满足时允许，缺条件时由兜底拒绝覆盖
    out.push({
      id: legacyId(layer, "open", 0),
      when: { ...shared },
      effect: "allow",
      layer,
      legacyTier: LEGACY_TIER.directoryAllow,
    })
    out.push({
      id: legacyId(layer, "fallback", 0),
      when: {},
      effect: "deny",
      layer,
      legacyTier: LEGACY_TIER.directoryFallback,
    })
  }

  // 技能级规则：覆盖 mode / include / exclude，标记与远端沿用目录级
  for (const [key, rule] of Object.entries(activation.skills ?? {})) {
    const mode = rule.mode ?? activation.mode
    const include = rule.include ?? activation.include
    const exclude = rule.exclude ?? activation.exclude
    const target: PolicySkills = { match: [key] }
    exclude.forEach((path, index) => {
      out.push({
        id: legacyId(layer, "skill-exclude", `${key}:${index}`),
        when: { paths: [path] },
        skills: target,
        effect: "deny",
        layer,
        legacyTier: LEGACY_TIER.skillExclude,
      })
    })
    if (mode === "allowlist") {
      include.forEach((path, index) => {
        out.push({
          id: legacyId(layer, "skill-include", `${key}:${index}`),
          when: { ...shared, paths: [path] },
          skills: target,
          effect: "allow",
          layer,
          legacyTier: LEGACY_TIER.skillAllow,
        })
      })
      out.push({
        id: legacyId(layer, "skill-fallback", key),
        when: {},
        skills: target,
        effect: "deny",
        layer,
        legacyTier: LEGACY_TIER.skillFallback,
      })
      continue
    }
    if (hasShared) {
      out.push({
        id: legacyId(layer, "skill-open", key),
        when: { ...shared },
        skills: target,
        effect: "allow",
        layer,
        legacyTier: LEGACY_TIER.skillAllow,
      })
      out.push({
        id: legacyId(layer, "skill-fallback", key),
        when: {},
        skills: target,
        effect: "deny",
        layer,
        legacyTier: LEGACY_TIER.skillFallback,
      })
      continue
    }
    // 无条件 denylist：整体覆盖目录级结论，只保留技能自身的排除项
    out.push({
      id: legacyId(layer, "skill-open", key),
      when: {},
      skills: target,
      effect: "allow",
      layer,
      legacyTier: LEGACY_TIER.skillFallback,
    })
  }
  return out
}
