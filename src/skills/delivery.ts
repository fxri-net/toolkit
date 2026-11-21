// 技能分发形态：三态互斥，由单一解析器按优先级推导，供安装 / 计划 / 状态共用
// 优先级（高 → 低）：技能声明退出 → 命令行显式取值 → 显式规则 → 策略推导 → 技能包默认 → 全局默认
// 本模块只做判定，不读配置、不写产物；配置读取在 ./config，落盘在 ./install
import { matchPattern } from "../scope/pattern"
import type { GateRules } from "./types"

// 分发形态：full 全文安装到处可用 / gated 只放入口壳 / off 不安装
export type DeliveryMode = "full" | "gated" | "off"

// 规则来源：显式配置 / 旧键 include / 旧键 exclude；旧键 exclude 保持「排除优先」的旧语义
export type DeliveryOrigin = "config" | "legacy-include" | "legacy-exclude"

// 单条显式规则：match 任一模式命中即算命中（旧键 include / exclude 的名单语义）
export interface DeliveryRule {
  match: string[]
  delivery: DeliveryMode
  origin?: DeliveryOrigin
}

// 配置段解析结果：rules 恒为数组，未配置为空数组
export interface SkillsDeliveryConfig {
  default?: DeliveryMode
  rules: DeliveryRule[]
}

// 推导结论：mode 为目标形态，source 指向命中来源，reason 为一句可复述的人话
export interface DeliveryDecision {
  mode: DeliveryMode
  source: string
  reason: string
}

// 推导入参：policy / packageDefault 由后续能力接入，本版留同签名扩展点
export interface ResolveDeliveryInput {
  name: string
  config?: SkillsDeliveryConfig
  // 命令行显式规则（--gate 对象），优先级高于配置
  rules?: DeliveryRule[]
  // 命令行显式形态（--gate / --embed）
  override?: DeliveryMode
  // 技能包旧声明 metadata.gate：false 表示退出接管，按全文安装
  gate?: boolean
  // 策略推导结论（后续任务接入）
  policy?: DeliveryDecision
  // 技能包默认形态（后续任务接入）
  packageDefault?: DeliveryMode
}

// 来源优先级：旧键 exclude 高于显式配置，保证旧键「排除优先」语义不因映射而反转
const ORIGIN_RANK: Record<DeliveryOrigin, number> = {
  config: 2,
  "legacy-include": 1,
  "legacy-exclude": 3,
}

// 命令行规则的整体优先级：高于一切配置来源
const CLI_RULE_RANK = 4

// 推导过程的一级：命中后定案，未命中进入下一级；供 status --explain 复述
export interface DeliveryLevel {
  level: string
  hit: boolean
  detail: string
}

// 完整推导过程：levels 按优先级排列，overridden 为同具体度被压过的规则
export interface DeliveryExplanation {
  decision: DeliveryDecision
  levels: DeliveryLevel[]
  overridden: string[]
}

// 告警去重集合：同一进程内同一条被压规则只提示一次
const warned = new Set<string>()

// 重置告警去重（测试用：配置现场变化后重新提示）
export function resetDeliveryWarnings(): void {
  warned.clear()
}

// 形态文案：安装、计划、状态共用一份，避免各处措辞漂移
export function deliveryModeLabel(mode: DeliveryMode): string {
  if (mode === "full") return "全文安装"
  if (mode === "gated") return "入口壳"
  return "不安装"
}

// 旧闸门规则映射为分发规则：exclude 标为旧键排除来源，保持排除优先
export function gateRulesToDeliveryRules(rules: GateRules): DeliveryRule[] {
  return [
    ...rules.include.map((pattern): DeliveryRule => ({ match: [pattern], delivery: "gated", origin: "legacy-include" })),
    ...rules.exclude.map((pattern): DeliveryRule => ({ match: [pattern], delivery: "full", origin: "legacy-exclude" })),
  ]
}

// 模式字面量长度：去掉正则前缀与通配 / 元字符后剩余的字面量长度，作为具体度的次级判据
function literalLength(pattern: string): number {
  const body = pattern.startsWith("re:") ? pattern.slice(3) : pattern
  return body.replace(/[\\^$.*+?()[\]{}|]/g, "").length
}

// 单条规则的匹配结果：未命中返回 null，命中给出命中模式数与本规则最大字面量长度
function matchRule(name: string, rule: DeliveryRule): { count: number; literal: number } | null {
  const matched = rule.match.filter((pattern) => matchPattern(name, pattern))
  if (matched.length === 0) return null
  return { count: matched.length, literal: Math.max(...matched.map(literalLength)) }
}

// 规则来源文案：区分命令行、新旧配置与旧键 include / exclude
function ruleSource(rule: DeliveryRule, index: number, cli: boolean): string {
  const match = rule.match.join("、")
  if (cli) return `命令行规则（${match}）`
  if (rule.origin === "legacy-include") return `旧键 skillInstall.gate.include（${match}）`
  if (rule.origin === "legacy-exclude") return `旧键 skillInstall.gate.exclude（${match}）`
  return `skillDelivery.rules[${index}]（${match}）`
}

