// 作用域策略写命令的纯计划层：读取层配置 → 生成变更与 nextConfig，落盘由命令层执行
import { randomUUID } from "node:crypto"
import { confirmWrite, reportWrite } from "../cli-ui"
import { getHomeDir } from "../config"
import { isInteractive } from "../prompts"
import { listPackageSkills } from "../skills/source"
import { line } from "../term-style"
import { layerConfigTarget, readLayerConfig, writeLayerConfig, type LayerConfigTarget } from "./config-file"
import { resolveScope } from "./load"
import { compilePattern, matchPathPattern } from "./pattern"
import { findProjectRoot, resolveComparablePath } from "./paths"
import { isInvalidPolicyId } from "./policy"
import type { ActivationMode, PolicyLayer, PolicySkills, ScopeCondition, ScopePolicy } from "./types"

// 策略层顺序：与配置读取顺序一致
export const POLICY_LAYERS: readonly PolicyLayer[] = ["global", "project", "local"]
const MODES: readonly ActivationMode[] = ["all", "allowlist", "denylist"]
const LAYER_RANK: Record<PolicyLayer, number> = { global: 1, project: 2, local: 3 }

export interface PolicyState {
  layer: PolicyLayer
  startDir: string
  target: LayerConfigTarget
  config: Record<string, unknown>
  // 原始 policies 数组：保留未识别字段，写回时只增删目标项
  raw: unknown[]
  profiles: Record<string, unknown>
}

// 单次写命令的计划：nextConfig 为完整配置，命令层统一预览与落盘
export interface PolicyEditPlan {
  layer: PolicyLayer
  startDir: string
  target: LayerConfigTarget
  nextConfig: Record<string, unknown>
  changes: string[]
  warnings: string[]
  // 规则 / 档案明细：预览阶段逐行展示，确认前可核对完整内容
  details: string[]
  // 需要额外 --yes 确认（整域拒绝 / 整层清空）
  requiresYes: boolean
  changed: boolean
}

export interface PolicyAddInput {
  id?: string
  name?: string
  effect: "allow" | "deny"
  when?: ScopeCondition
  skills?: PolicySkills
}

export interface PolicyRemoveInput {
  id?: string
  name?: string
}

export interface PolicyResetInput {
  ids?: string[]
  paths?: string[]
  all?: boolean
  // 命令层按 --yes / --dry-run 计算：true 才允许整层清空
  confirmed: boolean
}

