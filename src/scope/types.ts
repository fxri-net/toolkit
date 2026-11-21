// 作用域配置与判定结果：配置段的类型定义与 status/list 的契约字段
export type ActivationMode = "all" | "allowlist" | "denylist"

// 策略来源层：离项目越近优先级越高（local > project > global）
export type PolicyLayer = "global" | "project" | "local"

// 策略匹配条件：同一字段内 OR，跨字段 AND；空数组等同未写
export interface ScopeCondition {
  // 按项目根匹配
  paths?: string[]
  // 按项目根相对当前 cwd 匹配；在项目根执行时 allow 规则按失败关闭处理
  subpaths?: string[]
  markers?: string[]
  gitRemotes?: string[]
}

// 策略的技能维度：match 限定适用技能（省略即全部技能），mode / profiles / allow / deny 决定该技能是否放行
export interface PolicySkills {
  match?: string[]
  mode?: ActivationMode
  profiles?: string[]
  allow?: string[]
  deny?: string[]
}

// 统一策略条目：目录、标记、远端与技能维度合为一体，由判定内核按层与具体度取唯一命中
export interface ScopePolicy {
  // 稳定机器标识：CLI 生成、跨层唯一、不可变
  id: string
  // 可读标签：允许重复，只用于展示
  name?: string
  when?: ScopeCondition
  skills?: PolicySkills
  effect?: "allow" | "deny"
  // 来源层：由加载层填充，手写配置无需填写
  layer?: PolicyLayer
}

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

// 合并后的技能档案：同名档案按最近层整份覆盖，layer 保留生效来源
export interface ScopeProfile {
  name: string
  allow: string[]
  deny: string[]
  layer: PolicyLayer
}

// 加载结果：来源文件与告警用于人读输出，判定只消费 activation
export interface LoadedActivation {
  activation: ActivationConfig | null
  sourceFile: string | null
  layer: string | null
  // 旧字段产物所属的策略层：与 layer 的中文名一一对应
  policyLayer: PolicyLayer | null
  warnings: string[]
}
