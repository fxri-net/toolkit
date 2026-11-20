// 作用域配置与判定结果：配置段的类型定义与 status/list 的契约字段
export type ActivationMode = "all" | "allowlist" | "denylist"

// 技能级作用域规则：只覆盖 mode / include / exclude，其余条件沿用目录级配置
export interface SkillActivationConfig {
  mode?: ActivationMode
  include?: string[]
  exclude?: string[]
}

// `activation` 配置段：缺省即 all（与历史行为一致）
export interface ActivationConfig {
  mode: ActivationMode
  include: string[]
  exclude: string[]
  markers: { include: string[]; exclude: string[] }
  gitRemotes: string[]
  // 技能级规则：键为技能名（glob / re:），未命中的技能回落目录级判定
  skills?: Record<string, SkillActivationConfig>
}

// 判定上下文：由调用方提供字符串口径的绝对路径、项目根与已存在的 marker 名，便于纯函数单测
export interface ScopeContext {
  cwd: string
  // 判定基准：项目根（git 根优先，其次最近的 .tasks 根，都没有则回落 cwd）
  baseDir: string
  // 当前判定的技能名；缺省按目录级判定
  skill?: string
  gitRoot: string | null
  gitRemote: string | null
  markers: Set<string>
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