export interface ProfileUpsertInput {
  name: string
  allow?: string[]
  deny?: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

// 读取目标层原始配置：policies 与 skillProfiles 保持原始形态，供增删时保留未知字段
export function readPolicyState(layer: PolicyLayer, startDir = process.cwd()): PolicyState {
  const target = layerConfigTarget(layer, startDir)
  if (!target.available) throw new Error(`${target.reason}；未写入配置`)
  const config = readLayerConfig(layer, startDir)
  const raw = Array.isArray(config.policies) ? config.policies : []
  const profiles = isRecord(config.skillProfiles) ? config.skillProfiles : {}
  return { layer, startDir, target, config, raw: [...raw], profiles: { ...profiles } }
}

export interface LayerProfile {
  name: string
  allow: string[]
  deny: string[]
}

// 层内档案：按原始配置列出，供 profile 列表按 --layer 过滤
export function listProfilesInLayer(state: PolicyState): LayerProfile[] {
  return Object.entries(state.profiles).map(([name, raw]) => {
    const record = isRecord(raw) ? raw : {}
    return {
      name,
      allow: Array.isArray(record.allow) ? record.allow.filter((item): item is string => typeof item === "string") : [],
      deny: Array.isArray(record.deny) ? record.deny.filter((item): item is string => typeof item === "string") : [],
    }
  })
}

// 策略可读标识：id + 可选名称
function labelOf(raw: unknown): string {
  if (!isRecord(raw)) return "未命名策略"
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : "(缺 id)"
  const name = typeof raw.name === "string" && raw.name.trim() ? `（${raw.name}）` : ""
  return `${id}${name}`
}

// 模式校验：非法即中止，错误文案统一以「未写入配置」收尾
function assertPattern(pattern: string, label: string): void {
  const compiled = compilePattern(pattern)
  if (!compiled.ok) throw new Error(`${label} 模式「${pattern}」非法：${compiled.reason}；未写入配置`)
}

function validateWhen(when: ScopeCondition | undefined): void {
  if (!when) return
  for (const [key, label] of [
    ["paths", "--paths"],
    ["subpaths", "--subpaths"],
    ["gitRemotes", "--git-remotes"],
  ] as const) {
    for (const pattern of when[key] ?? []) assertPattern(pattern, label)
  }
  for (const marker of when.markers ?? []) {
    if (!marker.trim()) throw new Error("--markers 不能包含空项；未写入配置")
  }
}

// 精确技能名（非 glob / 正则）才按包内清单校验；模式写法留给用户自行控制范围
function isExactSkillName(value: string): boolean {
  return !value.startsWith("re:") && !value.includes("*") && !value.includes("?")
}

// 精确技能名校验：档案与策略共用同一份包内清单
function validateSkillNames(patterns: string[]): void {
  const exact = patterns.filter(isExactSkillName)
  if (exact.length === 0) return
  const known = new Set(listPackageSkills().map((skill) => skill.name))
  const missing = exact.filter((name) => !known.has(name))
  if (missing.length > 0) throw new Error(`未找到技能「${missing.join("、")}」；未写入配置`)
}

// 档案定义层：三层原始 skillProfiles 的键，用于判断策略能否稳定引用
function profileLayerMap(startDir: string): Map<string, PolicyLayer[]> {
  const map = new Map<string, PolicyLayer[]>()
  for (const layer of POLICY_LAYERS) {
    const config = readLayerConfig(layer, startDir)
    const profiles = isRecord(config.skillProfiles) ? config.skillProfiles : {}
    for (const name of Object.keys(profiles)) {
      map.set(name, [...(map.get(name) ?? []), layer])
    }
  }
  return map
}

// 档案可见性：策略只能引用其所在层及更低层定义的档案，否则换项目后引用会失效
function validateProfileVisibility(names: string[], startDir: string, layer: PolicyLayer): void {
  if (names.length === 0) return
  const map = profileLayerMap(startDir)
  const missing: string[] = []
  const hidden: string[] = []
  for (const name of names) {
    const defined = map.get(name)
    if (!defined) {
      missing.push(name)
      continue
    }
    if (!defined.some((item) => LAYER_RANK[item] <= LAYER_RANK[layer])) {
      hidden.push(`${name}（只在 ${defined.join(" / ")} 层定义）`)
    }
  }
  if (missing.length > 0) throw new Error(`未找到档案「${missing.join("、")}」；未写入配置`)
  if (hidden.length > 0) {
    throw new Error(`档案「${hidden.join("、")}」，${layer} 层策略只能引用同层及更低层档案；未写入配置`)
  }
}

// deny 规则内核只按 skills.match 选技能，名单类字段不会被读取：缺 match 时拒绝写入，避免留下无效字段
function assertDenySkillScope(effect: "allow" | "deny", skills: PolicySkills | undefined): void {
  if (effect !== "deny" || !skills) return
  const hasLists = Boolean(skills.mode || skills.profiles?.length || skills.allow?.length || skills.deny?.length)
  if (hasLists && !skills.match?.length) {
    throw new Error(
      "deny 不接受技能名单（--mode / --profile / --allow / --deny）；只拒绝某个技能请用 toolkit scope skills deny；未写入配置",
    )
  }
}

// 技能维度校验：模式、档案可见性与精确技能名
function validateSkills(skills: PolicySkills | undefined, startDir: string, layer: PolicyLayer): void {
  if (!skills) return
  if (skills.mode && !MODES.includes(skills.mode)) {
    throw new Error(`技能模式须为 ${MODES.join(" / ")}；未写入配置`)
  }
  const patterns = [...(skills.match ?? []), ...(skills.allow ?? []), ...(skills.deny ?? [])]
  for (const pattern of patterns) assertPattern(pattern, "技能名单")
  const profiles = skills.profiles ?? []
  validateProfileVisibility(profiles, startDir, layer)
  validateSkillNames(patterns)
}

// 跨层 id 唯一：返回已占用该 id 的层，供报错定位
function findPolicyLayerById(startDir: string, id: string): PolicyLayer | null {
  for (const layer of POLICY_LAYERS) {
    const config = readLayerConfig(layer, startDir)
    const list = Array.isArray(config.policies) ? config.policies : []
    if (list.some((item) => isRecord(item) && item.id === id)) return layer
  }
  return null
}

// 其它层是否已有同名策略：--name 删除时用于要求显式 --layer
function otherLayerHasName(startDir: string, layer: PolicyLayer, name: string): boolean {
  for (const candidate of POLICY_LAYERS) {
    if (candidate === layer) continue
    const config = readLayerConfig(candidate, startDir)
    const list = Array.isArray(config.policies) ? config.policies : []
    if (list.some((item) => isRecord(item) && item.name === name)) return true
  }
  return false
}

function finalizePlan(
  state: PolicyState,
  nextConfig: Record<string, unknown>,
  changes: string[],
  warnings: string[] = [],
  requiresYes = false,
  details: string[] = [],
): PolicyEditPlan {
  return {
    layer: state.layer,
    startDir: state.startDir,
    target: state.target,
    nextConfig,
    changes,
    warnings,
    details,
    requiresYes,
    changed: JSON.stringify(nextConfig) !== JSON.stringify(state.config),
  }
}

// 只重写 policies 段，其余段原样保留
function planForPolicies(
  state: PolicyState,
  nextRaw: unknown[],
  changes: string[],
  warnings: string[] = [],
  requiresYes = false,
  details: string[] = [],
): PolicyEditPlan {
  const nextConfig = { ...state.config }
  if (nextRaw.length > 0) nextConfig.policies = nextRaw
  else delete nextConfig.policies
  return finalizePlan(state, nextConfig, changes, warnings, requiresYes, details)
}

// 策略 id：稳定机器键，禁止空白 / 控制字符与 legacy: 前缀，避免联动解析失败与只读误标
function assertPolicyId(id: string): void {
  if (isInvalidPolicyId(id)) {
    throw new Error("策略 id 不能包含空白 / 控制字符，且不能以 legacy: 开头；未写入配置")
  }
}

// 策略明细：预览逐行展示条件与技能维度
function policyDetails(policy: ScopePolicy): string[] {
  const when: string[] = []
  if (policy.when?.paths?.length) when.push(`paths=${policy.when.paths.join(",")}`)
  if (policy.when?.subpaths?.length) when.push(`subpaths=${policy.when.subpaths.join(",")}`)
  if (policy.when?.markers?.length) when.push(`markers=${policy.when.markers.join(",")}`)
  if (policy.when?.gitRemotes?.length) when.push(`remotes=${policy.when.gitRemotes.join(",")}`)
  const skills: string[] = []
  if (policy.skills?.match?.length) skills.push(`match=${policy.skills.match.join(",")}`)
  if (policy.skills?.mode) skills.push(`mode=${policy.skills.mode}`)
  if (policy.skills?.profiles?.length) skills.push(`profiles=${policy.skills.profiles.join(",")}`)
  if (policy.skills?.allow?.length) skills.push(`allow=${policy.skills.allow.join(",")}`)
  if (policy.skills?.deny?.length) skills.push(`deny=${policy.skills.deny.join(",")}`)
  return [
    `效果：${policy.effect ?? "allow"}`,
    `条件：${when.join("；") || "全部目录（兜底）"}`,
    `技能：${skills.join("；") || "无"}`,
  ]
}

// 新增策略：id 缺省自动生成且不可变；deny 未限定技能时标记需 --yes
export function planPolicyAdd(state: PolicyState, input: PolicyAddInput): PolicyEditPlan {
  validateWhen(input.when)
  assertDenySkillScope(input.effect, input.skills)
  validateSkills(input.skills, state.startDir, state.layer)
  const id = input.id?.trim() || `policy-${randomUUID()}`
  assertPolicyId(id)
  const occupied = findPolicyLayerById(state.startDir, id)
  if (occupied) throw new Error(`策略 id「${id}」已存在于 ${occupied} 层；未写入配置`)
  const policy: ScopePolicy = { id, effect: input.effect }
  if (input.name?.trim()) policy.name = input.name.trim()
  if (input.when && Object.keys(input.when).length > 0) policy.when = input.when
  if (input.skills && Object.keys(input.skills).length > 0) policy.skills = input.skills
  const warnings: string[] = []
  let requiresYes = false
  if (!policy.when) warnings.push("未设置 when 条件（兜底规则），会影响该层全部目录")
  if (policy.effect === "deny" && !policy.skills?.match?.length) {
    warnings.push("deny 规则会拒绝该范围全部技能；限定技能请改用 toolkit scope skills deny")
    requiresYes = true
  }
  if (policy.effect === "allow" && policy.skills) {
    const hasAllow = Boolean(policy.skills.allow?.length || policy.skills.profiles?.length)
    if (hasAllow && policy.skills.mode !== "allowlist") warnings.push("allow / profile 仅在 --mode allowlist 下生效")
    if (policy.skills.mode === "allowlist" && !hasAllow) warnings.push("allowlist 未配置 allow / profile，该范围将不允许任何技能")
    if (policy.skills.mode === "allowlist" && policy.skills.profiles?.length) {
      const profiles = new Map(resolveScope(state.startDir).profiles.map((profile) => [profile.name, profile]))
      const empty = policy.skills.profiles.filter((name) => (profiles.get(name)?.allow.length ?? 0) === 0)
      if (empty.length > 0) warnings.push(`档案 ${empty.join("、")} 没有 allow 项，allowlist 下将不允许任何技能`)
    }
  }
  return planForPolicies(
    state,
    [...state.raw, policy],
    [`新增策略：${labelOf(policy)}`],
    warnings,
    requiresYes,
    policyDetails(policy),
  )
}

// 定位待移除项：--id 精确匹配；--name 仅在该层唯一且无跨层同名时可用
function findRemoveIndex(state: PolicyState, input: PolicyRemoveInput, explicitLayer: boolean): number {
  if (input.id) {
    const index = state.raw.findIndex((item) => isRecord(item) && item.id === input.id)
    if (index < 0) throw new Error(`未找到策略 id「${input.id}」；未写入配置`)
    return index
  }
  const name = input.name?.trim()
  if (!name) throw new Error("请指定 --id 或 --name；未写入配置")
  const matches = state.raw
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isRecord(item) && item.name === name)
  if (matches.length === 0) throw new Error(`未找到策略名「${name}」；未写入配置`)
  if (matches.length > 1) throw new Error(`该层有多个同名策略「${name}」，请改用 --id；未写入配置`)
  if (!explicitLayer && otherLayerHasName(state.startDir, state.layer, name)) {
    throw new Error(`策略名「${name}」在其它层也存在，请显式指定 --layer；未写入配置`)
  }
  const first = matches[0]
  if (!first) throw new Error(`未找到策略名「${name}」；未写入配置`)
  return first.index
}

