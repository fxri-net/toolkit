// 整体状态聚合：只读调用各域既有检查函数，输出统一现场快照，不重写任何规则
// 与 verify 的分工：status 面向「我现在该修什么」，verify 面向「能否交付」
import { existsSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { commandMigrationRows, takeDeprecationHits, type CommandMigrationRow, type DeprecationHit } from "./command-registry"
import { resolveTasksDir } from "./config"
import { configStatus } from "./config-status"
import { resolveDocsCheckConfig } from "./docs/config"
import { checkDocsDist } from "./docs/dist"
import { checkDocsNav } from "./docs/nav"
import { skillsStatus } from "./skills/status"
import { listTaskFiles } from "./tasks/scan"
import { validateTasks } from "./tasks/validate"

// 聚合问题：level 与各域 check 同口径；scope 标注所属区块，便于按域定位
export interface StatusIssue {
  level: "error" | "warn" | "info"
  scope: string
  message: string
}

// 区块摘要：counts 只统计本区块问题，ok 表示该区块无 error 级问题
export interface StatusSection {
  id: "tasks" | "skills" | "config" | "docs" | "version"
  label: string
  ok: boolean
  summary: string
  // 补充行：文本模式缩进打印，JSON 原样输出
  details: string[]
  counts: { error: number; warn: number; info: number }
}

export interface StatusReport {
  // 一句话结论（整体健康 / 整体可用但有告警 / 存在需处理项）
  summary: string
  version: string
  cwd: string
  // 任务区目录配置值：未初始化时用于指引
  tasksDir: string
  initialized: boolean
  sections: StatusSection[]
  deprecated: CommandMigrationRow[]
  runtimeHits: DeprecationHit[]
  issues: StatusIssue[]
  errorCount: number
  warnCount: number
  infoCount: number
  ok: boolean
}

// 单域取数结果：issues 供顶层汇总，summary / details 供区块展示
interface DomainResult {
  summary: string
  issues: StatusIssue[]
  details?: string[]
}

// 问题分级计数
function countLevels(issues: StatusIssue[]): StatusSection["counts"] {
  return {
    error: issues.filter((issue) => issue.level === "error").length,
    warn: issues.filter((issue) => issue.level === "warn").length,
    info: issues.filter((issue) => issue.level === "info").length,
  }
}

// 区块构造：counts 与 ok 均由问题清单派生，避免两处口径
function buildSection(id: StatusSection["id"], label: string, result: DomainResult): StatusSection {
  const counts = countLevels(result.issues)
  return { id, label, ok: counts.error === 0, summary: result.summary, details: result.details ?? [], counts }
}

// 单域兜底：任一域抛错只降级为该域一条 error，不中断整体聚合
function guard(id: StatusSection["id"], label: string, run: () => DomainResult): { section: StatusSection; issues: StatusIssue[] } {
  try {
    const result = run()
    return { section: buildSection(id, label, result), issues: result.issues }
  } catch (e) {
    const message = `检查失败：${(e as Error).message}`
    const issues: StatusIssue[] = [{ level: "error", scope: label, message }]
    return { section: buildSection(id, label, { summary: message, issues }), issues }
  }
}

// 任务区：与 tasks check 共用同一校验实现，问题带上文件与行号便于跳转
function tasksDomain(cwd: string, tasksDir: string): DomainResult {
  const abs = isAbsolute(tasksDir) ? tasksDir : join(cwd, tasksDir)
  const result = validateTasks(abs, cwd)
  const total = listTaskFiles(join(abs, "active")).length
  const issues: StatusIssue[] = result.issues.map((issue) => ({
    level: issue.level,
    scope: "任务区",
    message: `${issue.file}${issue.line ? `:${issue.line}` : ""}：${issue.message}`,
  }))
  const problems = result.errorCount + result.warnCount
  const tail = problems === 0 ? "，未发现问题" : `（${result.errorCount} error / ${result.warnCount} warn）`
  return { summary: `${total} 个待办任务${tail}`, issues }
}

// 技能现场：与 skills status 共用同一份报告，只把待收敛与版本双写位不一致转为问题
function skillsDomain(): DomainResult {
  const report = skillsStatus()
  const issues: StatusIssue[] = []
  if (report.pending.length > 0) {
    const names = report.pending.map((item) => item.name).join("、")
    issues.push({
      level: "warn",
      scope: "技能现场",
      message: `待收敛 ${report.pending.length} 项：${names}（运行 toolkit skills install 可修复）`,
    })
  }
  for (const mismatch of report.versionMismatches) {
    issues.push({
      level: "warn",
      scope: "技能现场",
      message: `技能「${mismatch.name}」版本双写位不一致（frontmatter ${mismatch.frontmatter} / 正文 ${mismatch.body}），请同步递增`,
    })
  }
  const summary = `已选择 ${report.selection.length} 个技能，${report.targets.length} 个安装目标`
  return { summary: report.pending.length > 0 ? `${summary}，${report.pending.length} 项待收敛` : summary, issues }
}

// 配置层：与 config status 共用同一份体检报告，warn / info 原样上抛且不打印配置值
function configDomain(cwd: string): DomainResult {
  const report = configStatus(cwd)
  const issues: StatusIssue[] = report.items.map((item) => ({ level: item.level, scope: "配置层", message: item.message }))
  return { summary: report.summary, issues }
}

// 文档站：与 docs nav check / dist check 共用同一实现；未接入文档站时整块跳过，产物未构建只标注不报错
function docsDomain(cwd: string): DomainResult {
  const config = resolveDocsCheckConfig()
  const docsDir = resolve(cwd, config.nav.dir)
  if (!existsSync(docsDir)) return { summary: "未检测到文档站，跳过", issues: [] }
  const nav = checkDocsNav(docsDir, { config: config.nav, rules: config.rules })
  const dist = checkDocsDist(docsDir, { config: config.dist, rules: config.rules })
  const issues: StatusIssue[] = [...nav.problems, ...dist.problems].map((problem) => ({
    level: problem.level,
    scope: "文档站",
    message: `[${problem.id}] ${problem.message}（${problem.file}）`,
  }))
  const navText = nav.ok ? "导航通过" : `导航失败（${nav.problems.filter((problem) => problem.level === "error").length} error）`
  const distText = dist.skipped ? "产物未构建（跳过）" : dist.ok ? "产物校验通过" : "产物校验失败"
  return { summary: `${navText}；${distText}`, issues }
}

// 版本与弃用：包版本 + 注册表静态迁移项 + 本机旧命令命中记录（读取即清空，避免重复计数）
function versionDomain(version: string, deprecated: CommandMigrationRow[], hits: DeprecationHit[]): DomainResult {
  const hitNote = hits.length > 0 ? `；本机命中旧命令 ${hits.length} 次` : ""
  return {
    summary: `toolkit ${version}；${deprecated.length} 项命令已登记迁移目标${hitNote}`,
    details: deprecated.map((row) => `迁移：toolkit ${row.from} → ${row.to}（${row.note}）`),
    issues: [],
  }
}

// 一句话结论：error 优先，其次软告警
function summarize(errorCount: number, warnCount: number): string {
  if (errorCount > 0) return `存在 ${errorCount} 项需处理`
  if (warnCount > 0) return `整体可用，${warnCount} 项待清理`
  return "整体健康"
}

// 聚合入口：按 cwd 现算各域现场，不在模块级缓存
export function collectStatus(version: string, cwd: string = process.cwd()): StatusReport {
  const tasksDir = resolveTasksDir()
  const deprecated = commandMigrationRows()
  const runtimeHits = takeDeprecationHits()
  const base = { summary: "", version, cwd, tasksDir, deprecated, runtimeHits }
  const absTasks = isAbsolute(tasksDir) ? tasksDir : join(cwd, tasksDir)

  // 未初始化现场：只给引导，不逐域报错
  if (!existsSync(absTasks)) {
    return { ...base, initialized: false, sections: [], issues: [], errorCount: 0, warnCount: 0, infoCount: 0, ok: true }
  }

  const results = [
    guard("tasks", "任务区", () => tasksDomain(cwd, tasksDir)),
    guard("skills", "技能现场", () => skillsDomain()),
    guard("config", "配置层", () => configDomain(cwd)),
    guard("docs", "文档站", () => docsDomain(cwd)),
    guard("version", "版本与弃用", () => versionDomain(version, deprecated, runtimeHits)),
  ]
  const sections = results.map((result) => result.section)
  const issues = results.flatMap((result) => result.issues)
  const errorCount = issues.filter((issue) => issue.level === "error").length
  const warnCount = issues.filter((issue) => issue.level === "warn").length
  const infoCount = issues.filter((issue) => issue.level === "info").length

  return {
    ...base,
    summary: summarize(errorCount, warnCount),
    initialized: true,
    sections,
    issues,
    errorCount,
    warnCount,
    infoCount,
    ok: errorCount === 0,
  }
}
