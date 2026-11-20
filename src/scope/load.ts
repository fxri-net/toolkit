// 作用域配置加载：沿用现有三层配置（就近覆盖），解析 activation 段并组装判定现场
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { inspectConfigLayers } from "../config"
import { canonicalPath } from "../git-ignore"
import { decideScope } from "./decide"
import { compilePattern } from "./pattern"
import { findGitRoot, findProjectRoot, readGitRemote } from "./paths"
import type { ActivationConfig, ActivationMode, LoadedActivation, ScopeContext, ScopeDecision } from "./types"

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
  }
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
export function resolveScope(startDir = process.cwd()): ScopeReport {
  const { activation, sourceFile, layer, warnings } = loadActivation(startDir)
  const cwd = canonicalPath(resolve(startDir))
  // 判定基准取项目根：子目录内按整个项目匹配，精确路径即可覆盖其下所有层级
  const baseDir = canonicalPath(findProjectRoot(startDir))
  const context: ScopeContext = {
    cwd,
    baseDir,
    gitRoot: null,
    gitRemote: null,
    markers: new Set<string>(),
    caseInsensitive: process.platform === "win32",
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
  return { decision, activation, context, layer, warnings, migrationHint: migrationHint(activation, context, decision, sourceFile) }
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