// 移除策略
export function planPolicyRemove(state: PolicyState, input: PolicyRemoveInput, explicitLayer: boolean): PolicyEditPlan {
  const index = findRemoveIndex(state, input, explicitLayer)
  const removed = state.raw[index]
  const nextRaw = state.raw.filter((_, current) => current !== index)
  return planForPolicies(state, nextRaw, [`移除策略：${labelOf(removed)}`])
}

// 路径条件是否命中给定路径：policy 规则按项目根解析，concrete 路径按 glob / 精确匹配
function matchesPaths(raw: unknown, resetPaths: string[], baseDir: string): boolean {
  if (!isRecord(raw) || !isRecord(raw.when)) return false
  const home = getHomeDir()
  for (const field of ["paths", "subpaths"]) {
    const list = raw.when[field]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (typeof item !== "string") continue
      if (resetPaths.some((path) => matchPathPattern(path, item, { baseDir, home }))) return true
    }
  }
  return false
}

// 清除策略：按 --id / --paths 批量移除；整层清空须显式 --all 且已确认
export function planPolicyReset(state: PolicyState, input: PolicyResetInput): PolicyEditPlan {
  const hasTarget = Boolean(input.all || input.ids?.length || input.paths?.length)
  if (!hasTarget) throw new Error("请指定 --id / --paths，或显式 --all；未写入配置")
  if (input.all && !input.confirmed) throw new Error("--all 会清除该层全部策略，需加 --yes 确认；未写入配置")
  const resetPaths = (input.paths ?? []).map((path) => resolveComparablePath(path, state.startDir, getHomeDir()))
  const baseDir = findProjectRoot(state.startDir)
  const removed: string[] = []
  const nextRaw = state.raw.filter((raw) => {
    const hit =
      input.all ||
      (isRecord(raw) && Boolean(raw.id && input.ids?.includes(String(raw.id)))) ||
      (resetPaths.length > 0 && matchesPaths(raw, resetPaths, baseDir))
    if (!hit) return true
    removed.push(labelOf(raw))
    return false
  })
  if (removed.length === 0) throw new Error("没有匹配的策略；未写入配置")
  const changes = [`移除 ${removed.length} 条策略：${removed.join("、")}`]
  if (input.paths?.length && !input.all && !input.ids?.length) {
    changes.push(`按路径清除：${input.paths.join("、")}`)
  }
  if (state.config.activation !== undefined) {
    changes.push("旧 activation 字段未清除，请用 toolkit scope list reset 处理")
  }
  return planForPolicies(state, nextRaw, changes)
}

