// active 任务校验：frontmatter 合法性、完成时间格式、重名、方案正文子项未闭合
// 供 tasks check 使用，输出问题清单；error 为硬性错误，warn 为软告警（默认开启可关）
import { join, basename, dirname } from "node:path"
import { listTaskFiles } from "./scan"
import { checkArchive } from "./normalize"
import { readDeclaredEndpoints, validateTaskFile } from "./validate-file"
// 单文件校验是公开 API 的一部分，从本文件统一出口转发
export { validateTaskFile }
import { validateConventions, validateHistoryIdColumn, validateTableForm } from "./validate-conventions"
import { strayTaskFiles, validateDependencies } from "./validate-deps"


// 问题级别：error 硬性错误 / warn 软告警
export type IssueLevel = "error" | "warn"

// 单条校验问题；line 为文件内 1 基行号（文件级问题如重名、游离文件无对应行，故可选）
export interface CheckIssue {
  level: IssueLevel
  file: string
  line?: number
  message: string
}

// 校验结果
export interface CheckResult {
  issues: CheckIssue[]
  errorCount: number
  warnCount: number
}


// 校验 active 目录全部任务（含跨文件重名检测）
export function validateTasks(tasksDir = ".tasks", cwd = process.cwd()): CheckResult {
  const activeDir = join(tasksDir, "active")
  const files = listTaskFiles(activeDir)
  const issues: CheckIssue[] = []
  const endpoints = readDeclaredEndpoints(tasksDir)
  for (const f of files) {
    issues.push(...validateTaskFile(f, endpoints))
    // 按规范 active 任务应放在 {YYYYMM}/ 月份子目录，直放 active 根目录给出软告警
    if (dirname(f) === activeDir) {
      issues.push({ level: "warn", file: basename(f), message: "active 任务应放入 {YYYYMM} 月份子目录（当前直放 active 根目录）" })
    }
  }

  // 游离于 active/ 之外的任务文件对 check/archive 均不可见，单独提示其修正位置
  for (const s of strayTaskFiles(tasksDir)) {
    issues.push({ level: "warn", file: s, message: "任务文件游离于 active/ 之外，tasks/check/archive 均不会读取，应移入 active/{YYYYMM}/ 月份子目录" })
  }

  // 规范载体形态：仅查形态不读内容，故不影响任务校验的语义判断
  issues.push(...validateConventions(tasksDir, cwd))

  // 表格形态：检出被格式化器填充的表格行，指向 conventions format 归一
  issues.push(...validateTableForm(tasksDir))

  // 演进记录首列 ID 形态：v3 载体下历史行首列应为稳定 ID
  issues.push(...validateHistoryIdColumn(tasksDir))

  // 归档块检查：复用 normalize 的单一实现（月份目录归属、元数据完整性、完成时间漂移/异常、排序、疑似任务块），
  // 避免 validate 与 normalize 各写一套导致判据漂移；归档问题一律 warn 级（明细与修复走 tasks normalize / normalize --fix）
  for (const i of checkArchive(tasksDir)) {
    issues.push({ level: "warn", file: i.file, message: i.message })
  }

  // 跨文件重名检测：同名任务文件疑似重复建档
  const seen = new Map<string, string[]>()
  for (const f of files) {
    const name = basename(f, ".md")
    const list = seen.get(name)
    if (list) list.push(f)
    else seen.set(name, [f])
  }
  for (const [name, list] of seen) {
    if (list.length > 1) {
      issues.push({ level: "warn", file: name, message: `存在 ${list.length} 个同名任务文件，疑似重复建档` })
    }
  }

  // depends_on 依赖闭环校验
  issues.push(...validateDependencies(files, tasksDir))

  const errorCount = issues.filter((i) => i.level === "error").length
  const warnCount = issues.length - errorCount
  return { issues, errorCount, warnCount }
}