// 被压规则提示：同一具体度下后一条胜出，前一条的真实受影响范围必须可见（降级不静默）
function warnOverridden(name: string, winner: DeliveryRule, loser: DeliveryRule): void {
  const key = `${name}\u0000${loser.match.join("、")}`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(
    `⚠️ 技能「${name}」同时命中多条分发规则且具体度相同：按最后一条取「${deliveryModeLabel(winner.delivery)}」，已压过「${loser.match.join("、")}」`,
  )
}

// 完整推导：逐级判定并在首个命中定案，同时保留每级命中情况与被压规则
export function explainDelivery(input: ResolveDeliveryInput): DeliveryExplanation {
  const levels: DeliveryLevel[] = []
  const overridden: string[] = []
  const done = (mode: DeliveryMode, source: string, reason: string): DeliveryExplanation => ({
    decision: { mode, source, reason },
    levels,
    overridden,
  })

  // 技能声明退出接管：最高优先级，保留「单点退出」承诺，命令行也不覆盖
  if (input.gate === false) {
    const key = `metadata.gate\u0000${input.name}`
    if (!warned.has(key)) {
      warned.add(key)
      console.warn(`⚠️ 技能「${input.name}」使用旧声明 metadata.gate=false：已按全文安装，建议迁移到 skillDelivery 规则（2.1.0 起移除兼容）`)
    }
    levels.push({ level: "技能声明 metadata.gate", hit: true, detail: "声明为 false，退出内容接管" })
    return done("full", "技能声明 metadata.gate=false", "技能包声明退出内容接管，按全文安装")
  }
  levels.push({ level: "技能声明 metadata.gate", hit: false, detail: "未声明退出（缺省或 true）" })

  // 命令行显式取值：高于配置规则，但低于技能自身的退出声明
  if (input.override !== undefined) {
    levels.push({ level: "命令行显式取值", hit: true, detail: `指定为${deliveryModeLabel(input.override)}` })
    return done(input.override, "命令行显式指定", `命令行把分发形态指定为${deliveryModeLabel(input.override)}`)
  }
  levels.push({ level: "命令行显式取值", hit: false, detail: "未指定" })

  const candidates: Array<{ rule: DeliveryRule; rank: number; index: number; count: number; literal: number; cli: boolean }> = []
  for (const [index, rule] of (input.config?.rules ?? []).entries()) {
    const hit = matchRule(input.name, rule)
    if (!hit) continue
    candidates.push({ rule, rank: ORIGIN_RANK[rule.origin ?? "config"], index, count: hit.count, literal: hit.literal, cli: false })
  }
  for (const [index, rule] of (input.rules ?? []).entries()) {
    const hit = matchRule(input.name, rule)
    if (!hit) continue
    candidates.push({ rule, rank: CLI_RULE_RANK, index, count: hit.count, literal: hit.literal, cli: true })
  }
  if (candidates.length > 0) {
    // 具体度：来源层级 → 命中模式数 → 字面量长度 → 书写顺序（后者胜）
    const ranked = [...candidates].sort((a, b) => b.rank - a.rank || b.count - a.count || b.literal - a.literal || b.index - a.index)
    const winner = ranked[0]!
    const rival = ranked[1]
    if (rival && rival.rank === winner.rank && rival.count === winner.count && rival.literal === winner.literal) {
      warnOverridden(input.name, winner.rule, rival.rule)
      overridden.push(rival.rule.match.join("、"))
    }
    const match = winner.rule.match.join("、")
    levels.push({ level: "显式规则", hit: true, detail: `命中「${match}」→ ${deliveryModeLabel(winner.rule.delivery)}` })
    return done(winner.rule.delivery, ruleSource(winner.rule, winner.index, winner.cli), `命中规则「${match}」→ ${deliveryModeLabel(winner.rule.delivery)}`)
  }
  levels.push({ level: "显式规则", hit: false, detail: "未命中任何 skillDelivery.rules" })

  // 策略推导：矩阵声明限制该技能时按目录收口或不安装
  if (input.policy) {
    levels.push({ level: "策略推导", hit: true, detail: `${input.policy.source} → ${deliveryModeLabel(input.policy.mode)}` })
    return done(input.policy.mode, input.policy.source, input.policy.reason)
  }
  levels.push({ level: "策略推导", hit: false, detail: "未有策略限制该技能" })

  // 技能包默认：后续任务接入 metadata.delivery
  if (input.packageDefault) {
    levels.push({ level: "技能包默认", hit: true, detail: deliveryModeLabel(input.packageDefault) })
    return done(input.packageDefault, "技能包声明 metadata.delivery", `技能包默认形态为${deliveryModeLabel(input.packageDefault)}`)
  }
  levels.push({ level: "技能包默认", hit: false, detail: "未声明 metadata.delivery" })

  if (input.config?.default) {
    levels.push({ level: "全局默认", hit: true, detail: deliveryModeLabel(input.config.default) })
    return done(input.config.default, "skillDelivery.default", `未命中规则，取配置默认${deliveryModeLabel(input.config.default)}`)
  }
  levels.push({ level: "全局默认", hit: false, detail: "未配置 skillDelivery.default，回落全文安装" })
  return done("full", "默认", "未配置分发形态，按默认全文安装")
}

// 推导目标形态：首个命中的优先级层级定案，并给出可复述的来源与原因
export function resolveDelivery(input: ResolveDeliveryInput): DeliveryDecision {
  return explainDelivery(input).decision
}
