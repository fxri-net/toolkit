// 作用域配置加载：三层策略合并、旧 activation 编译、档案解析与一次性编译缓存
import { createHash } from "node:crypto"
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { getHomeDir, inspectConfigLayers, type ConfigLayerName, type ConfigLayers } from "../config"
import { canonicalPath } from "../git-ignore"
import { decideScope } from "./decide"
import { compilePattern, matchPathPattern } from "./pattern"
import {
  compilePolicies,
  decidePolicy,
  isInvalidPolicyId,
  isLegacyPolicyId,
  legacyToPolicies,
  type CompiledPolicySet,
  type ScopePolicyInput,
  type SkillProfileDefinition,
} from "./policy"
import { findGitRoot, findProjectRoot, readGitRemote, resolveComparablePath } from "./paths"
import type {
  ActivationConfig,
  ActivationMode,
  LoadedActivation,
  PolicyDelivery,
  PolicyLayer,
  PolicySkills,
  ScopeCondition,
  ScopeContext,
  ScopeDecision,
  ScopePolicy,
  ScopeProfile,
  SkillActivationConfig,
} from "./types"

const MODES = new Set<ActivationMode>(["all", "allowlist", "denylist"])
// 策略形态合法取值：与 skillDelivery 三态一致
const DELIVERY_VALUES = new Set<PolicyDelivery>(["full", "gated", "off"])

// 配置层顺序：全局 → 项目 → 本地；策略按该顺序拼接，层优先级由判定内核比较
const LAYER_ORDER: ReadonlyArray<{ record: "global" | "project" | "local"; policy: PolicyLayer }> = [
  { record: "global", policy: "global" },
  { record: "project", policy: "project" },
  { record: "local", policy: "local" },
]

// 配置层中文名 → 策略层标识
const POLICY_LAYER_BY_CONFIG: Record<ConfigLayerName, PolicyLayer> = {
  全局层: "global",
  项目层: "project",
  本地层: "local",
}

// 策略层优先级：档案可见性判断使用
const POLICY_LAYER_RANK: Record<PolicyLayer, number> = { global: 1, project: 2, local: 3 }

// 判定结果 + 现场：命令层只消费这里，便于统一打印与 JSON 输出
export interface ScopeReport {
  decision: ScopeDecision
  activation: ActivationConfig | null
  context: ScopeContext
  layer: string | null
  warnings: string[]
  // 判定基准变化提示：旧口径（cwd）与新口径（项目根）结论不同时给出
  migrationHint: string | null
  // 合并后的策略（含旧字段编译产物，layer 已填充）
  policies: ScopePolicy[]
  // 合并后的技能档案（同名按最近层整份覆盖）
  profiles: ScopeProfile[]
  // 最近一层含 policies / skillProfiles 的配置文件
  policySourceFile: string | null
  // 非旧字段编译产物的策略条数
  policyCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

// 字符串数组字段：非数组忽略、非字符串项逐项剔除并告警（降级不静默）
function stringArray(value: unknown, key: string, file: string, warnings: string[]): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    warnings.push(`${file} 的 activation.${key} 须为字符串数组，已忽略`)
    return []
  }
  const items = value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
  if (items.length !== value.length) warnings.push(`${file} 的 activation.${key} 有非字符串或空项，已剔除`)
  return items
}

// 路径规则数组：非字符串项剔除；非法或过于复杂的模式告警并剔除（降级不静默）
function patternArray(value: unknown, key: string, file: string, warnings: string[]): string[] {
  return stringArray(value, key, file, warnings).filter((pattern) => {
    const compiled = compilePattern(pattern)
    if (!compiled.ok) warnings.push(`${file} 的 activation.${key} 规则「${pattern}」已忽略：${compiled.reason}`)
    return compiled.ok
  })
}