// 技能维度批量清除：只删带 skills 的策略，纯路径 / 标记 / 远端策略保留
export function planSkillReset(state: PolicyState, confirmed: boolean): PolicyEditPlan {
  if (!confirmed) throw new Error("清除技能维度策略需加 --yes 确认；未写入配置")
  const removed: string[] = []
  const nextRaw = state.raw.filter((raw) => {
    const hasSkills = isRecord(raw) && isRecord(raw.skills) && Object.keys(raw.skills).length > 0
    if (!hasSkills) return true
    removed.push(labelOf(raw))
    return false
  })
  if (removed.length === 0) throw new Error("该层没有技能维度策略；未写入配置")
  return planForPolicies(state, nextRaw, [`移除 ${removed.length} 条技能策略：${removed.join("、")}`])
}

// 档案写入：整份覆盖同名档案；至少提供 allow / deny 之一
export function planProfileUpsert(state: PolicyState, input: ProfileUpsertInput): PolicyEditPlan {
  const name = input.name.trim()
  if (!name) throw new Error("档案名不能为空；未写入配置")
  if (!input.allow?.length && !input.deny?.length) {
    throw new Error("请至少提供 --allow 或 --deny；未写入配置")
  }
  for (const pattern of [...(input.allow ?? []), ...(input.deny ?? [])]) assertPattern(pattern, "档案名单")
  validateSkillNames([...(input.allow ?? []), ...(input.deny ?? [])])
  const existing = isRecord(state.profiles[name]) ? state.profiles[name] : {}
  const existingAllow = Array.isArray(existing.allow) ? existing.allow : []
  const existingDeny = Array.isArray(existing.deny) ? existing.deny : []
  const warnings: string[] = []
  if (input.allow === undefined && existingAllow.length > 0) warnings.push("未提供 --allow，将清空原 allow 名单")
  if (input.deny === undefined && existingDeny.length > 0) warnings.push("未提供 --deny，将清空原 deny 名单")
  const profile: Record<string, string[]> = {}
  if (input.allow) profile.allow = input.allow
  if (input.deny) profile.deny = input.deny
  const nextProfiles = { ...state.profiles, [name]: profile }
  const nextConfig = { ...state.config, skillProfiles: nextProfiles }
  const details = [
    `档案：${name}`,
    `allow：${input.allow?.length ? input.allow.join("、") : "无"}`,
    `deny：${input.deny?.length ? input.deny.join("、") : "无"}`,
  ]
  return finalizePlan(state, nextConfig, [`写入档案：${name}`], warnings, false, details)
}

