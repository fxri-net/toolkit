// 作用域写命令的纯计划：读配置 → 计算两列表与默认值 → 返回预览与结果，落盘由命令层执行
import { normalizePathForCompare } from "../git-ignore"
import { layerConfigTarget, readLayerConfig, writeLayerConfig, type ConfigLayer, type LayerConfigTarget } from "./config-file"
import { resolveComparablePath, toTreePattern } from "./paths"
import { mergeActivation } from "./plan"
import type { ActivationMode } from "./types"

export type ScopeList = "include" | "exclude"
export type RemoveFrom = ScopeList | "both"

// 配置里的 activation 段（仅用于编辑，不参与判定）
export function currentActivation(config: Record<string, unknown>): Record<string, unknown> {
  const value = config.activation
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

// 字符串数组字段
export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

// 去空、按真实路径去重并保持顺序
export function appendUnique(list: string[], additions: string[]): string[] {
  const seen = new Set(list.map(pathKey))
  const result = [...list]
  for (const item of additions) {
    const key = pathKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

// 路径比较键：绝对路径 + 统一分隔符与大小写，不解析符号链接
export function pathKey(input: string): string {
  return normalizePathForCompare(resolveComparablePath(input))
}

// 作用域当前状态（编辑视角）：denylist 兼容读为 all
export interface ScopeState {
  layer: ConfigLayer
  startDir: string
  target: LayerConfigTarget
  config: Record<string, unknown>
  mode: ActivationMode
  include: string[]
  exclude: string[]
  // 配置里仍是 denylist 的兼容标记：任何写入都会归一为 all
  legacyDenylist: boolean
}

// 一次写命令的计划：next 状态 + 人读变更 + 警告
export interface ScopeEditPlan extends ScopeState {
  nextMode: ActivationMode
  nextInclude: string[]
  nextExclude: string[]
  changes: string[]
  warnings: string[]
  changed: boolean
}

// 读当前状态：不写盘，供 default 查看与命令预览使用
export function readScopeState(layer: ConfigLayer, startDir = process.cwd()): ScopeState {
  const target = layerConfigTarget(layer, startDir)
  if (!target.available) throw new Error(target.reason)
  const config = readLayerConfig(layer, startDir)
  const activation = currentActivation(config)
  const rawMode = activation.mode
  return {
    layer,
    startDir,
    target,
    config,
    mode: rawMode === "allowlist" ? "allowlist" : "all",
    include: stringList(activation.include),
    exclude: stringList(activation.exclude),
    legacyDenylist: rawMode === "denylist",
  }
}

// 默认值人读文案
export function modeLabel(mode: ActivationMode): string {
  return mode === "allowlist" ? "仅名单内生效" : "全部生效"
}

// 由命令计算 next 状态并统一组装计划
function buildPlan(
  state: ScopeState,
  compute: (state: ScopeState) => { mode: ActivationMode; include: string[]; exclude: string[]; changes: string[]; warnings: string[] },
): ScopeEditPlan {
  const next = compute(state)
  const warnings = [...next.warnings]
  if (state.legacyDenylist) warnings.push("已将兼容模式 denylist 归一为 all")
  if (next.mode === "allowlist" && next.include.length === 0) warnings.push("白名单为空，所有目录将不生效")
  const changed =
    state.legacyDenylist ||
    next.mode !== state.mode ||
    !sameList(next.include, state.include) ||
    !sameList(next.exclude, state.exclude)
  return { ...state, nextMode: next.mode, nextInclude: next.include, nextExclude: next.exclude, changes: next.changes, warnings, changed }
}

function sameList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const keys = new Set(left.map(pathKey))
  return right.every((item) => keys.has(pathKey(item)))
}

// 目录按目标层项目根解析；全局层按当前目录解析；tree 时补 /** 覆盖子目录
function resolveDirs(state: ScopeState, dirs: string[], startDir: string, tree = false): string[] {
  return appendUnique(
    [],
    dirs.map((dir) => {
      const resolved = resolveComparablePath(dir, state.target.root ?? startDir)
      return tree ? toTreePattern(resolved) : resolved
    }),
  )
}

// 加入白名单 / 黑名单：同路径在另一侧时就地互转
export function planAdd(
  state: ScopeState,
  list: ScopeList,
  dirs: string[],
  startDir = process.cwd(),
  tree = false,
): ScopeEditPlan {
  const paths = resolveDirs(state, dirs, startDir, tree)
  return buildPlan(state, (current) => {
    const include = [...current.include]
    let exclude = [...current.exclude]
    const changes: string[] = []
    let mode = current.mode
    for (const path of paths) {
      const key = pathKey(path)
      if (list === "include") {
        const moved = exclude.some((item) => pathKey(item) === key)
        if (moved) {
          exclude = exclude.filter((item) => pathKey(item) !== key)
          changes.push(`移入：[白] ${path}（原黑名单）`)
        }
        if (!include.some((item) => pathKey(item) === key)) {
          include.push(path)
          if (!moved) changes.push(`新增：[白] ${path}`)
        }
        mode = "allowlist"
      } else if (!exclude.some((item) => pathKey(item) === key)) {
        exclude.push(path)
        changes.push(`新增：[黑] ${path}`)
      }
    }
    return { mode, include, exclude, changes, warnings: [] }
  })
}

// 移除 / 互转：from 指定来源侧，to 指定转入另一侧
export function planRemove(
  state: ScopeState,
  dirs: string[],
  options: { from: RemoveFrom; to?: ScopeList; startDir?: string },
): ScopeEditPlan {
  const startDir = options.startDir ?? process.cwd()
  const paths = resolveDirs(state, dirs, startDir)
  const keys = new Set(paths.map(pathKey))
  return buildPlan(state, (current) => {
    let include = current.include
    let exclude = current.exclude
    const changes: string[] = []
    if (options.from === "both" || options.from === "include") {
      const removed = include.filter((item) => keys.has(pathKey(item)))
      if (removed.length > 0) changes.push(`移除：[白] ${removed.join("、")}`)
      include = include.filter((item) => !keys.has(pathKey(item)))
    }
    if (options.from === "both" || options.from === "exclude") {
      const removed = exclude.filter((item) => keys.has(pathKey(item)))
      if (removed.length > 0) changes.push(`移除：[黑] ${removed.join("、")}`)
      exclude = exclude.filter((item) => !keys.has(pathKey(item)))
    }
    let mode = current.mode
    if (options.to === "include") {
      const added = paths.filter((path) => !include.some((item) => pathKey(item) === pathKey(path)))
      if (added.length > 0) changes.push(`转入：[白] ${added.join("、")}`)
      include = appendUnique(include, paths)
      mode = "allowlist"
    }
    if (options.to === "exclude") {
      const added = paths.filter((path) => !exclude.some((item) => pathKey(item) === pathKey(path)))
      if (added.length > 0) changes.push(`转入：[黑] ${added.join("、")}`)
      exclude = appendUnique(exclude, paths)
    }
    return { mode, include, exclude, changes, warnings: [] }
  })
}

// 管理条目：remove 移出两列表；flip 从所在侧转到另一侧，两侧同时存在时一并移除
export function planManage(state: ScopeState, dirs: string[], action: "remove" | "flip", startDir = process.cwd()): ScopeEditPlan {
  const paths = resolveDirs(state, dirs, startDir)
  return buildPlan(state, (current) => {
    const keys = new Set(paths.map(pathKey))
    const include = current.include.filter((item) => !keys.has(pathKey(item)))
    const exclude = current.exclude.filter((item) => !keys.has(pathKey(item)))
    const changes: string[] = []
    let mode = current.mode
    for (const path of paths) {
      const key = pathKey(path)
      const wasInclude = current.include.some((item) => pathKey(item) === key)
      const wasExclude = current.exclude.some((item) => pathKey(item) === key)
      if (action === "remove") {
        if (wasInclude) changes.push(`移除：[白] ${path}`)
        if (wasExclude) changes.push(`移除：[黑] ${path}`)
        continue
      }
      if (wasInclude && wasExclude) {
        changes.push(`移除：[白/黑] ${path}（两列表同时存在，已一并移除）`)
      } else if (wasInclude) {
        exclude.push(path)
        changes.push(`转入：[黑] ${path}`)
      } else if (wasExclude) {
        include.push(path)
        mode = "allowlist"
        changes.push(`转入：[白] ${path}`)
      }
    }
    return { mode, include, exclude, changes, warnings: [] }
  })
}

// 切换默认值：on = 全部生效，off = 仅名单内生效
export function planDefault(state: ScopeState, on: boolean): ScopeEditPlan {
  return buildPlan(state, (current) => ({
    mode: on ? "all" : "allowlist",
    include: current.include,
    exclude: current.exclude,
    changes: [`名单模式：${on ? "全部生效" : "仅名单内生效"}`],
    warnings: [],
  }))
}

// 清除限制：全部生效并清空两列表，保留标记 / 远端 / 技能级规则
export function planReset(state: ScopeState): ScopeEditPlan {
  return buildPlan(state, () => ({
    mode: "all",
    include: [],
    exclude: [],
    changes: ["清除限制：全部生效"],
    warnings: [],
  }))
}

// 预览文案：写入文件 + 默认值 + 警告 + 变更
export function describePlan(plan: ScopeEditPlan): string[] {
  if (!plan.changed) return ["没有变化，无需写入"]
  return [`写入：${plan.target.file}`, `名单模式：${modeLabel(plan.nextMode)}`, ...plan.warnings, ...plan.changes]
}

// 落盘：只改 mode / include / exclude，保留 markers / gitRemotes / skills
export function applyPlan(plan: ScopeEditPlan): void {
  writeLayerConfig(
    plan.layer,
    mergeActivation(plan.config, { mode: plan.nextMode, include: plan.nextInclude, exclude: plan.nextExclude }),
    plan.startDir,
  )
}
