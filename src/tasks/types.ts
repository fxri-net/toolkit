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
