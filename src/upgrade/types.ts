// 升级迁移的公共类型：检测项、计划、报告与备份清单共用同一套字段

// 迁移面：配置 / 工程文件 / 技能现场 / 规范载体 / 备份收编 / 本机契约数据
export type UpgradeSurface = "config" | "project-file" | "skill" | "convention" | "backup" | "data"

// 配置层：全局 / 项目 / 本地
export type UpgradeLayer = "global" | "project" | "local"

// 单项状态：计划 / 已应用 / 跳过 / 需人工 / 失败
export type UpgradeStatus = "planned" | "applied" | "skipped" | "manual" | "failed"

// 单项风险：低（纯结构改写）/ 中（删产物或改工程文件）/ 高（跨层或不可自动回滚）
export type UpgradeRisk = "low" | "medium" | "high"

// 单个迁移项：id 稳定，供 --only / --skip 与 JSON 消费方引用
export interface UpgradeItem {
  id: string
  surface: UpgradeSurface
  layers: UpgradeLayer[]
  action: string
  risk: UpgradeRisk
  files: string[]
  reason: string
  status: UpgradeStatus
  // 需人工项的操作提示（不参与自动应用）
  manualHint?: string
}

// 迁移计划：autoResidue 为可自动处理而未处理的项数，manual 为需人工项数
export interface UpgradePlan {
  items: UpgradeItem[]
  autoResidue: number
  manual: number
}

// 应用结果：本次写过的文件与备份目录
export interface UpgradeApplyResult {
  applied: string[]
  failed: string[]
  backups: string[]
}

// 备份清单条目：原路径、备份内路径、迁移前 / 迁移后哈希
export interface BackupEntry {
  original: string
  stored: string
  beforeSha: string
  postSha?: string
  // 收编型条目：原文件在迁移中删除，恢复时按备份内容重建
  absorbed?: boolean
}

// 备份清单：被改写文件与本次新建文件分开记录，恢复时据此还原或删除
export interface BackupManifest {
  createdAt: string
  entries: BackupEntry[]
  created: Array<{ path: string; postSha: string }>
}
