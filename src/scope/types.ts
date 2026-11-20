// 作用域配置与判定结果：配置段的类型定义与 status/list 的契约字段
export type ActivationMode = "all" | "allowlist" | "denylist"

// `activation` 配置段：缺省即 all（与历史行为一致）
export interface ActivationConfig {
  mode: ActivationMode
  include: string[]
  exclude: string[]
  markers: { include: string[]; exclude: string[] }
  gitRemotes: string[]
}

// 判定上下文：由调用方提供真实路径、项目根与已存在的 marker 名，便于纯函数单测
export interface ScopeContext {
  cwd: string
  // 判定基准：项目根（git 根优先，其次最近的 .tasks 根，都没有则回落 cwd）
  baseDir: string
  gitRoot: string | null
  gitRemote: string | null
  markers: Set<string>
  caseInsensitive: boolean
}

// 判定结果：status 的 JSON 契约字段固定为 active / mode / baseDir / sourceFile / matchedRule / reason
export interface ScopeDecision {
  active: boolean
  mode: ActivationMode
  baseDir: string
  sourceFile: string | null
  matchedRule: string | null
  reason: string
}

// 加载结果：来源文件与告警用于人读输出，判定只消费 activation
export interface LoadedActivation {
  activation: ActivationConfig | null
  sourceFile: string | null
  layer: string | null
  warnings: string[]
}
