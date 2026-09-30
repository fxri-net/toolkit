#!/usr/bin/env node

import { Command, CommanderError } from "commander"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { renderTaskBoard } from "./tasks/list"
import { queryTasks } from "./tasks/query"
import { exportTasks, toJSON } from "./tasks/export"
import { importTasks } from "./tasks/import"
import { archiveTasks } from "./tasks/archive"
import { computeStats, renderStats } from "./tasks/stats"
import { validateTasks, type CheckIssue } from "./tasks/validate"
import { checkArchive, fixArchive } from "./tasks/normalize"
import { listTaskFiles } from "./tasks/scan"
import type { TaskView, TaskFilter, ImportTarget } from "./tasks/types"
import { ALL_STATUSES } from "./tasks/types"
import { languages, DEFAULT_LANG, resolveLang, type ChangelogLanguage } from "./changelog/languages"
import { localDate, formatChangelogs, countUntypedEntries, findUntypedChangesetEntries } from "./changelog/format"
import { resolveRedactEnabled } from "./privacy/redact"
import { resolveEnabled } from "./switch"
import { getConfigSection, resolveTasksDir } from "./config"
import { configStatus, foldHome, foldHomeInText, type ConfigStatusReport } from "./config-status"
import type { LocalConfigIgnoreState } from "./git-ignore"
import { initWorkspace, INIT_LINKS, type InitAction, type InitReport } from "./init"
import { upgradeConventions, type UpgradeReport } from "./conventions/upgrade"
import { conventionsStatus, type ConventionsStatusReport } from "./conventions/status"
import { toJsonText, assertJsonFormat } from "./json-output"
import {
  autoLinkSkills,
  detectSkillScope,
  installProjectSkills,
  installSkills,
  listPackageSkills,
  projectSkillsStatus,
  removeProjectSkills,
  removeSkills,
  skillsPackageDir,
  skillsSourceDir,
  skillsStatus,
  type InstallReport,
  type ProjectDirResult,
  type ProjectInstallReport,
  type ProjectItemState,
  type ProjectRemoveReport,
  type ProjectStatusReport,
  type SkillItemState,
  type SkillsRemoveReport,
  type SkillsStatusReport,
} from "./skills"
import { startUpdateCheck, runUpdateCheckWorker, UPDATE_CHECK_WORKER_ARG } from "./update-check"
import { setupHelp, shouldPrintChangelogHelp } from "./help"
import { formatCommanderError } from "./errors"
import { DESCRIPTION } from "./about"

const require = createRequire(import.meta.url)

// 解析 @changesets/cli 的 bin 绝对路径（pnpm 下 bin 不提升到使用方，需显式定位）
const changesetBin = require.resolve("@changesets/cli/bin.js")
// 版本号从 package.json 读取，避免与 package.json 重复维护
const { version } = require("../package.json")