// 解析 activation 段：段值非对象按未写处理；mode 非法回落 all
function parseActivation(raw: unknown, file: string, warnings: string[]): ActivationConfig | null {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw)) {
    warnings.push(`${file} 的 activation 须为对象，已忽略该层`)
    return null
  }
  const rawMode = raw.mode
  let mode: ActivationMode = "all"
  if (typeof rawMode === "string" && MODES.has(rawMode as ActivationMode)) {
    mode = rawMode as ActivationMode
  } else if (rawMode !== undefined) {
    warnings.push(`${file} 的 activation.mode 非法（${String(rawMode)}），已回落 all`)
  }
  const markers = isRecord(raw.markers) ? raw.markers : {}
  if (raw.markers !== undefined && !isRecord(raw.markers)) {
    warnings.push(`${file} 的 activation.markers 须为对象，已忽略`)
  }
  return {
    mode,
    include: patternArray(raw.include, "include", file, warnings),
    exclude: patternArray(raw.exclude, "exclude", file, warnings),
    markers: {
      include: stringArray(markers.include, "markers.include", file, warnings),
      exclude: stringArray(markers.exclude, "markers.exclude", file, warnings),
    },
    gitRemotes: stringArray(raw.gitRemotes, "gitRemotes", file, warnings),
    skills: parseSkillRules(raw.skills, file, warnings),
  }
}

// 技能级规则：键支持 glob / re:，非法键或取值告警剔除；只覆盖 mode / include / exclude
function parseSkillRules(
  value: unknown,
  file: string,
  warnings: string[],
): Record<string, SkillActivationConfig> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    warnings.push(`${file} 的 activation.skills 须为对象，已忽略`)
    return undefined
  }
  const out: Record<string, SkillActivationConfig> = {}
  for (const [key, raw] of Object.entries(value)) {
    const compiled = compilePattern(key)
    if (!key.trim() || !compiled.ok) {
      warnings.push(`${file} 的 activation.skills 键「${key}」已忽略${compiled.ok ? "" : `：${compiled.reason}`}`)
      continue
    }
    if (!isRecord(raw)) {
      warnings.push(`${file} 的 activation.skills.${key} 须为对象，已忽略`)
      continue
    }
    const rule: SkillActivationConfig = {}
    if (raw.mode !== undefined) {
      if (typeof raw.mode === "string" && MODES.has(raw.mode as ActivationMode)) {
        rule.mode = raw.mode as ActivationMode
      } else {
        warnings.push(`${file} 的 activation.skills.${key}.mode 非法（${String(raw.mode)}），已忽略该项`)
      }
    }
    if (raw.include !== undefined) rule.include = patternArray(raw.include, `skills.${key}.include`, file, warnings)
    if (raw.exclude !== undefined) rule.exclude = patternArray(raw.exclude, `skills.${key}.exclude`, file, warnings)
    out[key] = rule
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// 按就近覆盖取 activation：本地层 → 项目层 → 全局层；非法段继续向下一层查找
export function loadActivation(startDir = process.cwd()): LoadedActivation {
  return loadActivationFromLayers(inspectConfigLayers(startDir))
}

// 已解析三层配置后取最近一份 activation：避免 resolveScope 重复读盘
function loadActivationFromLayers(layers: ConfigLayers): LoadedActivation {
  const warnings: string[] = []
  for (const record of [layers.local, layers.project, layers.global]) {
    if (!record.hit || !record.config) continue
    const raw = record.config.activation
    if (raw === undefined) continue
    const file = record.file ?? record.layer
    const activation = parseActivation(raw, file, warnings)
    if (activation) {
      return {
        activation,
        sourceFile: record.file,
        layer: record.layer,
        policyLayer: POLICY_LAYER_BY_CONFIG[record.layer],
        warnings,
      }
    }
  }
  return { activation: null, sourceFile: null, layer: null, policyLayer: null, warnings }
}

// 名单解析结果：ok 为 false 表示字段形态错误或含非法模式，整条策略作废
interface ListResult {
  items: string[]
  ok: boolean
}

// 字符串数组：非数组告警并标记结构错误，非字符串 / 空项剔除并告警
function readStringList(
  value: unknown,
  label: string,
  file: string,
  warnings: string[],
): ListResult {
  if (value === undefined) return { items: [], ok: true }
  if (!Array.isArray(value)) {
    warnings.push(`${file} 的 ${label} 须为字符串数组，已忽略`)
    return { items: [], ok: false }
  }
  const items = value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
  if (items.length !== value.length) warnings.push(`${file} 的 ${label} 有非字符串或空项，已剔除`)
  return { items, ok: true }
}

// 模式数组：沿用 compilePattern 校验，非法模式使整条策略作废（避免残缺条件退化成无条件规则）
function readPatternList(
  value: unknown,
  label: string,
  file: string,
  warnings: string[],
): ListResult {
  const listed = readStringList(value, label, file, warnings)
  if (!listed.ok) return listed
  let ok = true
  const items = listed.items.filter((pattern) => {
    const compiled = compilePattern(pattern)
    if (!compiled.ok) {
      warnings.push(`${file} 的 ${label} 模式「${pattern}」已忽略：${compiled.reason}`)
      ok = false
    }
    return compiled.ok
  })
  return { items, ok }
}

// 解析 when：同字段内 OR、跨字段 AND；空字段按未写处理，结构错误返回 null 由调用方作废整条策略
function parseWhen(
  value: unknown,
  label: string,
  file: string,
  warnings: string[],
): ScopeCondition | null | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    warnings.push(`${file} 的 ${label}.when 须为对象，已忽略`)
    return null
  }
  const paths = readPatternList(value.paths, `${label}.when.paths`, file, warnings)
  const subpaths = readPatternList(value.subpaths, `${label}.when.subpaths`, file, warnings)
  const markers = readStringList(value.markers, `${label}.when.markers`, file, warnings)
  const gitRemotes = readPatternList(value.gitRemotes, `${label}.when.gitRemotes`, file, warnings)
  if (!paths.ok || !subpaths.ok || !markers.ok || !gitRemotes.ok) return null
  const when: ScopeCondition = {}
  if (paths.items.length) when.paths = paths.items
  if (subpaths.items.length) when.subpaths = subpaths.items
  if (markers.items.length) when.markers = markers.items
  if (gitRemotes.items.length) when.gitRemotes = gitRemotes.items
  return Object.keys(when).length > 0 ? when : undefined
}

