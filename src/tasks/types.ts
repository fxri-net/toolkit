// 任务状态
export type TaskStatus = "待办" | "进行中" | "已完成" | "阻塞" | "已放弃" | "搁置"

// 全部合法状态（check 校验与 CLI --status 过滤共用）；新值一律追加在末尾——
// 本表顺序会进入 --status 非法值告警与 help 文案，重排会波及既有快照，展示顺序由 query.ts 的 STATUS_ORDER 负责
export const ALL_STATUSES: TaskStatus[] = ["待办", "进行中", "已完成", "阻塞", "已放弃", "搁置"]

// 已终结状态（可归档）
export const DONE_STATUSES: TaskStatus[] = ["已完成", "已放弃"]

// 展示占位：owner / status / scope 未填时统一显示该值，避免各展示处各写一份字面量
export const UNLABELED = "未标注"

// 任务 frontmatter 元数据
export interface TaskFrontmatter {
  owner: string
  status: TaskStatus
  created: string
  updated: string
  completed: string
  depends_on: string[]
  scope: string
}

// TaskFrontmatter 的全部字段名（解析层据此识别自定义扩展字段；增删字段时须同步本表）
export const FRONTMATTER_KEYS: readonly (keyof TaskFrontmatter)[] = ["owner", "status", "created", "updated", "completed", "depends_on", "scope"]

// 任务
export interface Task {
  file: string
  name: string
  date: string
  title: string
  frontmatter: TaskFrontmatter
  body: string
}

// 归档文件里的任务块
export interface ArchiveBlock {
  block: string
  completed: string
}

// 归档结果
export interface ArchiveResult {
  archived: number
  skipped: string[]
  warnings: string[]
}

// 归档选项
export interface ArchiveOptions {
  // 预演：只预览归档动作，不写文件、不删除 active 任务
  dryRun?: boolean
  // 软告警开关：是否打印告警（日期漂移、重复归档等），默认 true
  warn?: boolean
  // 只归档指定任务（唯一键）；缺省归档全部终结态任务
  task?: string
}

// ---- 任务查询 / 导入导出（1.4.0）----

// 查询视图：待完成 / 已归档 / 合并
export type TaskView = "active" | "archived" | "all"

// 统一任务行（覆盖待完成与已归档，供终端展示与导出）
export interface TaskRow {
  view: "待完成" | "已归档"
  title: string
  status: string
  owner: string
  scope: string
  // 创建日期（active，YYYYMMDD）
  created: string
  // 更新日期（active，YYYYMMDD）
  updated: string
  // 完成时间（YYYY-MM-DD HH:mm，可为空）
  completed: string
  // 依赖（active）
  depends: string[]
  // 来源文件（相对 .tasks 的路径）
  file: string
  // 批次（解析正文「> 批次：第 N 批…」行；缺省未分批）
  batch?: string
  // 搁置天数（仅待完成视图中 status 为搁置且可计算时给出；按正文「搁置日期」计算）
  heldDays?: number
  // 搁置天数是否取自 frontmatter updated 的近似值（正文缺「搁置日期」时）
  heldDaysApprox?: boolean
}

// 过滤条件
export interface TaskFilter {
  // 负责人（支持逗号多值精确匹配）
  owner?: string | string[]
  // 范围（CLI 逗号多值输入；命中任务范围任一段——存储以半角加号分隔多值，如 web+server）
  scope?: string | string[]
  status?: string[]
  // 单日（YYYY-MM-DD，与 since/until 互斥）
  date?: string
  since?: string
  until?: string
}

// 汇总统计（四类分布口径统一，看板与 stats 共用；byScope / byBatch 为后加字段，允许旧调用方缺省）
export interface TaskSummary {
  total: number
  byStatus: Record<string, number>
  byOwner: Record<string, number>
  byScope?: Record<string, number>
  byBatch?: Record<string, number>
}

// 导入目标
export type ImportTarget = "active" | "archive"

// 导入选项
export interface ImportOptions {
  // 行内缺负责人/范围时的默认值
  owner?: string
  scope?: string
  // 导入目标：active（默认，生成待完成任务）或 archive（直接写归档）
  target?: ImportTarget
  // 预演：只打印将创建的清单，不落盘
  dryRun?: boolean
  // 自定义表头列映射：列名 -> 标准字段（优先级高于内置别名表）
  importColumns?: Record<string, string>
}

// 导入结果
export interface ImportResult {
  created: number
  skipped: number
  warnings: string[]
  dryRun: boolean
}
