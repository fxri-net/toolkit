// 使用情况公共类型：配置、事件、统计与 Hook 归一化事件集中定义，避免各模块重复声明导致口径漂移

// 事件文件轮转方式：按月（默认）/ 按文件大小 / 不轮转
export type UsageRotation = "monthly" | "size" | "none"

// 技能统计范围：none 不统计 / all 全部已开启来源 / include 仅列表内 / exclude 列表外
export type UsageSkillMode = "none" | "all" | "include" | "exclude"

// 技能来源：toolkit 一方、toolkit 分发的第三方、未托管、未知
export type UsageSkillSource = "toolkit-first-party" | "toolkit-third-party" | "unmanaged" | "unknown"

// 上传协议：Webhook / OTLP HTTP / 本地文件导出
export type UsageUploadProtocol = "webhook" | "otlp-http" | "file"

// 采集结果：来自 Hook 载荷的可见结果，未知时不伪造
export type UsageOutcome = "success" | "failure" | "unknown"

// 使用情况配置：usage 段只读全局层，所有开关默认关闭
export interface UsageConfig {
  enabled: boolean
  // Agent 开关：键为适配器 id（trae / claude / cursor / codex / copilot），未出现即关闭
  agents: Record<string, boolean>
  sources: {
    firstParty: boolean
    thirdParty: boolean
    unmanaged: boolean
  }
  skills: {
    mode: UsageSkillMode
    include: string[]
    exclude: string[]
  }
  capture: {
    triggerPrompt: boolean
    skillArgs: boolean
    outcome: boolean
  }
  storage: {
    dir: string
    rotation: UsageRotation
    retentionDays: number
    maxFileBytes: number
  }
  upload: UsageUploadConfig
}

// 上传配置：默认关闭；开启时必须显式给出端点或导出路径
export interface UsageUploadConfig {
  enabled: boolean
  protocol: UsageUploadProtocol
  endpoint: string
  headers: Record<string, string>
  allowInsecure: boolean
  batchSize: number
}

// 技能元数据：名称来自 Hook 载荷，版本与来源由 toolkit 技能清单判定
export interface UsageSkillMeta {
  name: string
  version: string
  source: UsageSkillSource
  managedBy: "toolkit" | "external" | "unknown"
}

// 单条技能使用事件：schemaVersion 为 1，新增字段只增不改
export interface SkillUsageEvent {
  schemaVersion: 1
  eventId: string
  occurredAt: string
  agent: string
  sessionId: string
  toolUseId?: string
  project?: string
  skill: string
  skillVersion?: string
  skillSource: UsageSkillSource
  managedBy: "toolkit" | "external" | "unknown"
  triggerPrompt?: string
  skillArgs?: string
  outcome?: UsageOutcome
  durationMs?: number
  originAdapter: string
  toolkitVersion: string
}

// 事件构造输入：适配器只负责把原始载荷归一到这里
export interface UsageEventInput {
  agent: string
  sessionId: string
  toolUseId?: string
  project?: string
  skill: string
  triggerPrompt?: string
  skillArgs?: string
  outcome?: UsageOutcome
  durationMs?: number
  originAdapter: string
  occurredAt?: Date
}

// Hook 归一化事件：不同 Agent 的原始载荷先转为本结构，再统一过滤与落盘
export interface NormalizedHookEvent {
  agent: string
  sessionId: string
  toolUseId?: string
  project?: string
  toolName?: string
  toolInput?: unknown
  toolResponse?: unknown
  prompt?: string
  originAdapter: string
  occurredAt?: Date
}

// 统计过滤条件：CLI 与库形态共用
export interface UsageQuery {
  since?: Date
  agent?: string
  source?: UsageSkillSource
  skill?: string
}

// 单技能汇总
export interface SkillUsageSummary {
  skill: string
  version: string
  source: UsageSkillSource
  count: number
  sessions: number
  firstAt: string
  lastAt: string
}

// 单会话汇总
export interface SessionUsageSummary {
  sessionId: string
  agent: string
  count: number
  firstAt: string
  lastAt: string
  skills: string[]
}

// 触发词汇总
export interface TriggerUsageSummary {
  prompt: string
  count: number
  skills: string[]
}

// 统计总览
export interface UsageSummary {
  total: number
  bySkill: SkillUsageSummary[]
  byAgent: Array<{ agent: string; count: number }>
  bySource: Array<{ source: UsageSkillSource; count: number }>
  sessions: SessionUsageSummary[]
  triggers: TriggerUsageSummary[]
}

// 事件索引：eventId 去重与会话摘要的持久化读模型
export interface UsageIndex {
  schemaVersion: 1
  updatedAt: string
  eventIds: string[]
  // 跨适配器去重键：sessionId + toolUseId；同一调用被多个 Agent 适配器捕获时只保留首条
  keys?: string[]
}

// 写入结果：duplicate 表示命中事件 ID 去重
export interface AppendResult {
  written: boolean
  reason?: "duplicate"
}
