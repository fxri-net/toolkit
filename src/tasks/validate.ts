// active 任务校验：frontmatter 合法性、完成时间格式、重名、方案正文子项未闭合
// 供 tasks check 使用，输出问题清单；error 为硬性错误，warn 为软告警（默认开启可关）
import { readFileSync } from "node:fs"
import { join, basename, dirname } from "node:path"
import { listTaskFiles } from "./scan"
import { parseFrontmatter, stripFrontmatter } from "./parse"
import { getConfigSection } from "../config"
import { ALL_STATUSES } from "./types"
import { parseDepends } from "./depends"
import type { TaskStatus } from "./types"

// 问题级别：error 硬性错误 / warn 软告警
export type IssueLevel = "error" | "warn"

// 单条校验问题
export interface CheckIssue {
  level: IssueLevel
  file: string
  message: string
}

// 校验结果
export interface CheckResult {
  issues: CheckIssue[]
  errorCount: number
  warnCount: number
}

// 合法任务状态（单一事实源 ALL_STATUSES）
const VALID_STATUSES = ALL_STATUSES
// 可归档（终结）状态
const DONE_STATUSES: TaskStatus[] = ["已完成", "已放弃"]

// 未闭合待办标记：方案正文里出现这些词说明有游离的待办子项未拆成独立任务
const PENDING_MARKERS = /待办|待实施|待核对|待确认|待开始|待评估|待排期|待做|TODO/

// completed 合法格式：YYYY-M-D（时分秒可选，非定宽也接受）
const COMPLETED_RE = /^\d{4}-\d{1,2}-\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?$/
// completed 完整时间格式：日期 + 时分（可带秒/T 分隔）
const COMPLETED_FULL_RE = /^\d{4}-\d{1,2}-\d{1,2}[T\s]\d{1,2}:\d{2}(?::\d{2})?$/
// active 文件名规范：{YYYYMMDD}-{负责人}-{简述}.md
const ACTIVE_NAME_RE = /^\d{8}-[^-]+-.+\.md$/