// 调用 changesets（子进程执行，继承 stdio）
const runChangeset = (cmd: string[]) => {
  const res = spawnSync(process.execPath, [changesetBin, ...cmd], { stdio: "inherit" })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

// Windows 控制台 UTF-8 输出（best-effort：避免中文在 GBK 控制台下乱码）
function ensureUtf8() {
  if (process.platform === "win32") {
    try {
      process.stdout.setDefaultEncoding("utf8")
      process.stderr.setDefaultEncoding("utf8")
    } catch {
      // 流编码设置失败忽略，不影响主流程
    }
  }
}

// 读取 .toolkitrc.json 的 check.warnings 开关（软告警配置档）
function getCheckWarnings(): boolean | undefined {
  const section = getConfigSection("check")
  return typeof section?.warnings === "boolean" ? section.warnings : undefined
}

// 合并 .toolkitrc.json 配置的语言到内置（配置同名 key 覆盖内置，新 key 追加，实现全语言支持）
function resolveLanguages(): Record<string, ChangelogLanguage> {
  const section = getConfigSection("changelog")
  const custom = section?.languages
  if (!custom || typeof custom !== "object") return languages
  const merged: Record<string, ChangelogLanguage> = { ...languages }
  for (const [key, value] of Object.entries(custom)) {
    if (value && typeof value === "object") merged[key] = value as ChangelogLanguage
  }
  return merged
}

// 检测 .changeset 下是否有待发布变更集（排除 README/config）
function hasPendingChangeset(dir = ".changeset"): boolean {
  if (!existsSync(dir)) return false
  try {
    return readdirSync(dir).some((f) => f.endsWith(".md") && f !== "README.md")
  } catch {
    return false
  }
}

// 检测 active 是否有未归档任务
function hasActiveTasks(dir = ".tasks"): boolean {
  return listTaskFiles(join(dir, "active")).length > 0
}

// changelog 软告警：提示缺类型前缀的变更集条目（须在归类前取数，归类后前缀缺失信息即丢失）
// 传全部配置语言，前缀识别与 tasks check 侧 changesetPrefixIssues 同一并集口径
function warnUntypedEntries(langs: ChangelogLanguage[]) {
  const count = countUntypedEntries(".", langs)
  if (count > 0) {
    console.warn(`⚠️ ${count} 条变更集条目缺类型前缀，建议按「类型：描述」撰写`)
  }
}

// 变更集缺前缀检测（tasks check 早期检测）：扫 .changeset 下待发布变更集，缺前缀文件各转一条 warn 级问题
// 前缀识别遍历全部配置语言，自定义语言不误报；与 changelog 侧 warnUntypedEntries 互补，不在同一命令内重复触发
function changesetPrefixIssues(): CheckIssue[] {
  return findUntypedChangesetEntries(".changeset", Object.values(resolveLanguages())).map((entry) => ({
    level: "warn" as const,
    file: entry.file,
    line: entry.line,
    message: `变更集条目缺类型前缀（本文件 ${entry.count} 条），建议按「类型：描述」撰写`,
  }))
}

// 降级不静默：子命令不消费的域级输出选项（--export / --format）须 stderr 告警「忽略了什么」，不得静默吞掉
// 消费面：仅任务总览支持 --export；任务总览与 stats 支持 --format（stats 不消费 --export）
function warnUnsupportedOutput(command: string, options: { export?: string; format?: string }): void {
  if (options.export) console.warn(`⚠️ 子命令「${command}」不支持 --export，已忽略（仅任务总览支持导出）`)
  if (options.format) console.warn(`⚠️ 子命令「${command}」不支持 --format，已忽略（仅任务总览与 stats 支持 JSON 输出）`)
}

// 打印校验结果（check / normalize --check 共用）；带行号的问题输出 file:line 便于编辑器跳转
function printIssues(issues: Array<{ file: string; line?: number; message: string }>) {
  if (issues.length === 0) {
    console.log("未发现问题")
    return
  }
  for (const i of issues) {
    console.log(`  ${i.file}${i.line ? `:${i.line}` : ""}: ${i.message}`)
  }
}

// 多值参数解析（--owner / --scope / --status 共用）：仅按半角/全角逗号分隔，顿号与分号不作分隔符
function splitMulti(v?: string): string[] | undefined {
  return v ? v.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : undefined
}

// 状态过滤解析与应用：未传 → 跳过；部分非法 → stderr 告警并剔除；全部非法 → 报错退出（返回 false 由调用方 return）
// 合法清单与 ALL_STATUSES 同源，避免两处漂移；告警走 stderr，stdout 留给机器可读输出
function applyStatusFilter(filter: TaskFilter, v?: string): boolean {
  const raw = splitMulti(v)
  if (!raw) return true
  const legal = ALL_STATUSES as readonly string[]
  const values = raw.filter((s) => legal.includes(s))
  const invalid = raw.filter((s) => !legal.includes(s))
  if (values.length === 0) {
    console.error(`⚠️ --status 全部取值非法：${invalid.join("、")}（合法：${ALL_STATUSES.join("/")}）`)
    process.exitCode = 1
    return false
  }
  if (invalid.length > 0) {
    console.warn(`⚠️ 忽略非法状态值：${invalid.join("、")}（合法：${ALL_STATUSES.join("/")}）`)
  }
  filter.status = values
  return true
}

// 收集可多次出现的 --dir（commander collect 范式：默认 [] 逐个累积）
function collectDir(value: string, previous: string[]): string[] {
  return [...previous, value]
}

// 技能作用域选择：project / global 单面执行，all 两面都执行
type ScopeChoice = "project" | "global" | "all"

// 解析 --scope：缺省按现场判定；非法取值报错退出并置退出码 1（降级不静默，不静默回落到默认）
function resolveScopeChoice(value: string | undefined): { choice: ScopeChoice; explicit: boolean } | null {
  if (value === undefined || value === "") return { choice: detectSkillScope(), explicit: false }
  if (value === "project" || value === "global" || value === "all") return { choice: value, explicit: true }
  console.error(`⚠️ 不支持的 --scope 取值「${value}」，仅支持 project / global / all`)
  process.exitCode = 1
  return null
}

// 作用域中文标签（报告回显用）
const SCOPE_LABEL: Record<ScopeChoice, string> = {
  project: "项目面（仓库内唯一真源副本 + 各候选目录薄壳）",
  global: "全局面（软链 / 副本到各 agent 全局技能目录）",
  all: "项目面 + 全局面",
}

// 作用域回显：标注取值来源（--scope 显式指定 / 按现场自动判定）
function scopeHeadline(scope: { choice: ScopeChoice; explicit: boolean }): string {
  return `作用域：${SCOPE_LABEL[scope.choice]}（${scope.explicit ? "--scope 指定" : "按现场自动判定"}）`
}

// 技能现场状态的中文文案（status 逐项输出用）
const SKILL_STATE_LABEL: Record<SkillItemState, string> = {
  link: "软链正常",
  dangling: "软链悬空（真源缺失或升级后旧路径失效）",
  wrong: "软链指向其他版本",
  copy: "副本已同步",
  "copy-drift": "副本已漂移（与真源不一致）",
  missing: "缺失",
  conflict: "同名冲突（非本包产物）",
}

// 需要处理的异常状态：status 汇总提示与 install 修复范围
const SKILL_PROBLEM_STATES: SkillItemState[] = ["dangling", "wrong", "copy-drift", "missing", "conflict"]

// JSON 输出统一出口：技能域与任务统计域共用，序列化口径见 toJsonText
function printJson(payload: object): void {
  console.log(toJsonText(payload))
}

// 技能标签：名称 + 真源声明版本（未声明版本时只显示名称）
function skillLabel(name: string, version: string): string {
  return version ? `${name}@${version}` : name
}

// 打印安装报告：按目标分组列出新建/更新/跳过/降级/失败，并给出未纳入目标的处理入口
function printInstallReport(report: InstallReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  const versionByName = new Map(listPackageSkills().map((s) => [s.name, s.version]))
  console.log(`${tag}技能源：${report.source}`)
  console.log(`${tag}包内技能（${report.skills.length}）：${report.skills.map((name) => skillLabel(name, versionByName.get(name) ?? "")).join("、") || "无"}`)
  for (const t of report.targets) {
    console.log("")
    console.log(`${t.label}：${t.dir}`)
    if (t.created.length > 0) console.log(`  新建：${t.created.join("、")}`)
    if (t.updated.length > 0) console.log(`  重建/更新：${t.updated.join("、")}`)
    if (t.skipped.length > 0) console.log(`  跳过（已就绪）：${t.skipped.join("、")}`)
    if (t.conflicts.length > 0) console.log(`  跳过（同名非本包产物，如需覆盖加 --force）：${t.conflicts.join("、")}`)
    for (const d of t.degraded) console.log(`  ⚠️ 降级为副本：${d.name}（链接创建失败：${d.reason}）`)
    for (const f of t.failed) console.log(`  ⚠️ 失败：${f.name}（${f.reason}）`)
    const modes: string[] = []
    if (t.links.length > 0) modes.push(`软链 ${t.links.length} 个`)
    if (t.copies.length > 0) modes.push(`副本 ${t.copies.length} 个`)
    if (modes.length > 0) console.log(`  产物形态：${modes.join(" / ")}`)
  }
  console.log("")
  if (report.skippedTargets.length > 0) {
    console.log(
      `未安装的 agent ${report.skippedTargets.length} 个已跳过（不在用户机器上凭空造目录）；如需装到未识别的 agent：toolkit skills install --dir <其全局技能目录>`,
    )
  }
  console.log(`${tag}状态文件：${report.stateFile}`)
  if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
}

// 打印现场状态：先列技能真源版本基准，再逐目标报状态——健康目标折叠为一行，仅异常目标逐条展开，末尾汇总
// 多 agent 机器上目标数可达十余个，逐技能刷「软链正常」会把真正的问题淹没在噪音里
function printStatusReport(report: SkillsStatusReport): void {
  console.log(`技能源：${report.source}`)
  console.log(`技能版本：${report.skills.map((name) => skillLabel(name, report.skillVersions[name] ?? "")).join("、") || "无"}`)
  // 软告警：真源内版本双写位（frontmatter / 正文）不一致，提示按规则同步递增
  for (const m of report.versionMismatches) {
    console.warn(`⚠️ 技能版本双写位不一致：${m.name}（frontmatter ${m.frontmatter} / 正文 ${m.body || "未声明"}）`)
  }
  console.log(`状态文件：${report.stateFile}${report.stateExists ? "" : "（未记录，尚未执行过 toolkit skills install）"}`)
  let problems = 0
  for (const t of report.targets) {
    const head = `${t.label}：${t.dir}${t.dirExists ? "" : "（目录未创建）"}`
    const bad = t.items.filter((item) => SKILL_PROBLEM_STATES.includes(item.state))
    problems += bad.length
    console.log("")
    // 健康目标折叠为一行：逐技能刷「软链正常」在目标多时纯属噪音（完整信息另见 --format json）
    if (bad.length === 0) {
      console.log(`${head}　${t.items.length} 项正常`)
      continue
    }
    console.log(head)
    for (const item of bad) console.log(`  ${item.name}：${SKILL_STATE_LABEL[item.state]}`)
    const ok = t.items.length - bad.length
    if (ok > 0) console.log(`  其余 ${ok} 项正常`)
  }
  if (report.pendingAgents.length > 0) {
    console.log("")
    console.log(`未安装的 agent ${report.pendingAgents.length} 个未纳入分发（需要时用 toolkit skills install --dir <路径> 指定）`)
  }
  console.log("")
  console.log(
    problems > 0
      ? `共 ${problems} 处需处理：缺失 / 悬空 / 指向其他版本 / 副本漂移用 toolkit skills install 补齐，同名冲突用 toolkit skills install --force 覆盖`
      : "所有已纳入的目标均正常",
  )
  // 软链落点是写入穿透形态：改落点文件等于改真源，需在报告末尾点明纪律，避免用户误在落点上编辑
  const linkCount = report.targets.reduce((n, t) => n + t.items.filter((i) => i.state === "link").length, 0)
  if (linkCount > 0) console.log(`软链落点 ${linkCount} 项：写入将穿透至技能真源目录，改内容请改真源`)
}

// 打印卸载报告：按目标区分已移除 / 已不存在 / 需人工确认三类，并说明状态文件处置
function printRemoveReport(report: SkillsRemoveReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  if (!report.stateExists) {
    console.log("未找到本包的状态文件，没有由本包安装的产物需要清理（其他方式安装的技能不受影响）")
    return
  }
  console.log(`${tag}状态文件：${report.stateFile}`)
  for (const t of report.targets) {
    console.log("")
    // 与 install / status 同口径：显示名 + 路径；表外目标（自定义 --dir）无显示名，回落路径
    console.log(t.label ? `${t.label}：${t.dir}` : t.dir)
    if (t.removed.length > 0) console.log(`  ${dryRun ? "将移除" : "已移除"}：${t.removed.join("、")}`)
    if (t.missing.length > 0) console.log(`  已不存在：${t.missing.join("、")}`)
    if (t.skippedForeign.length > 0) console.log(`  ⚠️ 跳过（非本包产物或内容已被改动，请人工确认）：${t.skippedForeign.join("、")}`)
    if (t.dirReclaimed) console.log("  目标目录已空，已一并回收")
  }
  console.log("")
  if (dryRun) console.log("[预演] 未执行删除；无遗留条目时将同时删除状态文件")
  else if (report.stateRemoved) console.log("状态文件已删除，本包产物清理完毕")
  else console.log("状态文件已保留（存在需人工确认或未移除的条目）")
}

// 项目面现场状态的中文文案（项目侧重：真源副本漂移与薄壳过时，无软链相关状态）
const PROJECT_STATE_LABEL: Record<ProjectItemState, string> = {
  ready: "已就绪",
  drift: "已漂移（与真源 / 期望不一致）",
  conflict: "同名冲突（非本包产物）",
  missing: "缺失",
}

// 项目面需处理的异常状态：status 汇总提示与 install 修复范围
const PROJECT_PROBLEM_STATES: ProjectItemState[] = ["drift", "conflict", "missing"]

// 打印项目面单目录的逐技能动作（真源目录与薄壳目录共用）
function printProjectDir(result: ProjectDirResult, indent = "  "): void {
  const pad = `${indent}  `
  console.log(`${indent}${result.dir}`)
  if (result.created.length > 0) console.log(`${pad}新建：${result.created.join("、")}`)
  if (result.updated.length > 0) console.log(`${pad}重建/更新：${result.updated.join("、")}`)
  if (result.skipped.length > 0) console.log(`${pad}跳过（已就绪）：${result.skipped.join("、")}`)
  if (result.conflicts.length > 0) console.log(`${pad}跳过（同名非本包产物，如需覆盖加 --force）：${result.conflicts.join("、")}`)
  for (const f of result.failed) console.log(`${pad}⚠️ 失败：${f.name}（${f.reason}）`)
}

// 打印项目面安装报告：真源目录与各薄壳目录逐项列出动作，并给出未命中目录的补齐入口
function printProjectInstallReport(report: ProjectInstallReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  const versionByName = new Map(listPackageSkills().map((s) => [s.name, s.version]))
  console.log(`${tag}项目面 · 项目根：${report.root}`)
  console.log(`${tag}项目面 · 包内技能（${report.skills.length}）：${report.skills.map((name) => skillLabel(name, versionByName.get(name) ?? "")).join("、") || "无"}`)
  console.log("")
  console.log(`  真源副本（仓库内唯一，随 git 入库）：`)
  printProjectDir(report.source, "  ")
  for (const shell of report.shells) {
    console.log("")
    console.log(`  薄壳目录（指向真源）：`)
    printProjectDir(shell, "  ")
  }
  if (report.missingDirs.length > 0) {
    console.log("")
    console.log(`  未命中的候选目录 ${report.missingDirs.length} 个（该 agent 目录尚不在库，需要时补齐后提交）：`)
    for (const dir of report.missingDirs) console.log(`    toolkit skills install --scope project --dir ${dir}`)
  }
  // 库外 --dir 被剔除：降级不静默，如实告警（不静默丢弃用户显式传入的取值）
  for (const dir of report.ignoredDirs) console.warn(`⚠️ 项目面忽略 --dir「${dir}」：落在仓库之外，不写入`)
  console.log(`${tag}项目面 · 状态文件：${report.stateFile}`)
  if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
}

// 打印项目面现场状态：逐目录折叠健康项、展开异常项，并给出未命中目录的补入口
function printProjectStatusReport(report: ProjectStatusReport): void {
  console.log(`项目面 · 项目根：${report.root}`)
  console.log(`项目面 · 技能真源：${report.sourceDir}`)
  console.log(`项目面 · 技能版本：${report.skills.map((name) => skillLabel(name, report.skillVersions[name] ?? "")).join("、") || "无"}`)
  for (const m of report.versionMismatches) {
    console.warn(`⚠️ 技能版本双写位不一致：${m.name}（frontmatter ${m.frontmatter} / 正文 ${m.body || "未声明"}）`)
  }
  console.log(`项目面 · 状态文件：${report.stateFile}${report.stateExists ? "" : "（未记录，尚未执行过 toolkit init / skills install）"}`)
  let problems = 0
  for (const d of report.dirs) {
    const bad = d.items.filter((item) => PROJECT_PROBLEM_STATES.includes(item.state))
    problems += bad.length
    const head = `${d.kind === "source" ? "真源副本" : "薄壳"}：${d.dir}`
    console.log("")
    // 健康目录折叠为一行，避免目标多时把真正的问题淹没在噪音里（完整信息另见 --format json）
    if (bad.length === 0) {
      console.log(`${head}　${d.items.length} 项正常`)
      continue
    }
    console.log(head)
    for (const item of bad) console.log(`  ${item.name}：${PROJECT_STATE_LABEL[item.state]}`)
    const ok = d.items.length - bad.length
    if (ok > 0) console.log(`  其余 ${ok} 项正常`)
  }
  if (report.missingDirs.length > 0) {
    console.log("")
    console.log(`项目面 · 未命中的候选目录 ${report.missingDirs.length} 个（需要时补齐后提交）：`)
    for (const dir of report.missingDirs) console.log(`  toolkit skills install --scope project --dir ${dir}`)
  }
  console.log("")
  console.log(
    problems > 0
      ? `项目面共 ${problems} 处需处理：漂移 / 缺失用 toolkit skills install --scope project 补齐，同名冲突加 --force`
      : "项目面所有已纳入的目录均正常",
  )
}

// 打印项目面卸载报告：按目录区分已移除 / 已不存在 / 需人工确认，并说明归属账处置
function printProjectRemoveReport(report: ProjectRemoveReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  if (!report.stateExists) {
    console.log("项目面：未找到归属账，没有由本包安装的项目内技能产物需要清理")
    return
  }
  console.log(`${tag}项目面 · 状态文件：${report.stateFile}`)
  for (const d of report.dirs) {
    console.log("")
    console.log(`${d.kind === "source" ? "真源副本" : "薄壳"}：${d.dir}`)
    if (d.removed.length > 0) console.log(`  ${dryRun ? "将移除" : "已移除"}：${d.removed.join("、")}`)
    if (d.missing.length > 0) console.log(`  已不存在：${d.missing.join("、")}`)
    if (d.skippedForeign.length > 0) console.log(`  ⚠️ 跳过（非本包产物或内容已被改动，请人工确认）：${d.skippedForeign.join("、")}`)
  }
  if (report.reclaimed.length > 0) {
    console.log("")
    console.log(`  已回收空目录：${report.reclaimed.join("、")}`)
  }
  console.log("")
  if (dryRun) console.log("[预演] 未执行删除；无遗留条目时将同时删除项目面归属账")
  else if (report.stateRemoved) console.log("项目面归属账已删除，本包产物清理完毕")
  else console.log("项目面归属账已保留（存在需人工确认或未移除的条目）")
}

// 打印安装报告（按作用域分派到对应面；两面都跑时各自成段）
function printInstallReports(scope: { choice: ScopeChoice; explicit: boolean }, glob: InstallReport | null, project: ProjectInstallReport | null, dryRun: boolean): void {
  console.log(scopeHeadline(scope))
  if (project) {
    console.log("")
    printProjectInstallReport(project, dryRun)
  }
  if (glob) {
    console.log("")
    printInstallReport(glob, dryRun)
  }
}

// 打印状态报告（按作用域分派到对应面）
function printStatusReports(scope: { choice: ScopeChoice; explicit: boolean }, glob: SkillsStatusReport | null, project: ProjectStatusReport | null): void {
  console.log(scopeHeadline(scope))
  if (project) {
    console.log("")
    printProjectStatusReport(project)
  }
  if (glob) {
    console.log("")
    printStatusReport(glob)
  }
}

// 打印卸载报告（按作用域分派到对应面）
function printRemoveReports(scope: { choice: ScopeChoice; explicit: boolean }, glob: SkillsRemoveReport | null, project: ProjectRemoveReport | null, dryRun: boolean): void {
  console.log(scopeHeadline(scope))
  if (project) {
    console.log("")
    printProjectRemoveReport(project, dryRun)
  }
  if (glob) {
    console.log("")
    printRemoveReport(glob, dryRun)
  }
}

// tasks 子命令与查询/导出/导入的选项集合
interface TasksOptions {
  dir?: string
  redact: boolean | undefined
  warn: boolean | undefined
  dryRun: boolean
  fix: boolean
  check: boolean
  view?: string
  owner?: string
  scope?: string
  status?: string
  date?: string
  since?: string
  until?: string
  export?: string
  format?: string
  import?: string
  target?: string
  strict?: boolean
}

// tasks 域自有子命令白名单：与 `.argument` 描述同源，避免两处手写漂移；留空即任务总览
const TASKS_SUBCOMMANDS = ["archive", "check", "normalize", "stats"]

const program = new Command()

// commander 解析失败时会自行把英文错误写到 stderr 后才抛异常，此处先缓存：
// 命中中文映射时丢弃原文案改由 main 统一输出，未命中（帮助/版本/未收录 code）则原样放行
let commanderErrBuffer = ""

program
  .name("toolkit")
  .description(DESCRIPTION)
  .version(version, "-v, --version", "显示版本号")
  .enablePositionalOptions(true)
  // 交回解析错误的控制权（否则 commander 自行 process.exit，异常捕不到）
  // ⚠️ 须在声明任何子命令之前调用：_exitCallback 只在 .command() 建子命令时按引用复制，之后再设不回溯
  .exitOverride()
  .configureOutput({ writeErr: (str) => { commanderErrBuffer += str } })

// help footer：指向文档站，降低新用户查找成本
program.addHelpText(
  "after",
  [
    "",
    "文档站：",
    `  新手指南 ${INIT_LINKS.gettingStarted}`,
    `  完整攻略 ${INIT_LINKS.guide}`,
    `  全部文档 ${INIT_LINKS.site}`,
  ].join("\n"),
)

// init 动作标签：逐项如实报告实际动作，替代只讲「会做什么」的固定话术
const INIT_ACTION_LABEL: Record<InitAction, string> = {
  created: "新建",
  updated: "更新",
  kept: "保持",
  appended: "追加",
  skipped: "跳过",
}

// 打印 init 报告：逐项列出实际动作与原因，hint 另起一行提示后续可选操作
function printInitReport(report: InitReport): void {
  console.log(`任务区：${report.tasksDir}`)
  for (const p of report.products) {
    console.log(`  ${INIT_ACTION_LABEL[p.action]} ${p.target}${p.detail ? `（${p.detail}）` : ""}`)
    if (p.hint) console.log(`    提示：${p.hint}`)
  }
  console.log("")
  console.log("下一步：")
  // 规范触达第一层是全局技能（不依赖项目内任何文件）；未安装时补一行安装指引，已装不重复打扰
  if (!report.skillsInstalled) {
    console.log("  全局技能：未安装，执行 toolkit skills install 启用（规范触达第一层，不依赖项目内文件；toolkit skills status 可查现场）")
  }
  console.log(`  新手指南：${INIT_LINKS.gettingStarted}`)
  console.log(`  完整攻略：${INIT_LINKS.guide}`)
}

// init：初始化项目任务区（生成任务区骨架、规范载体与技能入口壳，幂等可重复执行）
program
  .command("init")
  .description("初始化项目任务区（生成 .tasks/ 骨架、规范载体与技能入口壳，补齐 .gitignore 片段与 prepare 刷新钩子）")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
  .option("--no-hooks", "不写入 package.json 的 prepare 刷新钩子（默认写入，仅当本地依赖含 @xfri/toolkit）")
  .action((options: { dir?: string; hooks?: boolean }) => {
    try {
      // 与 tasks 命令同口径：初始化时也尊重配置中已声明的外置任务目录
      printInitReport(initWorkspace(resolveTasksDir(options.dir), process.cwd(), { hooks: options.hooks }))
    } catch (e) {
      console.error(`⚠️ 初始化失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// skills 域：把包内 skills/ 分发到各 agent 的全局技能目录（真源唯一，默认软链以便升级自动跟随）
const skillsCmd = program
  .command("skills")
  .description("AI 技能包分发：安装 / 状态 / 卸载 / 路径（包内 skills/ 为唯一真源）")

// 安装：默认软链真源，链接创建失败自动降级副本；只写入「已安装」的 agent 目录，不凭空造目录
skillsCmd
  .command("install")
  .description("安装包内技能（默认按现场判定作用域：仓库内写项目面副本 + 薄壳，否则写全局目录；软链失败降级副本）")
  .option("--scope <scope>", "作用域（project 项目面 / global 全局面 / all 两者；缺省按现场自动判定）")
  .option("--copy", "强制以副本形式写入（仅全局面生效；项目面真源恒为副本、其余目录恒为薄壳）")
  .option("--dir <path>", "额外目标目录（可多次指定，兜底内置表未收录的 agent）", collectDir, [])
  .option("--dry-run", "预演（只预览将要执行的动作，不写文件）")
  .option("--force", "覆盖同名非本包产物（默认跳过，避免破坏用户自装技能；不改本包已登记副本的形态）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { scope?: string; copy?: boolean; dir: string[]; dryRun?: boolean; force?: boolean; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const scope = resolveScopeChoice(options.scope)
      if (!scope) return
      const dryRun = Boolean(options.dryRun)
      const runProject = scope.choice !== "global"
      const runGlobal = scope.choice !== "project"
      if (runProject && options.copy) console.warn("⚠️ 项目面不支持 --copy（真源恒为副本、各候选目录恒为薄壳），已忽略该项目面取值")
      const project = runProject ? installProjectSkills({ dirs: options.dir, dryRun, force: options.force }) : null
      const global = runGlobal ? installSkills({ copy: options.copy, dirs: options.dir, dryRun, force: options.force }) : null
      if (options.format === "json") printJson({ dryRun, scope: scope.choice, global, project })
      else printInstallReports(scope, global, project, dryRun)
    } catch (e) {
      console.error(`⚠️ 安装失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 状态：报告悬空 / 指向其他版本 / 副本漂移 / 同名冲突 / 缺失，供人工决定是否重跑 install
skillsCmd
  .command("status")
  .description("查看技能现场状态与真源版本（默认按现场判定作用域；含悬空 / 指向其他版本 / 漂移 / 缺失 / 同名冲突）")
  .option("--scope <scope>", "作用域（project 项目面 / global 全局面 / all 两者；缺省按现场自动判定）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { scope?: string; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const scope = resolveScopeChoice(options.scope)
      if (!scope) return
      const runProject = scope.choice !== "global"
      const runGlobal = scope.choice !== "project"
      const project = runProject ? projectSkillsStatus() : null
      const global = runGlobal ? skillsStatus() : null
      if (options.format === "json") printJson({ scope: scope.choice, global, project })
      else printStatusReports(scope, global, project)
    } catch (e) {
      console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 卸载：只清理状态文件记载的本包产物，绝不触碰用户自装技能或其他方式安装的技能
skillsCmd
  .command("remove")
  .description("卸载由本包安装的技能产物（默认按现场判定作用域；只清理归属账记载的条目，不碰用户自装技能）")
  .option("--scope <scope>", "作用域（project 项目面 / global 全局面 / all 两者；缺省按现场自动判定）")
  .option("--dry-run", "预演（只预览将要移除的条目，不删文件）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { scope?: string; dryRun?: boolean; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const scope = resolveScopeChoice(options.scope)
      if (!scope) return
      const dryRun = Boolean(options.dryRun)
      const runProject = scope.choice !== "global"
      const runGlobal = scope.choice !== "project"
      const project = runProject ? removeProjectSkills({ dryRun }) : null
      const global = runGlobal ? removeSkills({ dryRun }) : null
      if (options.format === "json") printJson({ dryRun, scope: scope.choice, global, project })
      else printRemoveReports(scope, global, project, dryRun)
    } catch (e) {
      console.error(`⚠️ 卸载失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 路径：输出包根（内含 skills/），便于委托上游安装器覆盖内置表未收录的 agent
skillsCmd
  .command("path")
  .description("输出包根路径（内含 skills/，可委托上游安装器安装到表外 agent）")
  .option("--format <format>", "输出格式（json：包根、技能源目录、技能清单）")
  .action((options: { format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      if (options.format === "json") {
        printJson({ package: skillsPackageDir(), source: skillsSourceDir(), skills: listPackageSkills().map((s) => s.name) })
      } else {
        console.log(skillsPackageDir())
      }
    } catch (e) {
      console.error(`⚠️ 定位包路径失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 裸 `toolkit skills`：打印本域帮助，列出 4 个子命令
skillsCmd.action(() => {
  skillsCmd.help()
})

// 打印升级报告：ID 映射（不落盘）+ 逐项结构动作 + 内部引用改写清单，风格与 skills install 预演一致
function printUpgradeReport(report: UpgradeReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  console.log(`${tag}任务区：${report.tasksDir}`)
  console.log(`${tag}载体：${report.dir}（形态 ${report.form}）`)
  if (report.status === "already-v2") {
    console.log(`${tag}已是 v2 形态，无需升级`)
    return
  }
  console.log("")
  console.log(`${tag}ID 映射（序号 → 稳定 ID，仅随报告输出，不落盘）：`)
  for (const row of report.idMap) console.log(`  ${row.seq} → ${row.id}  ${row.name}`)
  console.log("")
  console.log(`${tag}结构动作：`)
  for (const c of report.changes) console.log(`  ${c.target}：${c.detail}`)
  if (report.refs.length > 0) {
    console.log("")
    console.log(`${tag}内部引用改写：`)
    for (const r of report.refs) console.log(`  ${r.file}：${r.from} → ${r.to}`)
  }
  console.log("")
  if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
  else console.log("已写入；v1 原件可由本次迁移提交的父提交复现")
}

// 打印体检报告：先给一句话结论，再列载体 / 入口壳现场与逐项待处理项（warn 带 ⚠️，info 带 ·）
function printConventionsStatus(report: ConventionsStatusReport): void {
  console.log(report.summary)
  if (!report.initialized) return
  const marker = report.carrierVersion === null ? "无" : `v${report.carrierVersion}`
  console.log(`任务区：${report.tasksDir}`)
  console.log(`载体：${report.dir}（形态 ${report.form}，形态标记 ${marker}，条目 ${report.entries}）`)
  console.log(
    `入口壳：${
      report.shells.length > 0
        ? report.shells.map((s) => `${s.file}（标记 ${s.version === null ? "无" : `v${s.version}`}${s.ignored ? "，被 gitignore 覆盖" : ""}）`).join("、")
        : "无"
    }`,
  )
  console.log("")
  if (report.items.length === 0) {
    console.log("无待处理项")
    return
  }
  for (const item of report.items) console.log(`${item.level === "warn" ? "⚠️" : "·"} [${item.scope}] ${foldHomeInText(item.message)}`)
}

// conventions 域：规范载体的结构升级与只读体检（载体细则见 skills/fxri-plan-to-task/references/conventions-spec.md）
const conventionsCmd = program
  .command("conventions")
  .description("项目协作规范载体：结构升级（v1 → v2）与只读体检（形态 / 索引 / 入口层）")

// 升级：纯机械结构升级，先判后写；形态异常或未初始化时拒绝执行并给非 0 退出码（异常态不写任何文件）
conventionsCmd
  .command("upgrade")
  .description("把 v1 规范载体升级为 v2（发稳定 ID / 切 history.md / 内部引用改 ID；幂等，先判后写）")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
  .option("--dry-run", "预演（只预览将要执行的动作，不写文件）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { dir?: string; dryRun?: boolean; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const report = upgradeConventions(resolveTasksDir(options.dir), { dryRun: options.dryRun })
      if (options.format === "json") printJson({ dryRun: Boolean(options.dryRun), ...report })
      else printUpgradeReport(report, Boolean(options.dryRun))
    } catch (e) {
      console.error(`⚠️ 升级失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 状态：只读体检，只报不改（不给 --fix）；体检本身不阻断、退出码恒 0，仅 --format 传非法值时按参数错误报错退出
conventionsCmd
  .command("status")
  .description("规范载体只读体检：形态 / 索引 / 入口层三块（只报不改，体检不阻断、退出码恒 0；仅 --format 传非法值时按参数错误报错退出）")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { dir?: string; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const report = conventionsStatus(resolveTasksDir(options.dir))
      if (options.format === "json") printJson(report)
      else printConventionsStatus(report)
    } catch (e) {
      console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
    }
  })

// 裸 `toolkit conventions`：打印本域帮助，列出 2 个子命令
conventionsCmd.action(() => {
  conventionsCmd.help()
})

// 本地配置文件忽略状态的文本态文案（键集合与 src/git-ignore.ts 的 LocalConfigIgnoreState 对齐）
const CONFIG_IGNORE_LABEL: Record<LocalConfigIgnoreState, string> = {
  ignored: "已忽略",
  tracked: "已跟踪（需 git rm --cached）",
  "not-ignored": "未忽略",
  "not-a-repo": "不适用（非 git 仓库）",
  "outside-repo": "不适用（位于仓库工作树之外）",
  unavailable: "忽略判定不可用",
}

// 打印配置分层报告：先给一句话结论，再列三层现场 / 展示键来源 / 环境变量层 / 能力旁路 / 其余已配置段 / 待处理项
// 一律不打印配置值（redact 段含个人脱敏规则、skills 段含本机路径，落到终端 / CI 日志即外泄）
// 路径一律走 foldHome / foldHomeInText 折叠为 ~（层级路径与待处理项文案内嵌的路径同等处理），避免共享日志泄露本机目录结构
function printConfigStatus(report: ConfigStatusReport): void {
  console.log(report.summary)
  console.log(`查找起点：${foldHome(report.cwd)}`)
  console.log("")
  console.log("层级：")
  for (const level of report.levels) {
    const file = level.file === null ? "无" : foldHome(level.file)
    const ignore = level.ignored === null ? "" : `，${CONFIG_IGNORE_LABEL[level.ignored.state]}`
    console.log(`  ${level.layer}：${file}${ignore}`)
  }
  console.log("")
  console.log("展示键来源：")
  for (const item of report.displayKeys) console.log(`  ${item.key}：${item.source ?? "默认值"}`)
  console.log("")
  const pairs = (hits: Array<{ env: string; key: string }>) => (hits.length > 0 ? hits.map((h) => `${h.env} → ${h.key}`).join("、") : "无")
  console.log(`环境变量层：${pairs(report.env)}`)
  console.log(`能力旁路：${pairs(report.bypass)}`)
  console.log("")
  const groups = report.levels.filter((level) => level.otherSections.length > 0)
  if (groups.length === 0) {
    console.log("其余已配置段：无")
  } else {
    console.log("其余已配置段：")
    for (const level of groups) console.log(`  ${level.layer}：${level.otherSections.join("、")}`)
  }
  console.log("")
  if (report.items.length === 0) {
    console.log("无待处理项")
    return
  }
  for (const item of report.items) console.log(`${item.level === "warn" ? "⚠️" : "·"} [${item.scope}] ${item.message}`)
}

// config 域：三层配置文件的只读体检（层级 / 来源 / 忽略状态；载体细则见 docs/config.md）
const configCmd = program
  .command("config")
  .description("配置分层：只读查看三层配置文件（全局层 / 项目层 / 本地层）的生效情况与来源")

// 状态：只读体检，只报不改（不给 --fix）；体检本身不阻断、退出码恒 0，仅 --format 非法与 --cwd 非法时按参数错误报错退出
configCmd
  .command("status")
  .description("配置分层只读体检：三层命中 / 来源层 / 环境变量层（只读、退出码恒 0；无 --dir，可用 --cwd 指定查找起点）")
  .option("--cwd <path>", "向上查找的起始目录（缺省当前工作目录）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { cwd?: string; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const cwd = options.cwd === undefined ? process.cwd() : resolve(options.cwd)
      // 降级不静默：--cwd 非法时不回落 process.cwd()（回落会给出起点错误的报告，比报错更危险）
      if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
        console.error(`⚠️ --cwd 指向的路径不存在或非目录：${options.cwd}`)
        process.exitCode = 1
        return
      }
      const report = configStatus(cwd)
      if (options.format === "json") printJson(report)
      else printConfigStatus(report)
    } catch (e) {
      // 体检失败不置退出码：与 conventions status 对齐，「只读体检不阻断」是本命令的设计意图
      console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
    }
  })

// 裸 `toolkit config`：打印本域帮助，列出 1 个子命令
configCmd.action(() => {
  configCmd.help()
})

// tasks 域：任务总览 / 归档 / 校验 / 归一化
program
  .command("tasks")
  .description("任务管理")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
  .option("--redact", "开启隐私脱敏")
  .option("--no-redact", "关闭隐私脱敏")
  .option("--warn", "开启软告警")
  .option("--no-warn", "关闭软告警")
  .option("--dry-run", "预演（archive 归档 / import 导入只预览，不落盘）")
  .option("--fix", "归一化修复（仅 normalize 有效；检查项与 tasks check 同源，check 只读不改）")
  .option("--check", "归一化只读检查（normalize 默认行为，可显式声明；检查项与 tasks check 同源、不能与 --fix 同用）")
  .option("--view <view>", "任务视图：active / archived / all（总览默认 active，stats 默认 all 含归档）")
  .option("--owner <name>", "按负责人过滤（逗号分隔多值）")
  .option("--scope <scope>", "按范围过滤（逗号分隔多值）")
  .option("--status <status>", "按状态过滤（逗号分隔多值）")
  .option("--date <date>", "按单日过滤（YYYY-MM-DD，与 --since/--until 互斥）")
  .option("--since <date>", "起始日期（含当天）")
  .option("--until <date>", "结束日期（含当天）")
  .option("--export <path>", "导出到文件（.csv / .xlsx / .json）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .option("--import <file>", "从文件导入任务（.csv / .xlsx / .json）")
  .option("--target <target>", "导入目标：active / archive（默认 active）")
  .option("--strict", "任务目录不存在时报错退出（默认容错为空结果）")
  .argument("[command]", `子命令：${TASKS_SUBCOMMANDS.join(" / ")}，留空为总览（含导入用 --import）`)
  .action(
    async (
      command: string | undefined,
      options: TasksOptions,
    ) => {
      // 子命令白名单：表外值直接报错，避免静默回落任务总览（如 `tasks bogus` 原本无提示地打印总览）
      if (command && !TASKS_SUBCOMMANDS.includes(command)) {
        console.error(`⚠️ 非法子命令「${command}」，仅支持 ${TASKS_SUBCOMMANDS.join(" / ")}（留空查看任务总览）`)
        process.exitCode = 1
        return
      }

      const redact = resolveRedactEnabled(options.redact)
      const warn = resolveEnabled(options.warn, "FX_CHECK_WARN", getCheckWarnings(), true)
      // 任务目录三档解析：CLI --dir > 配置 tasks.dir > 默认 .tasks
      const dir = resolveTasksDir(options.dir)

      // 严格模式：任务目录不存在时直接报错（默认容错为空结果）
      if (options.strict && !existsSync(dir)) {
        console.error(`⚠️ 任务目录不存在：${dir}`)
        process.exitCode = 1
        return
      }

      // 导入模式：独立于归档/校验/归一化与查询导出
      if (options.import) {
        if (command || options.export || options.format) {
          console.error("⚠️ --import 为独立模式，不能与子命令、--export、--format 同时使用")
          process.exitCode = 1
          return
        }
        const section = getConfigSection("tasks")
        const custom = section?.importColumns && typeof section.importColumns === "object" ? (section.importColumns as Record<string, string>) : undefined
        const target = (options.target ?? "active") as string
        if (!["active", "archive"].includes(target)) {
          console.error(`⚠️ 非法导入目标「${target}」，仅支持 active / archive`)
          process.exitCode = 1
          return
        }
        try {
          await importTasks(options.import, dir, {
            owner: options.owner,
            scope: options.scope,
            target: target as ImportTarget,
            dryRun: options.dryRun,
            importColumns: custom,
          })
        } catch (e) {
          console.error(`⚠️ 导入失败：${(e as Error).message}`)
          process.exitCode = 1
        }
        return
      }

      // 降级不静默：子命令不消费的 --export / --format 告警忽略（stats 消费 --format、仅总览消费 --export）
      if (command === "stats") {
        if (options.export) console.warn("⚠️ 子命令「stats」不支持 --export，已忽略（仅任务总览支持导出）")
      } else if (command) {
        warnUnsupportedOutput(command, options)
      }

      if (command === "archive") {
        try {
          const result = archiveTasks(dir, redact, { dryRun: options.dryRun, warn })
          // 软告警：归档了任务但无待发布变更集（仅真实归档时提示，预演不提示）
          if (warn && !options.dryRun && result.archived > 0 && !hasPendingChangeset()) {
            console.warn("⚠️ 本次归档了任务，但 .changeset 无待发布变更集，如需发版请先创建变更集")
          }
        } catch (e) {
          console.error(`⚠️ 操作失败：${(e as Error).message}`)
          process.exitCode = 1
        }
      } else if (command === "check") {
        try {
          const result = validateTasks(dir)
          // 变更集缺前缀检测并入同一份问题清单（软告警关闭时不计不报）
          const issues = warn ? [...result.issues, ...changesetPrefixIssues()] : result.issues
          const errorCount = issues.filter((i) => i.level === "error").length
          console.log("任务校验：")
          console.log(`【error】${errorCount} 项`)
          printIssues(issues.filter((i) => i.level === "error"))
          if (warn) {
            console.log(`【warn】${issues.length - errorCount} 项`)
            printIssues(issues.filter((i) => i.level === "warn"))
          } else {
            console.log("（软告警已关闭，warn 不展示）")
          }
          if (errorCount > 0) process.exitCode = 1
        } catch (e) {
          console.error(`⚠️ 操作失败：${(e as Error).message}`)
          process.exitCode = 1
        }
      } else if (command === "stats") {
        // 统计视图：复用查询过滤参数，输出周期 / 滞留 / 吞吐三类指标
        if (!assertJsonFormat(options.format)) return
        const statView = (options.view ?? "all") as string
        if (!["active", "archived", "all"].includes(statView)) {
          console.error(`⚠️ 非法视图「${statView}」，仅支持 active / archived / all`)
          process.exitCode = 1
          return
        }
        if (options.date && (options.since || options.until)) {
          console.error("⚠️ --date 不能与 --since / --until 同时使用")
          process.exitCode = 1
          return
        }
        try {
          const filter: TaskFilter = {}
          filter.owner = splitMulti(options.owner)
          filter.scope = splitMulti(options.scope)
          if (!applyStatusFilter(filter, options.status)) return
          if (options.date) filter.date = options.date
          if (options.since) filter.since = options.since
          if (options.until) filter.until = options.until
          const stats = computeStats(dir, filter, statView as TaskView)
          if (options.format === "json") {
            printJson(stats)
          } else {
            for (const line of renderStats(stats)) console.log(line)
          }
        } catch (e) {
          console.error(`⚠️ 操作失败：${(e as Error).message}`)
          process.exitCode = 1
        }
      } else if (command === "normalize") {
        try {
          if (options.fix && options.check) {
            console.error("⚠️ --fix 与 --check 不能同时使用")
            process.exitCode = 1
          } else if (options.fix) {
            const result = fixArchive(dir)
            console.log(`已修复 ${result.fixed} 处`)
            if (result.issues.length > 0) {
              console.log("以下问题需人工确认：")
              printIssues(result.issues)
            }
          } else {
            const issues = checkArchive(dir)
            console.log(`归档归一化检查：发现 ${issues.length} 处问题`)
            printIssues(issues)
          }
        } catch (e) {
          console.error(`⚠️ 操作失败：${(e as Error).message}`)
          process.exitCode = 1
        }
      } else {
        // 总览：视图 + 过滤 + 终端表格 / 导出
        const view = (options.view ?? "active") as string
        if (!["active", "archived", "all"].includes(view)) {
          console.error(`⚠️ 非法视图「${view}」，仅支持 active / archived / all`)
          process.exitCode = 1
          return
        }
        if (options.date && (options.since || options.until)) {
          console.error("⚠️ --date 不能与 --since / --until 同时使用")
          process.exitCode = 1
          return
        }
        if (options.export && options.format) {
          console.error("⚠️ --export 与 --format 不能同时使用（--format json 输出到 stdout）")
          process.exitCode = 1
          return
        }
        if (!assertJsonFormat(options.format)) return
        const filter: TaskFilter = {}
        filter.owner = splitMulti(options.owner)
        filter.scope = splitMulti(options.scope)
        if (!applyStatusFilter(filter, options.status)) return
        if (options.date) filter.date = options.date
        if (options.since) filter.since = options.since
        if (options.until) filter.until = options.until
        try {
          const { rows, summary } = queryTasks(dir, view as TaskView, filter)
          if (options.export) {
            await exportTasks(options.export, rows, summary, redact)
            console.log(`已导出 ${rows.length} 个任务 → ${options.export}`)
          } else if (options.format === "json") {
            console.log(toJSON(rows, summary, redact))
          } else {
            renderTaskBoard(rows, summary, view as TaskView, filter, redact)
            // 默认视图提示：带过滤但落在待完成视图无结果时，提示归档需要显式 --view（避免误以为过滤不生效）
            const hasFilter = Boolean(options.owner || options.scope || options.status || options.date || options.since || options.until)
            if (!options.view && hasFilter && rows.length === 0) {
              console.log("（提示：过滤默认作用于待完成视图，查看归档请加 --view archived 或 --view all）")
            }
          }
        } catch (e) {
          console.error(`⚠️ 操作失败：${(e as Error).message}`)
          process.exitCode = 1
        }
      }
    },
  )

// changelog 域：version/format 自处理，其余子命令透传给 changesets
const changelogCmd = program
  .command("changelog")
  .description("多语言 CHANGELOG（封装 changesets）")
  .option("--lang <lang>", "语言 zh/en", DEFAULT_LANG)
  .option("--redact", "开启隐私脱敏")
  .option("--no-redact", "关闭隐私脱敏")
  .option("--warn", "开启软告警")
  .option("--no-warn", "关闭软告警")
  .option("--history", "追溯改写历史版本块（默认保留）")
  .argument("[command...]", "子命令及参数（透传给 changesets）")
  .passThroughOptions(true)
  .action(
    (
      operands: string[],
      options: { lang: string; redact: boolean | undefined; warn: boolean | undefined; history: boolean | undefined },
    ) => {
      // 帮助标志紧跟自处理子命令时会被透传语义当作操作数丢弃、命令照跑（真发版 / 真改写 CHANGELOG），此处拦截并打印本域帮助
      if (shouldPrintChangelogHelp(operands)) {
        changelogCmd.help()
        return
      }

      const redact = resolveRedactEnabled(options.redact)
      const warn = resolveEnabled(options.warn, "FX_CHECK_WARN", getCheckWarnings(), true)
      const history = options.history === true
      // 合并配置语言（支持自定义语言与覆盖内置），实现全语言
      const merged = resolveLanguages()
      // 语言解析：未知取值回落默认语言，但显式传入却无法采纳的值必须告警（走 stderr，stdout 留给机器可读输出）
      const { lang, unknown: unknownLang } = resolveLang(merged, options.lang, DEFAULT_LANG)
      if (unknownLang) console.warn(`⚠️ 未知语言「${unknownLang}」，已回落 ${DEFAULT_LANG}`)
      const command = operands[0]
      if (command === "version") {
        // 软告警：发版前存在未归档任务
        if (warn && hasActiveTasks()) {
          console.warn("⚠️ 存在未归档的 active 任务，建议先归档再发版")
        }
        runChangeset(["version"])
        // 软告警须前置于归类（须待 changesets 写入新块后再取数，否则无英文源标题块可扫）；
        // 归类后无前缀条目即并入兜底组，前缀缺失无从统计
        if (warn) warnUntypedEntries(Object.values(merged))
        formatChangelogs(".", localDate(), lang, redact, history)
      } else if (command === "format") {
        // 手工 format 路径与 version 同源同开关，告警口径保持一致
        if (warn) warnUntypedEntries(Object.values(merged))
        formatChangelogs(".", localDate(), lang, redact, history)
      } else if (command) {
        runChangeset(operands)
      } else {
        runChangeset([])
      }
    },
  )

// 帮助口径统一：命令声明完毕后递归换中文帮助文案并对齐父级清单
// ⚠️ 顺序：须先 setupHelp 再 helpCommand——help 子命令自带 helpOption(false)，反过来会把它的 Usage 撑成 [options] [command]
setupHelp(program)
program.helpCommand("help [command]", "显示帮助")

ensureUtf8()
// main 包装：兼容 CJS 产物（顶层 await 仅 ESM 支持）；主命令完成后同步读缓存提示升级（零网络、不影响退出码）
async function main(): Promise<void> {
  // 内部升级检查 worker：仅联网刷新缓存后退出，不执行命令、不做技能自愈（参数由 startUpdateCheck 派生时注入）
  if (process.argv[2] === UPDATE_CHECK_WORKER_ARG) {
    await runUpdateCheckWorker()
    return
  }
  // 链接自愈先于命令执行：升级后旧链接悬空时本次命令即复位（开关 skills.autoLink，CI 环境自动跳过）
  const repaired = autoLinkSkills()
  // 提示走 stderr：stdout 为机器可读输出（--format json）的专用通道，不得混入诊断信息
  if (repaired > 0) console.error(`已自动修复 ${repaired} 个技能链接（如不需要可配置 .toolkitrc.json 的 skills.autoLink: false 关闭）`)
  try {
    await program.parseAsync(process.argv)
  } catch (err) {
    // exitOverride 后 commander 把「解析失败」与「已输出帮助/版本」统一改为抛异常，均经此收口
    if (!(err instanceof CommanderError)) throw err
    const zh = formatCommanderError(err)
    // 命中映射：丢弃 commander 英文原文，改输出中文提示；未命中（帮助/版本等）：原样放行
    if (zh) console.error(zh)
    else process.stderr.write(commanderErrBuffer)
    process.exitCode = err.exitCode
  } finally {
    // 所有路径（成功 / 帮助 / 版本 / 解析失败）一致触发升级检查；命中缓存仅读盘提示，零网络
    startUpdateCheck(version)
  }
}
// 执行语义不变，仅导出 Promise 供测试 await 主流程（cli.ts 无法被静态 import，见 src/__tests__/options-matrix.test.ts）
export const cliReady = main()