// 解析技能维度：match 限定适用技能，mode / profiles / allow / deny 决定放行
function parseSkills(
  value: unknown,
  label: string,
  file: string,
  warnings: string[],
): PolicySkills | null | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    warnings.push(`${file} 的 ${label}.skills 须为对象，已忽略`)
    return null
  }
  const match = readPatternList(value.match, `${label}.skills.match`, file, warnings)
  const profiles = readStringList(value.profiles, `${label}.skills.profiles`, file, warnings)
  const allow = readPatternList(value.allow, `${label}.skills.allow`, file, warnings)
  const deny = readPatternList(value.deny, `${label}.skills.deny`, file, warnings)
  if (!match.ok || !profiles.ok || !allow.ok || !deny.ok) return null
  const skills: PolicySkills = {}
  if (value.mode !== undefined) {
    if (typeof value.mode === "string" && MODES.has(value.mode as ActivationMode)) {
      skills.mode = value.mode as ActivationMode
    } else {
      warnings.push(`${file} 的 ${label}.skills.mode 非法（${String(value.mode)}），已忽略该规则`)
      return null
    }
  }
  if (match.items.length) skills.match = match.items
  if (profiles.items.length) skills.profiles = profiles.items
  if (allow.items.length) skills.allow = allow.items
  if (deny.items.length) skills.deny = deny.items
  return Object.keys(skills).length > 0 ? skills : undefined
}

// 缺 id 时按层 + 内容派生稳定标识：内容一改 id 即变，提示用户显式写 id
function derivePolicyId(policy: ScopePolicyInput, layer: PolicyLayer): string {
  const material = JSON.stringify({
    layer,
    when: policy.when ?? {},
    skills: policy.skills ?? {},
    effect: policy.effect ?? "allow",
    delivery: policy.delivery ?? null,
  })
  const hash = createHash("sha1").update(material).digest("hex").slice(0, 10)
  return `auto:${layer}:${hash}`
}