// 档案移除影响：三层策略引用与其它层同名定义
function profileImpact(name: string, state: PolicyState): { references: string[]; otherLayers: PolicyLayer[] } {
  const references: string[] = []
  const otherLayers: PolicyLayer[] = []
  for (const layer of POLICY_LAYERS) {
    const config = readLayerConfig(layer, state.startDir)
    const list = Array.isArray(config.policies) ? config.policies : []
    for (const raw of list) {
      if (!isRecord(raw) || !isRecord(raw.skills)) continue
      const profiles = Array.isArray(raw.skills.profiles) ? raw.skills.profiles : []
      if (profiles.includes(name)) references.push(labelOf(raw))
    }
    const profiles = isRecord(config.skillProfiles) ? config.skillProfiles : {}
    if (layer !== state.layer && name in profiles) otherLayers.push(layer)
  }
  return { references, otherLayers }
}

// 档案删除：只删目标层的同名档案；移除前列出引用与回落层，避免 allowlist 静默变全拒绝
export function planProfileRemove(state: PolicyState, name: string): PolicyEditPlan {
  const key = name.trim()
  if (!key || !(key in state.profiles)) throw new Error(`未找到档案「${name}」；未写入配置`)
  const impact = profileImpact(key, state)
  const warnings: string[] = []
  if (impact.references.length > 0) {
    warnings.push(
      `档案「${key}」仍被 ${impact.references.length} 条策略引用：${impact.references.join("、")}；删除后引用会被忽略，allowlist 可能变为全拒绝`,
    )
  }
  if (impact.otherLayers.length > 0) {
    warnings.push(`同名档案仍在 ${impact.otherLayers.join(" / ")} 层定义，删除后回落到该层`)
  }
  const nextProfiles = { ...state.profiles }
  delete nextProfiles[key]
  const nextConfig = { ...state.config }
  if (Object.keys(nextProfiles).length > 0) nextConfig.skillProfiles = nextProfiles
  else delete nextConfig.skillProfiles
  return finalizePlan(state, nextConfig, [`移除档案：${key}`], warnings)
}

