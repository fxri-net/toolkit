// 作用域配置加载：沿用现有三层配置（就近覆盖），解析 activation 段并组装判定现场
import { existsSync } from "node:fs"
import { join } from "node:path"
import { inspectConfigLayers } from "../config"
import { canonicalPath } from "../git-ignore"
import { decideScope } from "./decide"
import { compilePattern, matchPathPattern } from "./pattern"
import { findGitRoot, findProjectRoot, readGitRemote, resolveComparablePath } from "./paths"
import type { ActivationConfig, ActivationMode, LoadedActivation, ScopeContext, ScopeDecision, SkillActivationConfig } from "./types"

const MODES = new Set<ActivationMode>(["all", "allowlist", "denylist"])

// 判定结果 + 现场：命令层只消费这里，便于统一打印与 JSON 输出
export interface ScopeReport {
  decision: ScopeDecision
  activation: ActivationConfig | null
  context: ScopeContext
  layer: string | null
  warnings: string[]
  // 判定基准变化提示：旧口径（cwd）与新口径（项目根）结论不同时给出
  migrationHint: string | null
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
  const layers = inspectConfigLayers(startDir)
  const warnings: string[] = []
  for (const record of [layers.local, layers.project, layers.global]) {
    if (!record.hit || !record.config) continue
    const raw = record.config.activation
    if (raw === undefined) continue
    const file = record.file ?? record.layer
    const activation = parseActivation(raw, file, warnings)
    if (activation) return { activation, sourceFile: record.file, layer: record.layer, warnings }
  }
  return { activation: null, sourceFile: null, layer: null, warnings }
}

// 组装判定现场并给出结论：未配置 gitRemotes / markers 时不启动 git、不查标记
// 传入技能名时命中技能级规则则覆盖 mode / include / exclude，其余条件沿用目录级
export function resolveScope(startDir = process.cwd(), skillName?: string): ScopeReport {
  const { activation, sourceFile, layer, warnings } = loadActivation(startDir)
  // 展示与文件系统判断保留原始大小写与分隔符；大小写折叠只发生在规则匹配函数内部
  const cwd = resolveComparablePath(startDir)
  // 判定基准取项目根：子目录内按整个项目匹配，精确路径即可覆盖其下所有层级
  const baseDir = resolveComparablePath(findProjectRoot(startDir))
  const context: ScopeContext = {
    cwd,
    baseDir,
    skill: skillName,
    gitRoot: null,
    gitRemote: null,
    markers: new Set<string>(),
  }
  if (activation) {
    const markerNames = [...activation.markers.include, ...activation.markers.exclude]
    if (markerNames.length > 0 || activation.gitRemotes.length > 0) context.gitRoot = findGitRoot(startDir)
    for (const name of markerNames) {
      if (existsSync(join(cwd, name))) context.markers.add(name)
      else if (context.gitRoot && existsSync(join(context.gitRoot, name))) context.markers.add(name)
    }
    if (activation.gitRemotes.length > 0 && context.gitRoot) context.gitRemote = readGitRemote(context.gitRoot)
  }
  const decision = decideScope(activation, context, sourceFile)
  const hint = migrationHint(activation, context, decision, sourceFile) ?? legacyPathHint(activation, context)
  return { decision, activation, context, layer, warnings, migrationHint: hint }
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