// 单条策略：逐字段校验，effect 非法即整条作废；其余非法项剔除后继续
function parsePolicyItem(
  raw: unknown,
  layer: PolicyLayer,
  file: string,
  index: number,
  warnings: string[],
): ScopePolicyInput | null {
  if (!isRecord(raw)) {
    warnings.push(`${file} 的 policies[${index}] 须为对象，已忽略`)
    return null
  }
  let id = ""
  let idInvalid = false
  if (raw.id !== undefined) {
    if (typeof raw.id === "string" && raw.id.trim()) {
      const candidate = raw.id.trim()
      if (isInvalidPolicyId(candidate)) {
        idInvalid = true
        warnings.push(`${file} 的 policies[${index}].id 含空白 / 控制字符或以 legacy: 开头，已按内容派生 id`)
      } else {
        id = candidate
      }
    } else {
      warnings.push(`${file} 的 policies[${index}].id 须为非空字符串，已忽略该项`)
    }
  }
  const label = id || `policies[${index}]`
  if (raw.layer !== undefined) {
    warnings.push(`${file} 的 ${label}.layer 由配置文件所在层决定，已忽略`)
  }
  let name: string | undefined
  if (raw.name !== undefined) {
    if (typeof raw.name === "string" && raw.name.trim()) name = raw.name.trim()
    else warnings.push(`${file} 的 ${label}.name 须为非空字符串，已忽略`)
  }
  let effect: "allow" | "deny" = "allow"
  if (raw.effect !== undefined) {
    if (raw.effect === "allow" || raw.effect === "deny") effect = raw.effect
    else {
      warnings.push(`${file} 的 ${label}.effect 非法（${String(raw.effect)}），已忽略该规则`)
      return null
    }
  }
  let delivery: PolicyDelivery | undefined
  if (raw.delivery !== undefined) {
    if (typeof raw.delivery === "string" && DELIVERY_VALUES.has(raw.delivery as PolicyDelivery)) {
      delivery = raw.delivery as PolicyDelivery
    } else {
      warnings.push(`${file} 的 ${label}.delivery 非法（${String(raw.delivery)}），已忽略该项`)
    }
  }
  // 拒绝的规则不能声明全文：语义互斥，丢弃 delivery 后按拒绝推导形态
  if (delivery === "full" && effect === "deny") {
    warnings.push(`${file} 的 ${label} 同时声明拒绝与全文形态，已忽略 delivery（拒绝的规则不能声明全文）`)
    delivery = undefined
  }
  const when = parseWhen(raw.when, label, file, warnings)
  const skills = parseSkills(raw.skills, label, file, warnings)
  if (when === null || skills === null) {
    warnings.push(`${file} 的 ${label} 含非法条件，已忽略该规则`)
    return null
  }
  const policy: ScopePolicyInput = { id, name, when, skills, effect, delivery, layer }
  if (!id) {
    policy.id = derivePolicyId(policy, layer)
    warnings.push(
      idInvalid
        ? `${file} 的 ${label} 的 id 非法（空白 / 控制字符 / legacy: 前缀），已按内容派生 ${policy.id}`
        : `${file} 的 ${label} 缺少 id，已按内容派生 ${policy.id}；建议显式写 id（内容变更后 id 会变）`,
    )
  }
  if (!when) warnings.push(`${file} 的策略 ${policy.id} 未设置 when 条件（兜底规则），请确认影响范围`)
  return policy
}

// 解析单层 policies 数组：非数组整段忽略，逐条校验后保留合法项
function parsePolicies(
  value: unknown,
  layer: PolicyLayer,
  file: string,
  warnings: string[],
): ScopePolicyInput[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    warnings.push(`${file} 的 policies 须为数组，已忽略`)
    return []
  }
  const out: ScopePolicyInput[] = []
  value.forEach((raw, index) => {
    const policy = parsePolicyItem(raw, layer, file, index, warnings)
    if (policy) out.push(policy)
  })
  return out
}

