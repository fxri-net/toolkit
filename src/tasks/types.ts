// 任务状态
export type TaskStatus = "待办" | "进行中" | "已完成" | "阻塞" | "已放弃"

// 已终结状态（可归档）
export const DONE_STATUSES: TaskStatus[] = ["已完成", "已放弃"]

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
}

// 过滤条件
export interface TaskFilter {
  owner?: string
  scope?: string
  status?: string[]
  // 单日（YYYY-MM-DD，与 since/until 互斥）
  date?: string
  since?: string
  until?: string
}

// 汇总统计
export interface TaskSummary {
  total: number
  byStatus: Record<string, number>
  byOwner: Record<string, number>
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