// 档案允许项展开：scope skills deny --profile 使用；先校验目标层可见性
export function profileAllowPatterns(startDir: string, names: string[], layer: PolicyLayer): string[] {
  if (names.length === 0) return []
  validateProfileVisibility(names, startDir, layer)
  const profiles = new Map(resolveScope(startDir).profiles.map((profile) => [profile.name, profile]))
  const missing = names.filter((name) => !profiles.has(name))
  if (missing.length > 0) throw new Error(`未找到档案「${missing.join("、")}」；未写入配置`)
  const empty = names.filter((name) => (profiles.get(name)?.allow.length ?? 0) === 0)
  if (empty.length > 0) throw new Error(`档案「${empty.join("、")}」没有允许项，无法展开为排除技能；未写入配置`)
  return names.flatMap((name) => profiles.get(name)?.allow ?? [])
}

// 预览文本：写入文件 + 规则 / 档案明细 + 告警 + 变更
export function describePolicyPlan(plan: PolicyEditPlan): string[] {
  if (!plan.changed) return ["没有变化，无需写入"]
  return [`写入：${plan.target.file}`, ...plan.details, ...plan.warnings, ...plan.changes]
}

// 落盘：完整 nextConfig 原子写回
export function applyPolicyPlan(plan: PolicyEditPlan): string {
  return writeLayerConfig(plan.layer, plan.nextConfig, plan.startDir)
}

// 预览 → 确认 → 落盘 → 结果块：与 scope 其它写命令同一口径
export async function applyPolicyPlanWithPrompt(
  title: string,
  plan: PolicyEditPlan,
  options: { dryRun?: boolean; yes?: boolean } = {},
): Promise<void> {
  if (!plan.changed) {
    for (const text of describePolicyPlan(plan)) console.log(line.hint(text))
    return
  }
  const confirmed = await confirmWrite({
    title,
    lines: describePolicyPlan(plan),
    yes: Boolean(options.yes) || !isInteractive(),
    dryRun: Boolean(options.dryRun),
  })
  if (options.dryRun) return
  if (!confirmed) {
    console.error(line.hint("已取消，未写入任何文件"))
    return
  }
  const file = applyPolicyPlan(plan)
  reportWrite({ file, notes: plan.changes })
}