// 解析单层技能档案：键为档案名，allow / deny 沿用模式校验
function parseProfiles(
  value: unknown,
  layer: PolicyLayer,
  file: string,
  warnings: string[],
): ScopeProfile[] {
  if (value === undefined) return []
  if (!isRecord(value)) {
    warnings.push(`${file} 的 skillProfiles 须为对象，已忽略`)
    return []
  }
  const out: ScopeProfile[] = []
  for (const [name, raw] of Object.entries(value)) {
    if (!name.trim()) {
      warnings.push(`${file} 的 skillProfiles 存在空档案名，已忽略`)
      continue
    }
    if (!isRecord(raw)) {
      warnings.push(`${file} 的档案 ${name} 须为对象，已忽略`)
      continue
    }
    const allow = readPatternList(raw.allow, `skillProfiles.${name}.allow`, file, warnings)
    const deny = readPatternList(raw.deny, `skillProfiles.${name}.deny`, file, warnings)
    if (!allow.ok || !deny.ok) {
      warnings.push(`${file} 的档案 ${name} 含非法模式，已忽略`)
      continue
    }
    if (raw.allow === undefined && raw.deny === undefined) {
      warnings.push(`${file} 的档案 ${name} 未配置 allow / deny，视为空档案`)
    }
    out.push({ name, allow: allow.items, deny: deny.items, layer })
  }
  return out
}

// 同名档案按最近层整份覆盖：删除后重插，生效项排到列表尾部
function mergeProfiles(candidates: ScopeProfile[]): ScopeProfile[] {
  const map = new Map<string, ScopeProfile>()
  for (const profile of candidates) {
    map.delete(profile.name)
    map.set(profile.name, profile)
  }
  return [...map.values()]
}

// 策略 id 跨层唯一：重复保留后者（更高层 / 同层后写），并告警
function mergePolicies(candidates: ScopePolicyInput[], warnings: string[]): ScopePolicyInput[] {
  const map = new Map<string, ScopePolicyInput>()
  for (const policy of candidates) {
    const existing = map.get(policy.id)
    if (existing) {
      warnings.push(`策略 id 重复：${policy.id}（${existing.layer} 与 ${policy.layer}），保留后者`)
      map.delete(policy.id)
    }
    map.set(policy.id, policy)
  }
  return [...map.values()]
}

// 引用校验：未知档案告警并剔除引用；更高层档案告警但保留（当前项目仍可解析）
function validateProfileRefs(
  policies: ScopePolicyInput[],
  profiles: ScopeProfile[],
  profileLayers: Map<string, PolicyLayer[]>,
  warnings: string[],
): void {
  const names = new Set(profiles.map((profile) => profile.name))
  for (const policy of policies) {
    const refs = policy.skills?.profiles
    if (!refs) continue
    const kept = refs.filter((name) => {
      if (!names.has(name)) {
        warnings.push(`策略 ${policy.id} 引用的档案「${name}」不存在，已忽略该引用`)
        return false
      }
      const layers = profileLayers.get(name) ?? []
      const rank = POLICY_LAYER_RANK[policy.layer ?? "global"]
      if (layers.length > 0 && !layers.some((layer) => POLICY_LAYER_RANK[layer] <= rank)) {
        warnings.push(
          `策略 ${policy.id} 引用的档案「${name}」只在 ${layers.join(" / ")} 层定义，当前层无法稳定引用；已保留引用（当前项目仍可解析）`,
        )
      }
      return true
    })
    if (kept.length !== refs.length) policy.skills = { ...policy.skills, profiles: kept }
  }
}

// 档案 → 内核定义：只传名称与两份名单
function toProfileDefinitions(profiles: ScopeProfile[]): Record<string, SkillProfileDefinition> {
  const out: Record<string, SkillProfileDefinition> = {}
  for (const profile of profiles) out[profile.name] = { allow: profile.allow, deny: profile.deny }
  return out
}

interface ScopeSnapshot {
  activation: ActivationConfig | null
  sourceFile: string | null
  layer: string | null
  policies: ScopePolicyInput[]
  profiles: ScopeProfile[]
  warnings: string[]
  compiled: CompiledPolicySet
  policySourceFile: string | null
}

// 进程内快照：配置内容签名变化即重建，避免逐次命令重复编译正则
const SNAPSHOT_LIMIT = 8
const snapshots = new Map<string, ScopeSnapshot>()

// 显式失效：库形态长驻进程与测试在改配置后可主动清空
export function resetScopeCache(): void {
  snapshots.clear()
}

function snapshotFor(key: string, build: () => ScopeSnapshot): ScopeSnapshot {
  const hit = snapshots.get(key)
  if (hit) return hit
  const snapshot = build()
  if (snapshots.size >= SNAPSHOT_LIMIT) {
    const oldest = snapshots.keys().next().value
    if (oldest !== undefined) snapshots.delete(oldest)
  }
  snapshots.set(key, snapshot)
  return snapshot
}