// 校验 YYYY-MM-DD / YYYYMMDD（允许非补零月日）是否为真实存在日期
function isRealDate(ymd: string): boolean {
  const m = ymd.match(/^(\d{4})-?(\d{1,2})-?(\d{1,2})/)
  if (!m) return false
  const y = +m[1]
  const mo = +m[2]
  const d = +m[3]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

// 校验单个任务文件，返回问题列表
export function validateTaskFile(file: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  const name = basename(file)
  const content = readFileSync(file, "utf8")
  const hasFrontmatter = /^---\r?\n[\s\S]*?\r?\n---/.test(content)

  if (!hasFrontmatter) {
    issues.push({ level: "error", file: name, message: "缺少 frontmatter" })
    return issues
  }

  const fm = parseFrontmatter(content)

  if (!fm.status) {
    issues.push({ level: "error", file: name, message: "frontmatter 缺少 status 字段" })
  } else if (!VALID_STATUSES.includes(fm.status as TaskStatus)) {
    issues.push({ level: "error", file: name, message: `status 非法值「${fm.status}」，应为 ${VALID_STATUSES.join(" / ")}` })
  }

  if (DONE_STATUSES.includes(fm.status as TaskStatus) && !fm.completed) {
    issues.push({ level: "error", file: name, message: `status 为「${fm.status}」但缺少 completed 完成时间` })
  }

  if (fm.completed) {
    const c = fm.completed.trim()
    if (!COMPLETED_RE.test(c)) {
      issues.push({ level: "warn", file: name, message: `completed「${fm.completed}」格式非法，应为 YYYY-MM-DD HH:mm` })
    } else {
      const datePart = c.match(/^\d{4}-\d{1,2}-\d{1,2}/)?.[0] ?? c
      if (!isRealDate(datePart)) {
        issues.push({ level: "warn", file: name, message: `completed「${fm.completed}」日期不存在，请核对` })
      } else if (!COMPLETED_FULL_RE.test(c)) {
        issues.push({ level: "warn", file: name, message: `completed「${fm.completed}」建议补全为完整时间 YYYY-MM-DD HH:mm` })
      }
    }
  }

  // 元数据完整性（软告警）：负责人 / 创建日期 / 文件命名规范
  if (!fm.owner) {
    issues.push({ level: "warn", file: name, message: "缺少 owner 负责人字段" })
  }
  if (!fm.created) {
    issues.push({ level: "warn", file: name, message: "缺少 created 创建日期字段" })
  } else if (!/^\d{8}$/.test(fm.created.trim())) {
    issues.push({ level: "warn", file: name, message: `created「${fm.created}」格式非法，应为 YYYYMMDD` })
  } else if (!isRealDate(fm.created.trim())) {
    issues.push({ level: "warn", file: name, message: `created「${fm.created}」日期不存在，请核对` })
  }
  const nameMatch = name.match(/^(\d{8})-/)
  if (!ACTIVE_NAME_RE.test(name)) {
    issues.push({ level: "warn", file: name, message: "文件名不符合规范 {YYYYMMDD}-{负责人}-{简述}.md" })
  } else if (fm.created && /^\d{8}$/.test(fm.created.trim()) && nameMatch && fm.created.trim() !== nameMatch[1]) {
    issues.push({ level: "warn", file: name, message: `文件名日期 ${nameMatch[1]} 与 created ${fm.created.trim()} 不一致` })
  }

  // 方案正文子项未闭合扫描（软告警，不阻断；check.pendingMarkers=false 可关闭词标记扫描）
  const body = stripFrontmatter(content)
  const pendingOn = getConfigSection("check")?.pendingMarkers !== false
  const pending = pendingOn ? body.match(PENDING_MARKERS) : null
  if (pending) {
    issues.push({ level: "warn", file: name, message: `正文含未闭合待办标记「${pending[0]}」，建议拆分为独立 active 任务或明确闭环` })
  }

  // 未勾选的 Markdown 任务复选框（软告警，默认开；.toolkitrc.json 的 check.includeCheckbox=false 可关）
  const includeCheckbox = getConfigSection("check")?.includeCheckbox !== false
  if (includeCheckbox && /^[-*]\s*\[ \]\s/m.test(body)) {
    issues.push({ level: "warn", file: name, message: "正文含未勾选待办项「- [ ]」，建议拆分为独立 active 任务或勾选完成" })
  }

  return issues
}

// 校验 active 目录全部任务（含跨文件重名检测）
export function validateTasks(tasksDir = ".tasks"): CheckResult {
  const activeDir = join(tasksDir, "active")
  const files = listTaskFiles(activeDir)
  const issues: CheckIssue[] = []
  for (const f of files) {
    issues.push(...validateTaskFile(f))
    // 按规范 active 任务应放在 {YYYYMM}/ 月份子目录，直放 active 根目录给出软告警
    if (dirname(f) === activeDir) {
      issues.push({ level: "warn", file: basename(f), message: "active 任务应放入 {YYYYMM} 月份子目录（当前直放 active 根目录）" })
    }
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
  issues.push(...validateDependencies(files))

  const errorCount = issues.filter((i) => i.level === "error").length
  const warnCount = issues.length - errorCount
  return { issues, errorCount, warnCount }
}

// 校验 depends_on 依赖：目标存在性 + 成环检测（引用带 .md 扩展名时自动归一化比对）
function validateDependencies(files: string[]): CheckIssue[] {
  const issues: CheckIssue[] = []
  const nameSet = new Set(files.map((f) => basename(f, ".md")))
  const depsMap = new Map<string, string[]>()
  // 引用名归一化：去空白与 .md 后缀，统一为任务文件 basename（不含扩展名）
  const normDep = (d: string) => d.trim().replace(/\.md$/, "").trim()

  for (const file of files) {
    const name = basename(file, ".md")
    const content = readFileSync(file, "utf8")
    const fm = parseFrontmatter(content)
    const deps = parseDepends((fm as Record<string, unknown>).depends_on).map(normDep)
    depsMap.set(name, deps)
    for (const d of deps) {
      if (!nameSet.has(d)) {
        issues.push({ level: "warn", file: name, message: `依赖的任务「${d}」不在 active 中（可能已归档或文件名拼写错误）` })
      }
    }
  }

  // 成环检测：DFS 沿依赖边遍历，命中灰色节点即为环
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  const visit = (node: string, path: string[]): string[] | null => {
    color.set(node, GRAY)
    for (const dep of depsMap.get(node) ?? []) {
      if (!nameSet.has(dep)) continue
      const c = color.get(dep) ?? WHITE
      if (c === GRAY) return [...path, dep]
      if (c === WHITE) {
        const loop = visit(dep, [...path, dep])
        if (loop) return loop
      }
    }
    color.set(node, BLACK)
    return null
  }
  for (const name of depsMap.keys()) {
    if ((color.get(name) ?? WHITE) === WHITE) {
      const loop = visit(name, [name])
      if (loop) {
        issues.push({ level: "warn", file: name, message: `depends_on 存在循环依赖：${loop.join(" → ")}` })
        break
      }
    }
  }

  return issues
}