// 配置文件指纹：路径 + 修改时间 + 大小，配置改动或增删层都能被识别，且不必逐次序列化整份配置
function layerSignature(layers: ConfigLayers): string {
  return [layers.global, layers.project, layers.local]
    .map((record) => {
      if (!record.file) return ""
      try {
        const info = statSync(record.file)
        return `${record.file}\u0000${info.mtimeMs}\u0000${info.size}`
      } catch {
        return `${record.file}\u0000missing`
      }
    })
    .join("\u0001")
}

// 最近一层含策略 / 档案的配置文件：status / list 展示策略来源
function nearestPolicySourceFile(layers: ConfigLayers): string | null {
  for (const record of [layers.local, layers.project, layers.global]) {
    if (!record.hit || !record.config) continue
    if (record.config.policies !== undefined || record.config.skillProfiles !== undefined) return record.file
  }
  return null
}

// 组装快照：最近一份旧 activation 编译为同层基线，新 policies / skillProfiles 逐层合并
function buildSnapshot(layers: ConfigLayers, baseDir: string): ScopeSnapshot {
  const legacy = loadActivationFromLayers(layers)
  const warnings = [...legacy.warnings]
  const legacyPolicies =
    legacy.activation && legacy.policyLayer ? legacyToPolicies(legacy.activation, legacy.policyLayer) : []
  const newPolicies: ScopePolicyInput[] = []
  const profileCandidates: ScopeProfile[] = []
  for (const { record, policy: layer } of LAYER_ORDER) {
    const layerRecord = layers[record]
    if (!layerRecord.config) continue
    const file = layerRecord.file ?? layerRecord.layer
    newPolicies.push(...parsePolicies(layerRecord.config.policies, layer, file, warnings))
    profileCandidates.push(...parseProfiles(layerRecord.config.skillProfiles, layer, file, warnings))
  }
  const profiles = mergeProfiles(profileCandidates)
  const profileLayers = new Map<string, PolicyLayer[]>()
  for (const profile of profileCandidates) {
    profileLayers.set(profile.name, [...(profileLayers.get(profile.name) ?? []), profile.layer])
  }
  const policies = mergePolicies([...legacyPolicies, ...newPolicies], warnings)
  validateProfileRefs(policies, profiles, profileLayers, warnings)
  const compiled = compilePolicies(policies, baseDir, {
    home: getHomeDir(),
    profiles: toProfileDefinitions(profiles),
  })
  return {
    activation: legacy.activation,
    sourceFile: legacy.sourceFile,
    layer: legacy.layer,
    policies,
    profiles,
    warnings,
    compiled,
    policySourceFile: nearestPolicySourceFile(layers),
  }
}

// 判定现场：只为策略实际引用的 marker / gitRemotes 读取现场，未引用时不启动 git
function buildContext(
  policies: ScopePolicyInput[],
  cwd: string,
  baseDir: string,
  startDir: string,
  skillName: string | undefined,
): ScopeContext {
  const markerNames = new Set<string>()
  let needsRemote = false
  for (const policy of policies) {
    for (const marker of policy.when?.markers ?? []) markerNames.add(marker)
    if ((policy.when?.gitRemotes ?? []).length > 0) needsRemote = true
  }
  const context: ScopeContext = {
    cwd,
    baseDir,
    skill: skillName,
    gitRoot: null,
    gitRemote: null,
    markers: new Set<string>(),
  }
  if (markerNames.size > 0 || needsRemote) context.gitRoot = findGitRoot(startDir)
  for (const name of markerNames) {
    if (existsSync(join(cwd, name))) context.markers.add(name)
    else if (context.gitRoot && existsSync(join(context.gitRoot, name))) context.markers.add(name)
  }
  if (needsRemote && context.gitRoot) context.gitRemote = readGitRemote(context.gitRoot)
  return context
}

// 对外策略：去掉内核专用的 legacyTier，避免进入 JSON 契约
function toPublicPolicy(policy: ScopePolicyInput): ScopePolicy {
  return {
    id: policy.id,
    name: policy.name,
    when: policy.when,
    skills: policy.skills,
    effect: policy.effect,
    layer: policy.layer,
    ...(policy.delivery ? { delivery: policy.delivery } : {}),
  }
}

// 组装判定现场并给出结论：策略为空时默认全域生效
export function resolveScope(startDir = process.cwd(), skillName?: string): ScopeReport {
  const cwd = resolveComparablePath(startDir)
  // 判定基准取项目根：子目录内按整个项目匹配，精确路径即可覆盖其下所有层级
  const baseDir = resolveComparablePath(findProjectRoot(startDir))
  const layers = inspectConfigLayers(startDir)
  const key = `${cwd}\u0000${baseDir}\u0000${getHomeDir()}\u0000${layerSignature(layers)}`
  const snapshot = snapshotFor(key, () => buildSnapshot(layers, baseDir))
  const context = buildContext(snapshot.policies, cwd, baseDir, startDir, skillName)
  const policyDecision = decidePolicy(snapshot.compiled, context)
  // 完全未配置时沿用旧文案，避免 status 输出与既有快照漂移
  const reason =
    !snapshot.activation && snapshot.policies.length === 0
      ? "未配置作用域（默认全域生效）"
      : policyDecision.reason
  const decision: ScopeDecision = {
    active: policyDecision.active,
    mode: snapshot.activation?.mode ?? "all",
    baseDir,
    sourceFile: snapshot.sourceFile,
    matchedRule: policyDecision.matchedRule,
    reason,
    delivery: policyDecision.delivery,
  }
  const hint =
    migrationHint(snapshot.activation, context, decision, snapshot.sourceFile) ??
    legacyPathHint(snapshot.activation, context)
  return {
    decision,
    activation: snapshot.activation,
    context,
    layer: snapshot.layer,
    warnings: [...snapshot.warnings],
    migrationHint: hint,
    policies: snapshot.policies.map(toPublicPolicy),
    profiles: snapshot.profiles.map((profile) => ({ ...profile })),
    policySourceFile: snapshot.policySourceFile,
    policyCount: snapshot.policies.filter((policy) => !isLegacyPolicyId(policy.id)).length,
  }
}

// 真实路径迁移提示：符号链接前缀不再自动解析，旧规则按真实形态写入时提示改用 pwd 看到的路径
// 仅诊断用 realpath，不参与匹配结论；只在「当前基准不命中、真实形态基准命中」时提示，避免大小写差异误报
// 由 scope status 打印，guard 不输出
function legacyPathHint(activation: ActivationConfig | null, context: ScopeContext): string | null {
  if (!activation) return null
  const realBase = canonicalPath(context.baseDir)
  if (realBase === context.baseDir) return null
  // 目录级与技能级规则都参与诊断：任一规则按真实形态书写且当前基准不命中，即给出提示
  const skillRules = Object.values(activation.skills ?? {}).flatMap((rule) => [...(rule.include ?? []), ...(rule.exclude ?? [])])
  const rules = [...activation.include, ...activation.exclude, ...skillRules]
  const hit = rules.find(
    (rule) =>
      !matchPathPattern(context.baseDir, rule, { baseDir: context.baseDir }) &&
      matchPathPattern(realBase, rule, { baseDir: realBase }),
  )
  if (!hit) return null
  return `规则「${hit}」疑似按真实路径写入：符号链接前缀不再解析，请改用 pwd 看到的路径（当前项目根 ${context.baseDir}）`
}

// 判定基准迁移提示：仅路径规则参与对比；markers / gitRemotes 不依赖基准，避免假告警
function migrationHint(
  activation: ActivationConfig | null,
  context: ScopeContext,
  decision: ScopeDecision,
  sourceFile: string | null,
): string | null {
  if (!activation) return null
  if (context.baseDir === context.cwd) return null
  if (activation.include.length === 0 && activation.exclude.length === 0) return null
  const legacy = decideScope(activation, { ...context, baseDir: context.cwd }, sourceFile)
  if (legacy.active === decision.active) return null
  return `判定基准已改为项目根：本目录按旧口径${legacy.active ? "生效" : "不生效"}，按项目根${decision.active ? "生效" : "不生效"}；请核对 activation 规则`
}
