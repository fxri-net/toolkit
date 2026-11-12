#!/usr/bin/env node

import { Command, CommanderError } from "commander"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
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
import { localDate, formatChangelogs, countUntypedEntries, findUntypedChangesetEntries, findUnbulletedChangesetEntries } from "./changelog/format"
import { auditChangesets, formatAuditReport } from "./changelog/audit"
import { checkDoc, resolveDocOptions, syncDoc, syncDocAfterVersion } from "./changelog/doc"
import { checkDocsTheme, writeDocsTheme } from "./docs/theme"
import { checkDocsDist, DIST_RULES_VERSION } from "./docs/dist"
import { checkDocsNav, NAV_RULES_VERSION } from "./docs/nav"
import type { DocsProblem } from "./docs/types"
import { resolveRedactEnabled } from "./privacy/redact"
import { resolveEnabled } from "./switch"
import { getConfigSection, getHomeDir, resolveTasksDir } from "./config"
import { configStatus, foldHome, foldHomeInText, type ConfigStatusReport } from "./config-status"
import type { LocalConfigIgnoreState } from "./git-ignore"
import { initWorkspace, INIT_LINKS, type InitAction, type InitReport } from "./init"
import { upgradeConventions, type UpgradeReport } from "./conventions/upgrade"
import { formatConventions, type FormatReport } from "./conventions/compact"
import { conventionsStatus, resolveCarrierRoot, type ConventionsStatusReport } from "./conventions/status"
import { toJsonText, assertJsonFormat } from "./json-output"
import { registerUsageCommands, setToolkitVersion } from "./usage"
import { composeRules, listRules, loadRuleset } from "./rules"
import { clearRulesSelection, readRulesSelection, writeRulesSelection } from "./rules/cache"
import { copyToClipboard } from "./rules/clipboard"
import { writeFileAtomic } from "./write-atomic"
import {
  autoLinkSkills,
  availableTargetNames,
  buildGlobalTargetChoices,
  buildProjectTargetChoices,
  collectSkillItems,
  detectSkillScope,
  expiredSelectionWarnings,
  expandSkillRequires,
  findStaleArtifacts,
  findUnselectedSkills,
  findProjectRenamedArtifacts,
  installProjectSkills,
  installSkills,
  isInteractiveTty,
  listPackageSkills,
  planSkillSelection,
  projectSkillsStatus,
  promptConfirm,
  promptSkillSelection,
  promptTargetSelection,
  promptUninstallSelection,
  readProjectSkillsConfig,
  readProjectState,
  readSkillsInstallConfig,
  readSkillsState,
  resolveSavedProjectSelection,
  resolveSavedSelection,
  writeProjectSkillsConfig,
  removeProjectSkills,
  removeSkills,
  resolveSource,
  resolveProjectTargets,
  resolveLocalSource,
  resolveSkillTargets,
  refreshRemoteSource,
  acquireSkillsLock,
  skillsLockFile,
  writeUpdateCheckSourceNotify,
  removeUpdateCheckSource,
  writeSkillsState,
  skillsPackageDir,
  skillsSourceDir,
  skillsStatus,
  writeSkillsInstallConfig,
  bumpSkillVersions,
  isValidVersion,
  BUILTIN_SOURCE,
  type InstallReport,
  type ProjectDirResult,
  type ProjectInstallReport,
  type ProjectItemState,
  type ProjectRemoveReport,
  type ProjectStatusReport,
  type SkillItem,
  type SkillItemState,
  type SkillsMode,
  type SkillsRemoveReport,
  type SkillsStatusReport,
  type UninstallChoice,
} from "./skills"
import {
  emitVersionHint,
  readCachedLatest,
  resolveRegistry,
  resolveNotify,
  resolveNotifySource,
  resolveBuiltinNotifyLabel,
  isUpdateCheckEnabled,
  runUpdateCheckWorker,
  dismissSkillAlerts,
  readHintTiming,
  UPDATE_CHECK_WORKER_ARG,
  type RegistryInfo,
  type SkillAlert,
} from "./update-check"
import { collectSkillVersionUpdates, type SkillVersionReport } from "./skills/version-status"
import { versionGt } from "./version"
import { setupHelp } from "./help"
import { formatCommanderError } from "./errors"
import { DESCRIPTION } from "./about"

const require = createRequire(import.meta.url)

// 解析 @changesets/cli 的 bin 绝对路径（pnpm 下 bin 不提升到使用方，需显式定位）
const changesetBin = require.resolve("@changesets/cli/bin.js")
// 版本号从 package.json 读取，避免与 package.json 重复维护
const { version } = require("../package.json")
// 使用情况事件记录当前 toolkit 版本：库形态不依赖包路径，由入口统一注入
setToolkitVersion(version)

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

// 变更集写法检测（tasks check 早期检测）：扫 .changeset 下待发布变更集，缺类型前缀 / 未加列表标记的文件各转一条 warn 级问题
// 前缀识别遍历全部配置语言，自定义语言不误报；与 changelog 侧 warnUntypedEntries 互补，不在同一命令内重复触发
function changesetPrefixIssues(): CheckIssue[] {
  const langs = Object.values(resolveLanguages())
  return [
    ...findUntypedChangesetEntries(".changeset", langs).map((entry) => ({
      level: "warn" as const,
      file: entry.file,
      line: entry.line,
      message: `变更集条目缺类型前缀（本文件 ${entry.count} 条），建议按「类型：描述」撰写`,
    })),
    ...findUnbulletedChangesetEntries(".changeset", langs).map((entry) => ({
      level: "warn" as const,
      file: entry.file,
      line: entry.line,
      message: `变更集条目未加「- 」列表标记（本文件 ${entry.count} 行），changesets 会并入单一条目，请逐条写成「- 类型：描述」`,
    })),
  ]
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
  "not-selected": "未选择",
  "installed-unselected": "未选择但已安装",
}

// 需要处理的异常状态：status 汇总提示与 install 修复范围
const SKILL_PROBLEM_STATES: SkillItemState[] = ["dangling", "wrong", "copy-drift", "missing", "conflict"]

// 技能选择面：全局面取全局层配置，项目面取项目层配置
type SkillSelectionFace = "global" | "project"

// 解析本次技能选择：显式参数 > --all / --no-optional > 已保存选择 > 首次只装 core
// TTY 下未传 --yes 时进入方向键多选；用户取消返回 null（调用方不得写任何文件）
async function resolveSkillSelection(
  options: { skills?: string; all?: boolean; optional?: boolean; yes?: boolean; mode?: string; noSkills?: boolean },
  face: SkillSelectionFace,
  skills: SkillItem[],
): Promise<{ names: string[]; mode: SkillsMode; saveSelection: boolean } | null> {
  const configuredMode = face === "global" ? readSkillsInstallConfig().mode : readProjectSkillsConfig().mode
  const mode: SkillsMode = options.mode === "package" || options.mode === "skills" ? options.mode : configuredMode ?? "skills"
  // --no-skills：本次零装，不改模式与保存选择
  if (options.noSkills) return { names: [], mode, saveSelection: false }
  let saved: string[] | undefined
  // --mode 显式切换时按新模式基线，不沿用旧模式的保存选择
  if (options.mode === undefined) {
    // 已保存名单统一走选择解析：曾用名迁移、整份失效重算，两面同一口径
    const view = skills.map((item) => ({
      name: item.name,
      source: item.source,
      sourceKind: item.sourceKind,
      tier: item.tier,
      previousNames: item.previousNames,
    }))
    const resolved =
      face === "global"
        ? resolveSavedSelection(view, readSkillsInstallConfig().selection)
        : resolveSavedProjectSelection(view, readProjectSkillsConfig().selection)
    for (const line of expiredSelectionWarnings(resolved)) console.warn(line)
    saved = resolved.saved
  }
  // 显式传了 --skills 但取值为空（如 --skills ""）按全部非法处理，不静默当作未传
  const explicit = options.skills !== undefined ? (splitMulti(options.skills) ?? []) : undefined
  const plan = planSkillSelection({
    skills,
    saved,
    explicit,
    all: Boolean(options.all),
    noOptional: options.optional === false,
    mode,
    interactive: isInteractiveTty(),
    yes: Boolean(options.yes),
  })
  if (plan.error) {
    console.error(`⚠️ --skills 全部取值非法：${plan.invalid.join("、")}`)
    process.exitCode = 1
    return null
  }
  if (plan.invalid.length > 0) console.warn(`⚠️ 忽略不存在的技能：${plan.invalid.join("、")}`)
  if (plan.savedInvalid.length > 0) console.warn(`⚠️ 已保存的技能选择含不存在的技能：${plan.savedInvalid.join("、")}（已忽略）`)
  // requires 依赖自动补全：显式选择 php / java 时自动带上 svc
  const expand = (names: string[]): string[] => {
    const result = expandSkillRequires(skills, names)
    if (result.missing.length > 0) console.warn(`⚠️ 忽略缺失的依赖技能：${result.missing.join("、")}`)
    return result.names
  }
  if (!plan.needsPrompt) return { names: expand(plan.names), mode, saveSelection: true }
  const picked = await promptSkillSelection(skills, saved, mode)
  if (picked === null) {
    console.error("已取消技能选择，未写入任何文件")
    process.exitCode = 130
    return null
  }
  return { names: expand(picked), mode, saveSelection: true }
}

// 解析 --agent 取值：已知目标名与未知项分开；全部非法由调用方报错退出
function parseExplicitAgents(value: string | undefined): { names?: string[]; invalid: string[] } {
  if (value === undefined) return { invalid: [] }
  const raw = splitMulti(value) ?? []
  const known = new Set(resolveSkillTargets().filter((target) => target.name).map((target) => target.name))
  return { names: raw.filter((name) => known.has(name)), invalid: raw.filter((name) => !known.has(name)) }
}

// 全局目标选择：--all-agents / --agent 优先；TTY 交互多选；非交互返回 undefined 交由 install 读取保存选择
async function chooseGlobalTargets(options: { agent?: string; allAgents?: boolean; yes?: boolean; dir: string[] }): Promise<string[] | undefined | null> {
  if (options.allAgents) {
    if (options.agent !== undefined) console.warn("⚠️ 同时传入 --agent 与 --all-agents，已按 --all-agents 执行")
    return availableTargetNames()
  }
  if (options.agent !== undefined) {
    const parsed = parseExplicitAgents(options.agent)
    if (parsed.invalid.length > 0) console.warn(`⚠️ 忽略未知的 agent / 目标名：${parsed.invalid.join("、")}`)
    if (!parsed.names || parsed.names.length === 0) {
      console.error("⚠️ --agent 全部取值非法，未执行安装")
      process.exitCode = 1
      return null
    }
    return parsed.names
  }
  if (!isInteractiveTty() || options.yes) return undefined
  const all = resolveSkillTargets()
  const choices = buildGlobalTargetChoices(all, readSkillsInstallConfig().targets, options.dir)
  const selectable = choices.filter((choice) => !choice.disabled)
  // 只有一个可用目标时无需选择
  if (selectable.length <= 1) return selectable.map((choice) => choice.value)
  const picked = await promptTargetSelection(choices, "选择要写入技能的目标（空格切换，回车确认）")
  if (picked === null) {
    console.error("已取消目标选择，未写入任何文件")
    process.exitCode = 130
    return null
  }
  const known = new Set(all.filter((target) => target.name).map((target) => target.name))
  return picked.filter((value) => known.has(value))
}

// 项目目标选择：TTY 交互多选已存在候选目录；非交互返回 undefined 交由 install 读取保存选择
async function chooseProjectTargets(options: { dir: string[]; yes?: boolean }): Promise<string[] | undefined | null> {
  if (!isInteractiveTty() || options.yes) return undefined
  const targets = resolveProjectTargets()
  const choices = buildProjectTargetChoices(targets.shellDirs, readProjectSkillsConfig().targets, options.dir, targets.missingDirs)
  const selectable = choices.filter((choice) => !choice.disabled)
  // 只有一个可用目录时无需选择
  if (selectable.length <= 1) return selectable.map((choice) => choice.value)
  const picked = await promptTargetSelection(choices, "选择要写入的项目技能目录（空格切换，回车确认）")
  if (picked === null) {
    console.error("已取消目录选择，未写入任何文件")
    process.exitCode = 130
    return null
  }
  return picked.filter((value) => targets.shellDirs.includes(value))
}

// 全局目标回显：名字映射为显示名，未显式选择时说明回落口径
function globalTargetSummary(names: string[] | undefined): string {
  if (!names) return "按已保存选择 / 全部可用目标"
  const labelBy = new Map(resolveSkillTargets().map((target) => [target.name, target.label]))
  return names.map((name) => labelBy.get(name) ?? name).join("、") || "无"
}

// JSON 输出统一出口：技能域与任务统计域共用，序列化口径见 toJsonText
function printJson(payload: object): void {
  console.log(toJsonText(payload))
}

// 技能标签：名称 + 真源声明版本（未声明版本时只显示名称）
function skillLabel(name: string, version: string): string {
  return version ? `${name}@${version}` : name
}

// 技能版本行：真源不可读时的登记值显式标注，避免冒充当期版本（status / 项目面共用）
function skillVersionLine(report: { skills: string[]; skillVersions: Record<string, string>; skillVersionsFromState: string[] }): string {
  const stateOnly = new Set(report.skillVersionsFromState)
  return report.skills.map((name) => `${skillLabel(name, report.skillVersions[name] ?? "")}${stateOnly.has(name) ? "（登记值）" : ""}`).join("、") || "无"
}

// 打印安装报告：按目标分组列出新建/更新/跳过/降级/失败，并给出未纳入目标的处理入口
function printInstallReport(report: InstallReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  console.log(`${tag}技能源：${report.source}`)
  console.log(`${tag}本次选择（${report.selection.length}）：${report.selection.map((name) => skillLabel(name, report.versions[name] ?? "")).join("、") || "无"}`)
  console.log(`${tag}本次目标（${report.targetSelection.length}）：${report.targetSelection.join("、") || "无"}`)
  for (const t of report.targets) {
    console.log("")
    console.log(`${t.label}：${t.dir}`)
    if (t.created.length > 0) console.log(`  新建：${t.created.join("、")}`)
    if (t.updated.length > 0) console.log(`  重建/更新：${t.updated.join("、")}`)
    if (t.skipped.length > 0) console.log(`  跳过（已就绪）：${t.skipped.join("、")}`)
    if (t.conflicts.length > 0) console.log(`  跳过（同名非本包产物，如需覆盖加 --force）：${t.conflicts.join("、")}`)
    if (t.pruned.length > 0) console.log(`  清理（未选择）：${t.pruned.join("、")}`)
    for (const m of t.migrated) console.log(`  ${tag}已改名迁移：${m.from} → ${m.to}`)
    for (const d of t.degraded) console.log(`  ⚠️ 降级为副本：${d.name}（链接创建失败：${d.reason}）`)
    for (const f of t.failed) console.log(`  ⚠️ 失败：${f.name}（${f.reason}）`)
    const modes: string[] = []
    if (t.links.length > 0) modes.push(`软链 ${t.links.length} 个`)
    if (t.copies.length > 0) modes.push(`副本 ${t.copies.length} 个`)
    if (modes.length > 0) console.log(`  产物形态：${modes.join(" / ")}`)
  }
  console.log("")
  if (report.transitions.length > 0) {
    console.log(`${tag}版本变化：${report.transitions.map((item) => `${item.name} ${item.from} → ${item.to}`).join("、")}`)
  }
  if (report.missingVersions.length > 0) {
    console.log(`${tag}提示：技能 ${report.missingVersions.join("、")} 未声明 metadata.version，不参与版本更新提示`)
  }
  if (report.skippedTargets.length > 0) {
    console.log(
      `本机未检测到的 agent ${report.skippedTargets.length} 个已跳过（不凭空创建目录）；如需装到未识别的 agent：toolkit skills install --dir <其全局技能目录>`,
    )
  }
  console.log(`${tag}状态文件：${report.stateFile}`)
  if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
}

// 打印现场状态：先列技能真源版本基准，再逐目标报状态——健康目标折叠为一行，仅异常目标逐条展开，末尾汇总
// 多 agent 机器上目标数可达十余个，逐技能刷「软链正常」会把真正的问题淹没在噪音里
function printStatusReport(report: SkillsStatusReport): void {
  console.log(`技能源：${report.source}`)
  console.log(`技能版本：${skillVersionLine(report)}`)
  console.log(`选择集（${report.selection.length}）：${report.selection.join("、") || "无"}`)
  // 来源内存在但未选择的技能：改名 / 新增后不再静默不可见；零选择时不刷全量清单
  const unselectedSkills = report.selection.length > 0 ? findUnselectedSkills(report) : []
  for (const item of unselectedSkills) {
    console.log(`来源 ${item.source} 内未选择（不在选择集，也不计入问题）：${item.names.join("、")}`)
  }
  console.log(`目标选择集：${report.targetSelection.length > 0 ? report.targetSelection.join("、") : "全部可用目标（未保存过目标选择）"}`)
  // 软告警：真源内版本双写位（frontmatter / 正文）不一致，提示按规则同步递增
  for (const m of report.versionMismatches) {
    console.warn(`⚠️ 技能版本双写位不一致：${m.name}（frontmatter ${m.frontmatter} / 正文 ${m.body || "未声明"}）`)
  }
  console.log(`状态文件：${report.stateFile}${report.stateExists ? "" : "（未记录，尚未执行过 toolkit skills install）"}`)
  let problems = 0
  let unselectedCount = 0
  // 来源已无此名的旧名残留：install 无法补齐，汇总时给出含实际名字的可复制命令
  let staleNameCount = 0
  const staleNames = new Set<string>()
  for (const t of report.targets) {
    const head = `${t.label}：${t.dir}${t.dirExists ? "" : "（目录未创建）"}${t.selected ? "" : "（未选择）"}`
    const bad = t.items.filter((item) => SKILL_PROBLEM_STATES.includes(item.state))
    const unselected = t.items.filter((item) => item.state === "installed-unselected")
    problems += bad.length
    unselectedCount += unselected.length
    for (const item of bad) if (item.source === "") staleNames.add(item.name)
    staleNameCount += bad.filter((item) => item.source === "").length
    console.log("")
    // 健康目标折叠为一行：逐技能刷「软链正常」在目标多时纯属噪音（完整信息另见 --format json）
    if (bad.length === 0 && unselected.length === 0) {
      console.log(`${head}　${t.items.length} 项正常`)
      continue
    }
    console.log(head)
    for (const item of bad) {
      // 真源已无此名（来源改名的旧名）：install 无法补齐，只能按名字显式卸载，避免把用户引到死路
      const hint = item.source === "" ? `（来源中已无此技能，用 toolkit skills uninstall --skills ${item.name} 清理）` : ""
      console.log(`  ${item.name}：${SKILL_STATE_LABEL[item.state]}${hint}`)
    }
    for (const item of unselected) console.log(`  ${item.name}：未选择但已安装（保留不影响使用，需要清理时加 --prune 重跑 install）`)
    const ok = t.items.length - bad.length - unselected.length
    if (ok > 0) console.log(`  其余 ${ok} 项正常`)
  }
  if (report.pendingAgents.length > 0) {
    console.log("")
    console.log(`未安装的 agent ${report.pendingAgents.length} 个未纳入分发（需要时用 toolkit skills install --dir <路径> 指定）`)
  }
  // 共读 agent 与主目标同路径，写入目标列表里看不到；单列说明，避免用户误判为不支持
  if (report.canonicalReaders.length > 0) {
    console.log("")
    console.log(
      `经 canonical 共读的 agent ${report.canonicalReaders.length} 个：${report.canonicalReaders.map((a) => a.label).join("、")}（读取主目标，无需单独写入）`,
    )
  }
  // 历史落点残留：升级前分发到旧目录的产物与登记仍在本机，只提示不自动删除，避免误删用户仍在用的旧目录
  if (report.legacyTargets.length > 0) {
    console.log("")
    console.warn(`⚠️ 历史落点残留 ${report.legacyTargets.length} 处：${report.legacyTargets.map((t) => `${t.label}（${t.dir}）`).join("、")}`)
    console.log("   已不再随本包更新；不需要时先 toolkit skills uninstall 清理全部本包登记产物，再 toolkit skills install 重新安装")
  }
  // 未登记的疑似残留：来源改名后旧登记可能已丢失，按指向技能源缓存 / 本包目录的链接兜底呈现；只提示不删除
  const staleArtifacts = findStaleArtifacts(report)
  if (staleArtifacts.length > 0) {
    console.log("")
    console.warn(`⚠️ 疑似残留 ${staleArtifacts.length} 项（未登记，仅提示）：${staleArtifacts.map((item) => `${item.name}（${item.dir}）`).join("、")}`)
    // 指引直接给出含实际名字的完整命令，避免用户手填占位符
    const staleNames = [...new Set(staleArtifacts.map((item) => item.name))].join(",")
    console.log(`   确认不再需要时执行：toolkit skills uninstall --scope global --skills ${staleNames}`)
    console.log("   实跑前可加 --dry-run 预演")
  }
  console.log("")
  console.log(
    problems > 0
      ? `共 ${problems} 处需处理：缺失 / 悬空 / 指向其他版本 / 副本漂移用 toolkit skills install 补齐，同名冲突用 toolkit skills install --force 覆盖`
      : "所有已纳入的目标均正常",
  )
  if (staleNameCount > 0) {
    console.log(`其中 ${staleNameCount} 项为来源已无此名的旧名残留：install 无法补齐，执行 toolkit skills uninstall --scope global --skills ${[...staleNames].join(",")} 清理`)
  }
  if (unselectedCount > 0) {
    console.log(`未选择但已安装 ${unselectedCount} 项：保留不影响使用，需要清理时运行 toolkit skills install --prune`)
  }
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

// 疑似残留名字（去重）：全量卸载与裸命令预演共用
function staleArtifactNames(): string[] {
  return [...new Set(findStaleArtifacts(skillsStatus()).map((item) => item.name))]
}

// 已登记条目数：全量卸载的确认文案展示范围（同一技能可在多个目标各有一条）
function registeredSkillCount(runGlobal: boolean, runProject: boolean): number {
  const countOf = (state: ReturnType<typeof readSkillsState>): number =>
    Object.values(state?.sources ?? {}).reduce((sum, source) => sum + source.targets.reduce((n, target) => n + target.entries.length, 0), 0)
  let count = 0
  if (runGlobal) count += countOf(readSkillsState())
  if (runProject) count += countOf(readProjectState(resolveProjectTargets().root))
  return count
}

// 卸载候选：按面与类型分组，value 前缀区分，避免跨面同名混淆
function collectUninstallCandidates(runGlobal: boolean, runProject: boolean): UninstallChoice[] {
  const out: UninstallChoice[] = []
  const pushRegistered = (state: ReturnType<typeof readSkillsState>, prefix: string, group: string): void => {
    const names = new Set<string>()
    for (const source of Object.values(state?.sources ?? {})) {
      for (const target of source.targets) for (const entry of target.entries) names.add(entry.name)
    }
    for (const name of [...names].sort()) out.push({ value: `${prefix}${name}`, group, label: name })
  }
  if (runGlobal) {
    pushRegistered(readSkillsState(), "g:", "全局")
    for (const name of staleArtifactNames().sort()) out.push({ value: `s:${name}`, group: "疑似残留", label: name })
  }
  if (runProject) pushRegistered(readProjectState(resolveProjectTargets().root), "p:", "项目")
  return out
}

// 合并两次卸载报告：同一目录合并条目，状态标记取并集
function mergeRemoveReports(primary: SkillsRemoveReport | null, extra: SkillsRemoveReport | null): SkillsRemoveReport | null {
  if (!primary) return extra
  if (!extra) return primary
  const targets = primary.targets.map((target) => ({
    ...target,
    removed: [...target.removed],
    missing: [...target.missing],
    skippedForeign: [...target.skippedForeign],
  }))
  for (const target of extra.targets) {
    const found = targets.find((item) => item.dir === target.dir)
    if (!found) {
      targets.push(target)
      continue
    }
    found.removed.push(...target.removed)
    found.missing.push(...target.missing)
    found.skippedForeign.push(...target.skippedForeign)
    found.dirReclaimed = found.dirReclaimed || target.dirReclaimed
  }
  return {
    stateFile: primary.stateFile,
    stateExists: primary.stateExists || extra.stateExists,
    targets,
    stateRemoved: primary.stateRemoved || extra.stateRemoved,
  }
}

// 项目面现场状态的中文文案（项目侧重：真源副本漂移与薄壳过时，无软链相关状态）
const PROJECT_STATE_LABEL: Record<ProjectItemState, string> = {
  ready: "已就绪",
  drift: "已漂移（与真源 / 期望不一致）",
  conflict: "同名冲突（非本包产物）",
  missing: "缺失",
  "not-selected": "未选择",
  "installed-unselected": "未选择但已安装",
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
  if (result.pruned.length > 0) console.log(`${pad}清理（未选择）：${result.pruned.join("、")}`)
  for (const f of result.failed) console.log(`${pad}⚠️ 失败：${f.name}（${f.reason}）`)
}

// 打印项目面安装报告：真源目录与各薄壳目录逐项列出动作，并给出未命中目录的补齐入口
function printProjectInstallReport(report: ProjectInstallReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  const versionByName = new Map(listPackageSkills().map((s) => [s.name, s.version]))
  console.log(`${tag}项目面 · 项目根：${report.root}`)
  console.log(`${tag}项目面 · 本次选择（${report.selection.length}）：${report.selection.map((name) => skillLabel(name, versionByName.get(name) ?? "")).join("、") || "无"}`)
  console.log(`${tag}项目面 · 本次目录（${report.targetSelection.length}）：${report.targetSelection.join("、") || "无"}`)
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
  console.log(`项目面 · 技能版本：${skillVersionLine(report)}`)
  console.log(`项目面 · 选择集（${report.selection.length}）：${report.selection.join("、") || "无"}`)
  // 与全局面同口径：来源内存在但未选择的技能给出汇总，零选择时不刷清单
  const unselectedProjectSkills = report.selection.length > 0 ? findUnselectedSkills(report) : []
  for (const item of unselectedProjectSkills) {
    console.log(`来源 ${item.source} 内未选择（不在选择集，也不计入问题）：${item.names.join("、")}`)
  }
  console.log(`项目面 · 目录选择集：${report.targetSelection.length > 0 ? report.targetSelection.join("、") : "全部已存在候选目录（未保存过目录选择）"}`)
  for (const m of report.versionMismatches) {
    console.warn(`⚠️ 技能版本双写位不一致：${m.name}（frontmatter ${m.frontmatter} / 正文 ${m.body || "未声明"}）`)
  }
  console.log(`项目面 · 状态文件：${report.stateFile}${report.stateExists ? "" : "（未记录，尚未执行过 toolkit init / skills install）"}`)
  // 项目面曾用名视图：旧名副本无从校验、不自动删，但要让用户看清「这是旧名、该删哪个」
  const renamed = findProjectRenamedArtifacts(report)
  let problems = 0
  let unselectedCount = 0
  for (const d of report.dirs) {
    const bad = d.items.filter((item) => PROJECT_PROBLEM_STATES.includes(item.state))
    const unselected = d.items.filter((item) => item.state === "installed-unselected")
    problems += bad.length
    unselectedCount += unselected.length
    const head = `${d.kind === "source" ? "真源副本" : "薄壳"}：${d.dir}${d.selected ? "" : "（未选择）"}`
    console.log("")
    // 健康目录折叠为一行，避免目标多时把真正的问题淹没在噪音里（完整信息另见 --format json）
    if (bad.length === 0 && unselected.length === 0) {
      console.log(`${head}　${d.items.length} 项正常`)
      continue
    }
    console.log(head)
    for (const item of bad) {
      const target = renamed[item.name]
      const hint = target ? `（已改名为 ${target}，确认后手工删除旧副本）` : ""
      console.log(`  ${item.name}：${PROJECT_STATE_LABEL[item.state]}${hint}`)
    }
    for (const item of unselected) console.log(`  ${item.name}：未选择但已安装（保留不影响使用，需要清理时加 --prune 重跑 install）`)
    const ok = d.items.length - bad.length - unselected.length
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
  if (unselectedCount > 0) {
    console.log(`项目面未选择但已安装 ${unselectedCount} 项：保留不影响使用，需要清理时运行 toolkit skills install --scope project --prune`)
  }
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

// registry 来源中文映射：文本模式不展示英文枚举
const REGISTRY_SOURCE_LABEL: Record<RegistryInfo["source"], string> = {
  config: "配置",
  npm_config_registry: "环境变量",
  "npmrc-project": "项目 .npmrc",
  "npmrc-home": "家目录 .npmrc",
  default: "默认",
}

// registry 文本展示：只显示主机，避免内网地址路径进入共享截图
function registryLabel(registry: RegistryInfo): string {
  let host = registry.value
  try {
    host = new URL(registry.value).host
  } catch {
    // 非法地址原样展示，来源仍可见
  }
  return `${host}（来源：${REGISTRY_SOURCE_LABEL[registry.source]}）`
}

// 版本检查块：CLI 当前 / 最新、registry 来源、通道频率与技能更新
function printVersionStatus(info: {
  cliVersion: string
  latest: string | null
  registry: RegistryInfo
  enabled: boolean
  channels: { cli: string; builtinSkills: string; externalSkills: string }
  updates: SkillVersionReport
  sources: Array<{ name: string; version: string; temporary: boolean; notify: string }>
  timing: { checkedAt: number | null; nextHintAt: number | null }
}): void {
  const latestLabel = !info.enabled
    ? "最新版本未知（版本检查已关闭）"
    : info.latest === null
      ? "最新版本未知"
      : versionGt(info.latest, info.cliVersion)
        ? `最新 ${info.latest}（可升级）`
        : "已是最新"
  console.log(`toolkit 版本：${info.cliVersion}（${latestLabel}）`)
  console.log(`registry：${registryLabel(info.registry)}`)
  console.log(`提示频率：cli ${info.channels.cli} / 内置 ${info.channels.builtinSkills} / 第三方 ${info.channels.externalSkills}`)
  const checkedLabel = info.timing.checkedAt === null ? "尚未检查" : new Date(info.timing.checkedAt).toLocaleString()
  const nextLabel =
    info.timing.nextHintAt === null ? "已关闭" : info.timing.nextHintAt === 0 ? "随时" : new Date(info.timing.nextHintAt).toLocaleString()
  console.log(`检查时间：${checkedLabel}（下次可提示：${nextLabel}）`)
  const outdated = [...info.updates.builtin, ...info.updates.external].map((item) => item.name)
  if (outdated.length > 0) console.log(`技能更新：${outdated.join("、")}`)
  if (info.sources.length > 0) {
    const rows = info.sources.map((source) => `${source.name} ${source.version || "版本未知"}（${source.notify}${source.temporary ? "，临时" : ""}）`)
    console.log(`第三方来源：${rows.join("、")}`)
  }
}

// 打印状态报告（按作用域分派到对应面）
function printStatusReports(
  scope: { choice: ScopeChoice; explicit: boolean },
  glob: SkillsStatusReport | null,
  project: ProjectStatusReport | null,
  versionInfo: Parameters<typeof printVersionStatus>[0],
): void {
  printVersionStatus(versionInfo)
  console.log("")
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

// tasks 域公共选项：目录、脱敏、软告警与严格模式
interface TasksCommonOptions {
  dir?: string
  redact?: boolean
  warn?: boolean
  strict?: boolean
}

// 任务查询选项：总览、统计与导出共用
interface TasksQueryOptions extends TasksCommonOptions {
  view?: string
  owner?: string
  scope?: string
  status?: string
  date?: string
  since?: string
  until?: string
  format?: string
}

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
    `  快速开始 ${INIT_LINKS.gettingStarted}`,
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
  // 发布型包误打包提醒独立于产物列表：判据与 prepare 钩子是否写入无关（风险不是一种产物动作）
  if (report.publishRiskHint) console.log(`提示：${report.publishRiskHint}`)
  console.log("")
  console.log("下一步：")
  // 规范触达第一层是全局技能（不依赖项目内任何文件）；未安装时补一行安装指引，已装不重复打扰
  if (!report.skillsInstalled) {
    console.log("  全局技能：未安装，执行 toolkit skills install 启用（规范触达第一层，不依赖项目内文件；toolkit skills status 可查现场）")
  }
  console.log(`  快速开始：${INIT_LINKS.gettingStarted}`)
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
  .description("AI 技能包分发：安装 / 状态 / 卸载 / 来源 / 路径（包内 skills/ 与 --from 外部来源统一管理）")

// 安装：默认软链真源，链接创建失败自动降级副本；只写入「已安装」的 agent 目录，不凭空造目录
skillsCmd
  .command("install")
  .description("安装技能（默认按现场判定作用域：仓库内写项目面副本 + 薄壳，否则写全局目录；包内 skills/ 与 --from 外部来源统一处理）")
  .option("--scope <scope>", "作用域（project 项目面 / global 全局面 / all 两者；缺省按现场自动判定）")
  .option("--skills <names>", "只安装指定技能（逗号分隔；core 技能恒装）")
  .option("--all", "安装包内全部技能（含可选技能）")
  .option("--no-optional", "只安装 core 技能（不含可选技能）")
  .option("--from <path|url>", "外部技能来源目录或 Git 地址（可重复；默认临时，只写本次）", collectDir, [])
  .option("--save [name]", "把 --from 来源登记为永久来源（可选来源名，缺省按目录 / 清单派生）")
  .option("--agent <names>", "只写入指定 agent（逗号分隔，含 canonical；本机未检测到的跳过）")
  .option("--all-agents", "写入全部已检测的 agent")
  .option("--no-save-agents", "目标选择只对本次生效，不写回配置")
  .option("--yes", "非交互执行：跳过选择与确认，采用已保存选择（首次只装 core 与全部可用目标）")
  .option("--use-saved", "技能与目标采用已保存选择，不进入选择交互（仍保留最终确认）")
  .option("--copy", "强制以副本形式写入（仅全局面生效；项目面真源恒为副本、其余目录恒为薄壳）")
  .option("--dir <path>", "额外目标目录（可多次指定，兜底内置表未收录的 agent；不参与后续自动同步，技能变化后需带相同 --dir 重跑）", collectDir, [])
  .option("--dry-run", "预演（只预览将要执行的动作，不写文件）")
  .option("--force", "覆盖同名非本包产物（默认跳过，避免破坏用户自装技能；不改本包已登记副本的形态）")
  .option("--prune", "清理未选择且内容与本包真源一致的旧产物（只清本包登记条目）")
  .option("--mode <mode>", "技能安装模式：skills（core 必装）/ package（纯包管理器，允许零选）")
  .option("--no-skills", "本次不安装任何技能，不改模式与已保存选择")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action(async (options: { scope?: string; skills?: string; all?: boolean; optional?: boolean; from: string[]; save?: string | boolean; agent?: string; allAgents?: boolean; saveAgents?: boolean; yes?: boolean; useSaved?: boolean; copy?: boolean; dir: string[]; dryRun?: boolean; force?: boolean; prune?: boolean; mode?: string; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const scope = resolveScopeChoice(options.scope)
      if (!scope) return
      const dryRun = Boolean(options.dryRun)
      // --no-skills 用 argv 判定：commander 的 --no- 前缀默认值会与 --skills 的字符串属性冲突
      const noSkills = process.argv.includes("--no-skills")
      if (options.mode !== undefined && options.mode !== "skills" && options.mode !== "package") {
        console.error("⚠️ --mode 取值须为 skills 或 package，未执行安装")
        process.exitCode = 1
        return
      }
      if (options.mode !== undefined && noSkills) {
        console.error("⚠️ --mode 与 --no-skills 不能同时使用，未执行安装")
        process.exitCode = 1
        return
      }
      if (noSkills && (typeof options.skills === "string" || options.all || options.optional === false)) {
        console.error("⚠️ --no-skills 与 --skills / --all / --no-optional 不能同时使用，未执行安装")
        process.exitCode = 1
        return
      }
      const runProject = scope.choice !== "global"
      const runGlobal = scope.choice !== "project"
      // JSON 消费方通常非 TTY；即使 TTY 也不弹窗，避免提示污染 stdout 的机器可读输出
      const nonInteractive = Boolean(options.yes) || options.format === "json"
      // 选择阶段的非交互：--yes 或 --use-saved 都跳过选择提示；--use-saved 仍保留最终确认
      const selectionNonInteractive = nonInteractive || Boolean(options.useSaved)

      const fromPaths = options.from ?? []
      if (options.save !== undefined && fromPaths.length !== 1) {
        console.error("⚠️ --save 只能与单个 --from 搭配使用，未执行安装")
        process.exitCode = 1
        return
      }
      const externalSources = fromPaths.map((path, index) => ({
        path,
        name: index === 0 && typeof options.save === "string" ? options.save : undefined,
        temporary: !(index === 0 && options.save !== undefined),
      }))
      let items: SkillItem[]
      try {
        items = collectSkillItems({ externalSources, dryRun })
      } catch (e) {
        console.error(`⚠️ 技能来源解析失败：${(e as Error).message}`)
        process.exitCode = 1
        return
      }
      // scope=all 时两面共用一次技能选择：以全局面已保存选择为基准，避免连弹两次交互
      const selectionResult = await resolveSkillSelection(
        { ...options, skills: noSkills ? undefined : options.skills, noSkills, yes: selectionNonInteractive },
        scope.choice === "project" ? "project" : "global",
        items,
      )
      if (!selectionResult) return
      const selection = selectionResult.names
      // 模式切换在技能选择解析后、安装前持久化；--dry-run 不写
      if (options.mode !== undefined && !dryRun) {
        const mode = options.mode as SkillsMode
        if (scope.choice === "global" || scope.choice === "all") writeSkillsInstallConfig({ mode })
        if (scope.choice === "project" || scope.choice === "all") writeProjectSkillsConfig({ mode })
      }

      let globalTargets: string[] | undefined
      let projectTargets: string[] | undefined
      if (runGlobal) {
        const chosen = await chooseGlobalTargets({ agent: options.agent, allAgents: options.allAgents, yes: selectionNonInteractive, dir: options.dir })
        if (chosen === null) return
        globalTargets = chosen
      }
      if (runProject) {
        if (options.agent !== undefined || options.allAgents) console.warn("⚠️ --agent / --all-agents 仅作用于全局面，项目面按项目目录选择执行")
        const chosen = await chooseProjectTargets({ dir: options.dir, yes: selectionNonInteractive })
        if (chosen === null) return
        projectTargets = chosen
      }

      // 汇总确认：交互模式下确认前不写任何文件
      if (!nonInteractive && isInteractiveTty()) {
        console.log("")
        console.log("即将安装：")
        console.log(`  技能：${selection.join("、") || "无"}`)
        if (externalSources.length > 0) console.log(`  外部来源：${externalSources.map((source) => source.path).join("、")}`)
        if (runGlobal) console.log(`  全局目标：${globalTargetSummary(globalTargets)}`)
        if (runProject) console.log(`  项目目录：${projectTargets ? projectTargets.join("、") : "按已保存选择 / 全部已存在候选目录"}`)
        const ok = await promptConfirm("确认执行安装？")
        if (ok === null) {
          console.error("已取消安装，未写入任何文件")
          process.exitCode = 130
          return
        }
        if (!ok) {
          console.log("已取消安装，未写入任何文件")
          return
        }
      }

      if (runProject && options.copy) console.warn("⚠️ 项目面不支持 --copy（真源恒为副本、各候选目录恒为薄壳），已忽略该项目面取值")
      const saveTargets = options.saveAgents === false ? false : undefined
      const project = runProject
        ? installProjectSkills({
            dirs: options.dir,
            dryRun,
            force: options.force,
            skills: selection,
            targetDirs: projectTargets,
            saveTargets,
            prune: Boolean(options.prune),
            externalSources,
            saveSelection: selectionResult.saveSelection,
            mode: selectionResult.mode,
          })
        : null
      const global = runGlobal
        ? installSkills({
            copy: options.copy,
            dirs: options.dir,
            dryRun,
            force: options.force,
            skills: selection,
            targets: globalTargets,
            saveTargets,
            prune: Boolean(options.prune),
            externalSources,
            saveSelection: selectionResult.saveSelection,
            mode: selectionResult.mode,
          })
        : null
      if (selection.length === 0) {
        console.log(selectionResult.mode === "package" ? "纯包管理器模式：本次未安装任何技能" : "未选择任何技能")
      }
      // 写入顺序：产物 → 状态 → 配置；--save 在安装成功后才登记，登记失败不回滚产物
      if (!dryRun && options.save !== undefined && externalSources.length === 1) {
        try {
          const source = resolveSource(externalSources[0]!.path, {
            name: typeof options.save === "string" ? options.save : undefined,
            temporary: false,
          })
          const config = readSkillsInstallConfig()
          // 远程来源只记地址与 ref，不把本机缓存路径写进配置
          const entry = source.url ? { url: source.url, ref: source.ref } : { root: source.root }
          writeSkillsInstallConfig({ sources: { ...(config.sources ?? {}), [source.name]: entry } })
        } catch (e) {
          console.warn(`⚠️ 外部来源登记失败：${(e as Error).message}`)
        }
      }
      // 已尝试修复即收敛：安装后仍未解决的条目记入 dismissed，同一版本不再重复提示
      // 写入必须早于命令收尾的提示计算，保证本次 install 结束后当条命令就不再提示
      if (!dryRun) {
        const remaining = collectSkillVersionUpdates()
        const remainingAlerts: SkillAlert[] = [
          ...remaining.builtin.map((item) => ({ channel: "builtin" as const, name: item.name, current: item.installed, latest: item.latest })),
          ...remaining.external.map((item) => ({
            channel: "external" as const,
            source: item.source,
            name: item.name,
            current: item.installed,
            latest: item.latest,
          })),
        ]
        dismissSkillAlerts(remainingAlerts, version)
      }
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
      const latest = readCachedLatest()
      const registry = resolveRegistry()
      const enabled = isUpdateCheckEnabled()
      const channels = {
        cli: { notify: resolveNotify("cli") },
        builtinSkills: { notify: resolveBuiltinNotifyLabel() },
        externalSkills: { notify: resolveNotify("external") },
      }
      const updates = collectSkillVersionUpdates()
      const sourceRows =
        scope.choice === "project"
          ? []
          : updates.sources.filter((source) => source.name !== BUILTIN_SOURCE).map((source) => ({
              ...source,
              notify: resolveNotify("external", source.name),
              notifySource: resolveNotifySource("external", source.name),
            }))
      // 提示时间可见化：数字为 epoch 毫秒；nextHintAt 为 "now" 表示随时、null 表示已关闭
      const timing = readHintTiming()
      const versionStatus = {
        cliVersion: version,
        latestVersion: latest,
        updateAvailable: latest !== null && versionGt(latest, version),
        registry,
        channels,
        sources: sourceRows,
        checkedAt: timing.checkedAt === null ? null : new Date(timing.checkedAt).toISOString(),
        nextHintAt: timing.nextHintAt === null ? null : timing.nextHintAt === 0 ? "now" : new Date(timing.nextHintAt).toISOString(),
      }
      if (options.format === "json") {
        const withUpdates = <T extends object>(report: T | null) =>
          report ? { ...report, skillsOutdated: updates.builtin.map((item) => item.name) } : null
        printJson({ scope: scope.choice, versionStatus, global: withUpdates(global), project: withUpdates(project) })
      } else {
        printStatusReports(scope, global, project, {
          cliVersion: version,
          latest,
          registry,
          enabled,
          channels: {
            cli: channels.cli.notify,
            builtinSkills: channels.builtinSkills.notify,
            externalSkills: channels.externalSkills.notify,
          },
          updates,
          sources: sourceRows,
          timing,
        })
      }
    } catch (e) {
      console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 卸载：只清理状态文件记载的本包产物，绝不触碰用户自装技能或其他方式安装的技能
skillsCmd
  .command("uninstall")
  .description("卸载由本包安装的技能产物（默认按现场判定作用域；只清理归属账记载的条目，不碰用户自装技能）")
  .option("--scope <scope>", "作用域（project 项目面 / global 全局面 / all 两者；缺省按现场自动判定）")
  .option("--skills <names>", "只卸载指定技能的选择与产物（逗号分隔）")
  .option("--all", "卸载全部已登记技能与疑似残留（非交互执行须加 --yes）")
  .option("--yes", "配合 --all：非交互环境确认执行")
  .option("--source <name>", "只清理指定外部来源的登记与产物（仅全局面）")
  .option("--dry-run", "预演（按全量预览将要移除的条目，不删文件）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action(async (options: { scope?: string; skills?: string; all?: boolean; yes?: boolean; source?: string; dryRun?: boolean; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const scope = resolveScopeChoice(options.scope)
      if (!scope) return
      // 显式传了 --skills 但取值为空时按非法处理，不静默当作清理全部
      const names = options.skills !== undefined ? (splitMulti(options.skills) ?? []) : undefined
      if (names && names.length === 0) {
        console.error("⚠️ --skills 取值为空，未执行卸载")
        process.exitCode = 1
        return
      }
      if (options.all && names !== undefined) {
        console.error("⚠️ --skills 与 --all 互斥，未执行卸载")
        process.exitCode = 1
        return
      }
      if (options.yes && !options.all) console.warn("⚠️ --yes 仅配合 --all 使用，已忽略")
      if (options.source !== undefined && scope.choice !== "global") console.warn("⚠️ --source 仅作用于全局面；项目面按全部来源清理")
      const dryRun = Boolean(options.dryRun)
      const runProject = scope.choice !== "global"
      const runGlobal = scope.choice !== "project"
      // --format json 视为非交互：交互 UI 不写入 stdout，避免污染机器可读输出
      const interactive = isInteractiveTty() && options.format !== "json"
      let globalNames: string[] | undefined = names
      let projectNames: string[] | undefined = names
      // 全量口径：显式 --all，或裸命令预演（预演不删除，沿用原预览行为）
      const allScope = names === undefined && (Boolean(options.all) || dryRun)
      let staleNames: string[] = []
      if (names === undefined) {
        if (!allScope) {
          // 裸命令：交互多选；非交互报错给用法，不再默认全删
          if (!interactive) {
            console.error("⚠️ 未指定要卸载的技能：精确卸载用 --skills a,b，全量卸载用 --all（非交互须加 --yes）")
            process.exitCode = 1
            return
          }
          const candidates = collectUninstallCandidates(runGlobal, runProject)
          if (candidates.length === 0) {
            console.log("没有可卸载的技能")
            return
          }
          const picked = await promptUninstallSelection(candidates)
          if (picked === null) {
            console.error("已取消，未执行任何清理")
            process.exitCode = 130
            return
          }
          if (picked.length === 0) {
            console.log("未选择任何技能，未执行卸载")
            return
          }
          globalNames = []
          projectNames = []
          for (const value of picked) {
            if (value.startsWith("s:")) staleNames.push(value.slice(2))
            else if (value.startsWith("p:")) projectNames.push(value.slice(2))
            else globalNames.push(value.slice(2))
          }
        } else {
          if (runGlobal) staleNames = staleArtifactNames()
          // --all 实跑需确认（默认否）；预演不询问
          if (!dryRun) {
            if (!interactive) {
              if (!options.yes) {
                console.error("⚠️ 非交互环境执行全量卸载需显式加 --yes，未执行卸载")
                process.exitCode = 1
                return
              }
            } else {
              const staleText = staleNames.length > 0 ? `，并清理疑似残留 ${staleNames.length} 项` : ""
              const answer = await promptConfirm(`将卸载已登记的 ${registeredSkillCount(runGlobal, runProject)} 项${staleText}，是否继续？`, false)
              if (answer === null) {
                console.error("已取消，未执行任何清理")
                process.exitCode = 130
                return
              }
              if (!answer) {
                console.log("已取消，未执行任何清理")
                return
              }
            }
          }
        }
      }
      // 先摘疑似残留：全量清理会删除状态文件，之后 orphan 清理无从定位目标目录
      const staleReport = staleNames.length > 0 ? removeSkills({ dryRun, skills: [...new Set(staleNames)] }) : null
      const runFullGlobal = runGlobal && (allScope || (globalNames?.length ?? 0) > 0)
      const runFullProject = runProject && (allScope || (projectNames?.length ?? 0) > 0)
      const project = runFullProject ? removeProjectSkills({ dryRun, skills: allScope ? undefined : projectNames }) : null
      const global = mergeRemoveReports(runFullGlobal ? removeSkills({ dryRun, skills: allScope ? undefined : globalNames, source: options.source }) : null, staleReport)
      // 显式点名的名字若在报告里完全未命中，说明未登记且产物无法确认归属：告警说明未删除，不静默成功
      if (names && names.length > 0) {
        const mentioned = new Set<string>()
        if (global?.stateExists) {
          for (const target of global.targets) for (const name of [...target.removed, ...target.missing, ...target.skippedForeign]) mentioned.add(name)
        }
        if (project?.stateExists) {
          for (const dir of project.dirs) for (const name of [...dir.removed, ...dir.missing, ...dir.skippedForeign]) mentioned.add(name)
        }
        const unmatched = [...new Set(names)].filter((name) => !mentioned.has(name))
        if (unmatched.length > 0) console.warn(`⚠️ 未找到可清理的产物：${unmatched.join("、")}（未登记或不符合本工具产物形态，未执行删除）`)
      }
      if (options.format === "json") printJson({ dryRun, scope: scope.choice, global, project })
      else printRemoveReports(scope, global, project, dryRun)
    } catch (e) {
      console.error(`⚠️ 卸载失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 技能版本递增：只改 skills/<name>/SKILL.md 的 frontmatter 与正文首部两处版本声明
skillsCmd
  .command("bump")
  .description("递增技能版本（两处版本声明同源改写；--all 批量、--set 直接设定）")
  .argument("[name]", "技能名；与 --all 二选一")
  .argument("[type]", "patch / minor / major（缺省 patch）")
  .option("--all", "批量递增 skills/ 下全部技能")
  .option("--set <version>", "直接设定版本（与递增类型互斥）")
  .option("--dry-run", "只打印变更，不写盘")
  .option("--yes", "批量递增 minor / major 时跳过确认")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action(async (name: string | undefined, type: string | undefined, options: { all?: boolean; set?: string; dryRun?: boolean; yes?: boolean; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      if (options.all && name) {
        console.error("⚠️ --all 与显式技能名不能同时使用")
        process.exitCode = 1
        return
      }
      if (!options.all && !name) {
        console.error("⚠️ 请指定技能名，或使用 --all 批量递增")
        process.exitCode = 1
        return
      }
      const kind = type ?? "patch"
      if (!["patch", "minor", "major"].includes(kind)) {
        console.error(`⚠️ 非法递增类型「${kind}」，仅支持 patch / minor / major`)
        process.exitCode = 1
        return
      }
      if (options.set && type) {
        console.error("⚠️ --set 与递增类型不能同时使用")
        process.exitCode = 1
        return
      }
      if (options.set && !isValidVersion(options.set)) {
        console.error(`⚠️ 非法版本号「${options.set}」，须为 x.y.z`)
        process.exitCode = 1
        return
      }
      // 批量抬 minor / major 影响面大：交互态先确认，非交互须显式 --yes
      if (options.all && !options.set && kind !== "patch" && !options.dryRun && options.yes !== true) {
        if (!process.stdin.isTTY) {
          console.error(`⚠️ 批量按 ${kind} 递增需显式 --yes（当前为非交互环境）`)
          process.exitCode = 1
          return
        }
        const confirmed = await promptConfirm(`将把全部技能按 ${kind} 递增，确认继续？`)
        if (confirmed !== true) {
          console.log("已取消，未写入任何文件")
          return
        }
      }
      const results = bumpSkillVersions({
        skillsDir: join(process.cwd(), "skills"),
        names: name ? [name] : undefined,
        all: options.all,
        type: kind as "patch" | "minor" | "major",
        set: options.set,
        dryRun: options.dryRun,
      })
      if (options.format === "json") printJson({ dryRun: Boolean(options.dryRun), skills: results })
      else for (const item of results) console.log(`${options.dryRun ? "[预演] " : ""}${item.name}：${item.from} → ${item.to}（${item.file}）`)
    } catch (e) {
      console.error(`⚠️ 递增失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 外部来源：列出已登记 / 状态中的来源；remove 注销登记，--prune 一并清理产物
const sourcesCmd = skillsCmd
  .command("sources")
  .description("查看 / 刷新 / 注销外部技能来源，并管理来源提示频率")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const config = readSkillsInstallConfig()
      const state = readSkillsState()
      const versionReport = collectSkillVersionUpdates()
      const versionByName = new Map(versionReport.sources.map((source) => [source.name, source.version]))
      const rows: Array<{ name: string; root: string; url?: string; ref?: string; temporary: boolean; registered: boolean; skills: string[]; version: string; notify: string }> = []
      for (const [name, entry] of Object.entries(config.sources ?? {})) {
        if (name === BUILTIN_SOURCE) continue
        const skills = state?.sources[name]?.targets.flatMap((target) => target.entries.map((item) => item.name)) ?? []
        rows.push({
          name,
          root: entry.root ?? "",
          url: entry.url,
          ref: entry.ref,
          temporary: false,
          registered: true,
          skills: [...new Set(skills)],
          version: versionByName.get(name) ?? "",
          notify: resolveNotify("external", name),
        })
      }
      for (const [name, source] of Object.entries(state?.sources ?? {})) {
        if (name === BUILTIN_SOURCE) continue
        if (rows.some((row) => row.name === name)) continue
        const skills = source.targets.flatMap((target) => target.entries.map((item) => item.name))
        rows.push({
          name,
          root: source.root,
          url: source.url,
          ref: source.ref,
          temporary: source.temporary,
          registered: false,
          skills: [...new Set(skills)],
          version: versionByName.get(name) ?? source.version,
          notify: resolveNotify("external", name),
        })
      }
      if (options.format === "json") {
        printJson({ sources: rows })
        return
      }
      if (rows.length === 0) {
        console.log("未登记外部来源")
        return
      }
      // 来源当前技能集：只读本地根 / 缓存，不触发远程刷新；解析失败时不标注（无从判断）
      const currentSkills = (row: { name: string; root: string; url?: string }): Set<string> | null => {
        const entry = config.sources?.[row.name]
        const location = row.url ? state?.sources?.[row.name]?.root : entry?.root ?? row.root
        if (!location) return null
        try {
          return new Set(resolveLocalSource(location, { name: row.name, temporary: false }).skills.map((skill) => skill.name))
        } catch {
          return null
        }
      }
      for (const row of rows) {
        const kind = row.name === BUILTIN_SOURCE ? "内置" : row.registered ? "已登记" : row.temporary ? "临时" : "状态登记"
        const current = currentSkills(row)
        const labeled = row.skills.map((name) => (current && !current.has(name) ? `${name}（已失效）` : name))
        const skills = labeled.length > 0 ? `　技能：${labeled.join("、")}` : ""
        const location = row.url ? `${row.url}${row.ref ? `#${row.ref}` : ""}` : row.root
        console.log(`${row.name}（${kind}）：${location || "（来源根缺失）"}　版本：${row.version || "未知"}　更新提示：${row.notify}${skills}`)
      }
    } catch (e) {
      console.error(`⚠️ 读取来源失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 来源提示频率：只写 updateCheck.sources.<name>.notify，不触碰其他配置
sourcesCmd
  .command("notify")
  .description("设置单个第三方来源的更新提示频率（只写 updateCheck.sources.<name>.notify）")
  .argument("<name>", "来源名")
  .requiredOption("--frequency <frequency>", "更新提示频率：always / daily / weekly / off")
  .option("--scope <scope>", "写入层：global（默认）/ project")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((name: string, options: { frequency: string; scope?: string; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const scope = options.scope ?? "global"
      if (scope !== "global" && scope !== "project") {
        console.error(`⚠️ 非法作用域「${scope}」，仅支持 global / project`)
        process.exitCode = 1
        return
      }
      const frequency = options.frequency
      if (!["always", "daily", "weekly", "off"].includes(frequency)) {
        console.error(`⚠️ 非法频率「${frequency}」，仅支持 always / daily / weekly / off`)
        process.exitCode = 1
        return
      }
      if (!readSkillsInstallConfig().sources?.[name]) {
        console.error(`⚠️ 未找到已登记来源：${name}（临时来源请先用 --save 登记）`)
        process.exitCode = 1
        return
      }
      const file = writeUpdateCheckSourceNotify(name, frequency as "always" | "daily" | "weekly" | "off", scope)
      if (options.format === "json") printJson({ name, frequency, scope, file })
      else console.log(`已设置来源 ${name} 的更新提示频率为 ${frequency}（${scope}）：${file}`)
    } catch (e) {
      console.error(`⚠️ 写入来源提示配置失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 来源刷新：只刷新来源元数据与缓存，不自动改写已安装技能
sourcesCmd
  .command("refresh")
  .description("刷新外部来源缓存与版本（不自动安装；--dry-run 列出将刷新的来源与当前版本）")
  .argument("[name]", "来源名；省略时刷新全部来源")
  .option("--dry-run", "只列出将刷新的来源与当前版本，不联网、不取锁、不写盘")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((name: string | undefined, options: { dryRun?: boolean; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const config = readSkillsInstallConfig()
      const state = readSkillsState()
      const versionByName = new Map(collectSkillVersionUpdates().sources.map((source) => [source.name, source.version]))
      const candidates = new Map<string, { spec: string; temporary: boolean }>()
      for (const [sourceName, entry] of Object.entries(config.sources ?? {})) {
        if (sourceName === BUILTIN_SOURCE) continue
        candidates.set(sourceName, {
          spec: entry.url ? `${entry.url}${entry.ref ? `#${entry.ref}` : ""}` : entry.root ?? "",
          temporary: false,
        })
      }
      for (const [sourceName, source] of Object.entries(state?.sources ?? {})) {
        if (sourceName === BUILTIN_SOURCE) continue
        if (candidates.has(sourceName)) continue
        candidates.set(sourceName, {
          spec: source.url ? `${source.url}${source.ref ? `#${source.ref}` : ""}` : source.root,
          temporary: source.temporary,
        })
      }
      if (name && !candidates.has(name)) {
        console.error(`⚠️ 未找到来源：${name}`)
        process.exitCode = 1
        return
      }
      const selected = name ? [[name, candidates.get(name)!] as const] : [...candidates.entries()]
      if (options.dryRun) {
        const rows = selected.map(([sourceName, item]) => ({
          name: sourceName,
          kind: item.spec.startsWith("http") || item.spec.startsWith("git@") || item.spec.startsWith("ssh://") ? "remote" : "local",
          temporary: item.temporary,
          status: "planned",
          version: versionByName.get(sourceName) || null,
          error: null,
        }))
        if (options.format === "json") printJson({ dryRun: true, sources: rows })
        else {
          for (const row of rows) {
            console.log(`[预演] ${row.name}（${row.kind}${row.temporary ? "，临时" : ""}）：将刷新　当前版本：${row.version ?? "未知"}`)
          }
        }
        return
      }
      const release = acquireSkillsLock(skillsLockFile(getHomeDir()))
      const rows: Array<{ name: string; kind: string; temporary: boolean; status: string; version: string | null; error: string | null }> = []
      try {
        for (const [sourceName, item] of selected) {
          const kind = item.spec.startsWith("http") || item.spec.startsWith("git@") || item.spec.startsWith("ssh://") ? "remote" : "local"
          try {
            if (kind === "remote") refreshRemoteSource(item.spec)
            const resolved = resolveSource(item.spec, { name: sourceName, temporary: item.temporary })
            const latest = state?.sources[sourceName]
            if (latest) {
              latest.version = resolved.version || ""
              writeSkillsState(state!)
            }
            rows.push({ name: sourceName, kind, temporary: item.temporary, status: "refreshed", version: resolved.version || null, error: null })
          } catch (e) {
            const message = (e as Error).message
            rows.push({
              name: sourceName,
              kind,
              temporary: item.temporary,
              status: message.includes("git 不可用") ? "skipped" : "failed",
              version: null,
              error: message,
            })
          }
        }
      } finally {
        release()
      }
      if (options.format === "json") printJson({ dryRun: false, sources: rows })
      else {
        for (const row of rows) {
          const tag = row.status === "refreshed" ? "已刷新" : row.status === "skipped" ? "已跳过" : "失败"
          console.log(`${row.name}（${row.kind}${row.temporary ? "，临时" : ""}）：${tag}${row.version ? ` ${row.version}` : ""}${row.error ? `（${row.error}）` : ""}`)
        }
      }
      const failed = rows.filter((row) => row.status === "failed")
      if ((name && failed.length > 0) || (!name && rows.length > 0 && failed.length === rows.length)) process.exitCode = 1
    } catch (e) {
      console.error(`⚠️ 刷新来源失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

sourcesCmd
  .command("remove")
  .argument("<name>", "来源名")
  .option("--prune", "同时清理该来源的产物与状态")
  .option("--dry-run", "预演（只预览，不删文件）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((name: string, options: { prune?: boolean; dryRun?: boolean; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const dryRun = Boolean(options.dryRun)
      if (options.prune) {
        const report = removeSkills({ dryRun, source: name })
        const cleaned = dryRun ? [] : removeUpdateCheckSource(name)
        if (options.format === "json") printJson({ dryRun, source: name, report, cleanedConfigFiles: cleaned })
        else {
          printRemoveReport(report, dryRun)
          if (cleaned.length > 0) console.log(`已清理来源提示配置：${cleaned.join("、")}`)
        }
        return
      }
      if (dryRun) {
        console.log(`[预演] 将注销来源登记：${name}（产物与状态保留）`)
        return
      }
      const config = readSkillsInstallConfig()
      if (!config.sources?.[name]) {
        console.error(`⚠️ 未找到已登记来源：${name}`)
        process.exitCode = 1
        return
      }
      const nextSources = { ...config.sources }
      delete nextSources[name]
      const nextSelection = { ...(config.selection ?? {}) }
      delete nextSelection[name]
      writeSkillsInstallConfig({
        sources: Object.keys(nextSources).length > 0 ? nextSources : undefined,
        selection: Object.keys(nextSelection).length > 0 ? nextSelection : undefined,
      })
      console.log(`已注销来源登记：${name}（产物与状态保留，如需清理加 --prune）`)
    } catch (e) {
      console.error(`⚠️ 注销来源失败：${(e as Error).message}`)
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

// 裸 `toolkit skills`：打印本域帮助，列出全部子命令
skillsCmd.action(() => {
  skillsCmd.help()
})

// 打印升级报告：ID 映射（不落盘）+ 逐项结构动作 + 内部引用改写清单，风格与 skills install 预演一致
function printUpgradeReport(report: UpgradeReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  console.log(`${tag}任务区：${report.tasksDir}`)
  console.log(`${tag}载体：${report.dir}（形态 ${report.form}）`)
  if (report.status === "already-v3") {
    console.log(`${tag}已是 v3 形态，无需升级`)
    return
  }
  console.log("")
  if (report.idMap.length > 0) {
    console.log(`${tag}ID 映射（序号 → 稳定 ID，仅随报告输出，不落盘）：`)
    for (const row of report.idMap) console.log(`  ${row.seq} → ${row.id}  ${row.name}`)
    console.log("")
  }
  console.log(`${tag}结构动作：`)
  for (const c of report.changes) console.log(`  ${c.target}：${c.detail}`)
  if (report.refs.length > 0) {
    console.log("")
    console.log(`${tag}内部引用改写：`)
    for (const r of report.refs) console.log(`  ${r.file}：${r.from} → ${r.to}`)
  }
  if (report.reviews.length > 0) {
    console.log("")
    console.log(`${tag}待人工复核（只报不改）：`)
    for (const msg of report.reviews) console.log(`  ⚠️ ${msg}`)
  }
  console.log("")
  if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
  else console.log("已写入；升级前原件可由本次迁移提交的父提交复现")
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

// 打印归一报告：先给一句话结论，再列发生改动的文件与行号（风格与 upgrade 预演一致）
function printConventionsFormat(report: FormatReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  console.log(`${tag}任务区：${report.tasksDir}（扫描 ${report.files} 个 .md）`)
  if (report.status === "already-compact") {
    console.log(`${tag}表格已全部为紧凑形态，无需归一`)
    return
  }
  console.log("")
  console.log(`${tag}归一改动：${report.changedFiles} 个文件 / ${report.changedLines} 行`)
  for (const c of report.changes) {
    const shown = c.lines.slice(0, 6).join("、")
    console.log(`  ${c.file}：${c.lines.length} 行（${shown}${c.lines.length > 6 ? " …" : ""}）`)
  }
  console.log("")
  if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
  else console.log("已写入；紧凑形态即规范形态，重复执行不改动")
}

// conventions 域：规范载体的结构升级、表格形态归一与只读体检（载体细则见 skills/fxri-plan-to-task/references/conventions-spec.md）
const conventionsCmd = program
  .command("conventions")
  .description("项目协作规范载体：结构升级（v1 / v2 → v3）、表格形态归一（紧凑形态）与只读体检（形态 / 索引 / 入口层）")

// 升级：纯机械结构升级，先判后写；形态异常或未初始化时拒绝执行并给非 0 退出码（异常态不写任何文件）
conventionsCmd
  .command("upgrade")
  .description("把 v1 / v2 规范载体升级为 v3（v2：删「状态」「确立来源任务」两列、退休条目迁入 retired.md 并删分册小节；v1 链式升级；幂等，先判后写）")
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

// 归一：把格式化器填充出的表格收敛回紧凑形态（只动空白层与分隔行横线长度、不改语义；幂等，跳过代码块，先判后写）
conventionsCmd
  .command("format")
  .description("归一表格形态为紧凑形态（只动单元格间距、分隔行横线长度与列对齐填充；幂等、跳过 fenced code block，先报后写）")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
  .option("--dry-run", "预演（只预览将要归一的行，不写文件）")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { dir?: string; dryRun?: boolean; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const report = formatConventions(resolveTasksDir(options.dir), { dryRun: options.dryRun })
      if (options.format === "json") printJson(report)
      else printConventionsFormat(report, Boolean(options.dryRun))
    } catch (e) {
      console.error(`⚠️ 归一失败：${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 状态：只读体检，只报不改（不给 --fix）；体检本身不阻断、退出码恒 0，仅 --format 传非法值时按参数错误报错退出
conventionsCmd
  .command("status")
  .alias("check")
  .description("规范载体只读体检：形态 / 索引 / 入口层三块（只报不改，体检不阻断、退出码恒 0；仅 --format 传非法值时按参数错误报错退出）")
  .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）；入口壳与检测入口按该目录所属仓库扫描")
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: { dir?: string; format?: string }) => {
    try {
      if (!assertJsonFormat(options.format)) return
      const tasksDir = resolveTasksDir(options.dir)
      const report = conventionsStatus(tasksDir, resolveCarrierRoot(tasksDir))
      if (options.format === "json") printJson(report)
      else printConventionsStatus(report)
    } catch (e) {
      console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
    }
  })

// 裸 `toolkit conventions`：打印本域帮助，列出 3 个子命令
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

// docs 域：文档站工具，提供主题、导航与构建产物的校验与写入
const docsCmd = program.command("docs").description("文档站工具：主题、导航与产物的校验与写入")

// 默认主题目录：VitePress 约定的 docs/.vitepress/theme
const THEME_DIR = "docs/.vitepress/theme"

const themeCmd = docsCmd.command("theme").description("统一文档站主题：校验或写入（公共规则随包分发，品牌段由各站自留）")
themeCmd.action(() => {
  themeCmd.help()
})

themeCmd
  .command("check")
  .description("校验主题与模板是否一致（默认动作）")
  .option("--dir <path>", `主题目录（默认 ${THEME_DIR}）`)
  .action((options: { dir?: string }) => {
    const themeDir = resolve(options.dir ?? THEME_DIR)
    try {
      const result = checkDocsTheme(themeDir)
      if (result.ok) {
        console.log(`主题一致：${themeDir}`)
        return
      }
      console.error(`⚠️ 主题与模板不一致（${result.problems.length} 项）`)
      for (const problem of result.problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    } catch (e) {
      console.error(`⚠️ ${(e as Error).message}`)
      process.exitCode = 1
    }
  })

themeCmd
  .command("write")
  .description("写入或刷新模板，保留既有品牌段")
  .option("--dir <path>", `主题目录（默认 ${THEME_DIR}）`)
  .option("--force", "缺少品牌标记也覆盖")
  .action((options: { dir?: string; force?: boolean }) => {
    const themeDir = resolve(options.dir ?? THEME_DIR)
    try {
      const result = writeDocsTheme(themeDir, { force: options.force })
      for (const file of result.written) console.log(`写入：${file}`)
      for (const file of result.kept) console.log(`保留品牌段：${file}`)
    } catch (e) {
      console.error(`⚠️ ${(e as Error).message}`)
      process.exitCode = 1
    }
  })

// 默认文档目录：VitePress 约定的 docs
const DOCS_DIR = "docs"

// 文档站校验问题输出：warn 用 ⚠️、error 用 ✖，附规则 id 便于对照文档
function printDocsProblems(problems: DocsProblem[]): void {
  for (const problem of problems) {
    const mark = problem.level === "warn" ? "⚠️" : "✖"
    console.error(`  ${mark} [${problem.id}] ${problem.message}（${problem.file}）`)
  }
}

const navCmd = docsCmd.command("nav").description("文档站导航：按 site-nav.json 校验顶栏、侧栏、命名与页面体量")
navCmd.action(() => {
  navCmd.help()
})

navCmd
  .command("check")
  .description("校验 docs/site-nav.json 的结构与导航规则（数据单一真源，不解析站点配置）")
  .option("--dir <path>", `文档目录（默认 ${DOCS_DIR}）`)
  .option("--format <format>", "输出格式（json）")
  .action((options: { dir?: string; format?: string }) => {
    if (!assertJsonFormat(options.format)) return
    const result = checkDocsNav(resolve(options.dir ?? DOCS_DIR))
    if (options.format === "json") {
      console.log(toJsonText({ command: "docs nav check", ruleVersion: NAV_RULES_VERSION, ok: result.ok, problems: result.problems }))
    } else if (result.ok) {
      console.log(`导航校验通过：顶栏 ${result.navCount} 项、侧栏 ${result.sidebarCount} 组`)
    } else {
      console.error(`⚠️ 导航校验失败（${result.problems.filter((problem) => problem.level === "error").length} 项）`)
    }
    if (options.format !== "json") printDocsProblems(result.problems)
    if (!result.ok) process.exitCode = 1
  })

const distCmd = docsCmd.command("dist").description("文档站产物：校验 404 不进站点地图与站内搜索索引（需先构建）")
distCmd.action(() => {
  distCmd.help()
})

distCmd
  .command("check")
  .description("校验构建产物：404 页不进 sitemap 与站内搜索索引（产物缺失时跳过）")
  .option("--dir <path>", `文档目录（默认 ${DOCS_DIR}）`)
  .option("--format <format>", "输出格式（json）")
  .action((options: { dir?: string; format?: string }) => {
    if (!assertJsonFormat(options.format)) return
    const result = checkDocsDist(resolve(options.dir ?? DOCS_DIR))
    if (options.format === "json") {
      console.log(
        toJsonText({ command: "docs dist check", ruleVersion: DIST_RULES_VERSION, ok: result.ok, skipped: result.skipped, problems: result.problems }),
      )
    } else if (result.skipped) {
      console.log("跳过文档站产物校验：未找到 .vitepress/dist（需先执行文档站构建）")
    } else if (result.ok) {
      console.log("文档站产物校验通过：sitemap 不含 404、搜索索引不含 404 页")
    } else {
      console.error(`⚠️ 文档站产物校验失败（${result.problems.filter((problem) => problem.level === "error").length} 项）`)
    }
    if (options.format !== "json") printDocsProblems(result.problems)
    if (!result.ok) process.exitCode = 1
  })

// 裸 `toolkit docs`：打印本域帮助
docsCmd.action(() => {
  docsCmd.help()
})

// tasks 域：任务总览 / 归档 / 校验 / 归一化 / 统计 / 导入导出

// 任务子命令公共选项：目录、脱敏、软告警与严格模式
function addTasksCommonOptions(command: Command): Command {
  return command
    .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
    .option("--redact", "开启隐私脱敏")
    .option("--no-redact", "关闭隐私脱敏")
    .option("--warn", "开启软告警")
    .option("--no-warn", "关闭软告警")
    .option("--strict", "任务目录不存在时报错退出（默认容错为空结果）")
}

// 任务过滤选项：总览、统计与导出共用
function addTasksFilterOptions(command: Command): Command {
  return command
    .option("--view <view>", "任务视图：active / archived / all（总览与导出默认 active，stats 默认 all）")
    .option("--owner <name>", "按负责人过滤（逗号分隔多值）")
    .option("--scope <scope>", "按范围过滤（逗号分隔多值）")
    .option("--status <status>", "按状态过滤（逗号分隔多值）")
    .option("--date <date>", "按单日过滤（YYYY-MM-DD，与 --since/--until 互斥）")
    .option("--since <date>", "起始日期（含当天）")
    .option("--until <date>", "结束日期（含当天）")
}

// 解析任务上下文：严格模式下目录缺失即报错，返回 null 由调用方退出
function resolveTasksContext(options: TasksCommonOptions): { redact: boolean; warn: boolean; dir: string } | null {
  const dir = resolveTasksDir(options.dir)
  if (options.strict && !existsSync(dir)) {
    console.error(`⚠️ 任务目录不存在：${dir}`)
    process.exitCode = 1
    return null
  }
  return {
    redact: resolveRedactEnabled(options.redact),
    warn: resolveEnabled(options.warn, "FX_CHECK_WARN", getCheckWarnings(), true),
    dir,
  }
}

// 解析视图：非法取值置退出码并返回 null
function resolveTaskView(value: string | undefined, fallback: TaskView): TaskView | null {
  const view = value ?? fallback
  if (!["active", "archived", "all"].includes(view)) {
    console.error(`⚠️ 非法视图「${view}」，仅支持 active / archived / all`)
    process.exitCode = 1
    return null
  }
  return view as TaskView
}

// 构造查询过滤：日期互斥与状态逐个校验，非法时返回 null
function buildTaskFilter(options: TasksQueryOptions): TaskFilter | null {
  if (options.date && (options.since || options.until)) {
    console.error("⚠️ --date 不能与 --since / --until 同时使用")
    process.exitCode = 1
    return null
  }
  const filter: TaskFilter = {}
  filter.owner = splitMulti(options.owner)
  filter.scope = splitMulti(options.scope)
  if (!applyStatusFilter(filter, options.status)) return null
  if (options.date) filter.date = options.date
  if (options.since) filter.since = options.since
  if (options.until) filter.until = options.until
  return filter
}

// 总览：视图 + 过滤 + 终端表格 / JSON
async function runTasksOverview(options: TasksQueryOptions): Promise<void> {
  const ctx = resolveTasksContext(options)
  if (!ctx) return
  if (!assertJsonFormat(options.format)) return
  const view = resolveTaskView(options.view, "active")
  if (!view) return
  const filter = buildTaskFilter(options)
  if (!filter) return
  try {
    const { rows, summary } = queryTasks(ctx.dir, view, filter)
    if (options.format === "json") {
      console.log(toJSON(rows, summary, ctx.redact))
      return
    }
    renderTaskBoard(rows, summary, view, filter, ctx.redact)
    // 默认视图提示：带过滤但落在待完成视图无结果时，提示归档需要显式 --view（避免误以为过滤不生效）
    const hasFilter = Boolean(options.owner || options.scope || options.status || options.date || options.since || options.until)
    if (!options.view && hasFilter && rows.length === 0) {
      console.log("（提示：过滤默认作用于待完成视图，查看归档请加 --view archived 或 --view all）")
    }
  } catch (e) {
    console.error(`⚠️ 操作失败：${(e as Error).message}`)
    process.exitCode = 1
  }
}

// 归档：只归档终结态任务，--dry-run 只预览
function runTasksArchive(options: TasksCommonOptions & { dryRun?: boolean; task?: string }): void {
  const ctx = resolveTasksContext(options)
  if (!ctx) return
  const dryRun = Boolean(options.dryRun)
  try {
    const result = archiveTasks(ctx.dir, ctx.redact, { dryRun, warn: ctx.warn, task: options.task })
    // 软告警：归档了任务但无待发布变更集（仅真实归档时提示，预演不提示）
    if (ctx.warn && !dryRun && result.archived > 0 && !hasPendingChangeset()) {
      console.warn("⚠️ 本次归档了任务，但 .changeset 无待发布变更集，如需发版请先创建变更集")
    }
  } catch (e) {
    console.error(`⚠️ 操作失败：${(e as Error).message}`)
    process.exitCode = 1
  }
}

// 校验：任务区 error / warn 双报，存在 error 时退出码 1
function runTasksCheck(options: TasksCommonOptions): void {
  const ctx = resolveTasksContext(options)
  if (!ctx) return
  try {
    const result = validateTasks(ctx.dir)
    // 变更集缺前缀检测并入同一份问题清单（软告警关闭时不计不报）
    const issues = ctx.warn ? [...result.issues, ...changesetPrefixIssues()] : result.issues
    const errorCount = issues.filter((i) => i.level === "error").length
    console.log("任务校验：")
    console.log(`【error】${errorCount} 项`)
    printIssues(issues.filter((i) => i.level === "error"))
    if (ctx.warn) {
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
}

// 统计：复用查询过滤参数，输出周期 / 滞留 / 吞吐三类指标
function runTasksStats(options: TasksQueryOptions): void {
  const ctx = resolveTasksContext(options)
  if (!ctx) return
  if (!assertJsonFormat(options.format)) return
  const view = resolveTaskView(options.view, "all")
  if (!view) return
  const filter = buildTaskFilter(options)
  if (!filter) return
  try {
    const stats = computeStats(ctx.dir, filter, view)
    if (options.format === "json") printJson(stats)
    else for (const line of renderStats(stats)) console.log(line)
  } catch (e) {
    console.error(`⚠️ 操作失败：${(e as Error).message}`)
    process.exitCode = 1
  }
}

// 归一化：默认只读检查，--fix 修复，--check 显式声明只读
function runTasksNormalize(options: TasksCommonOptions & { fix?: boolean; check?: boolean }): void {
  const ctx = resolveTasksContext(options)
  if (!ctx) return
  try {
    if (options.fix && options.check) {
      console.error("⚠️ --fix 与 --check 不能同时使用")
      process.exitCode = 1
      return
    }
    if (options.fix) {
      const result = fixArchive(ctx.dir)
      console.log(`已修复 ${result.fixed} 处`)
      if (result.issues.length > 0) {
        console.log("以下问题需人工确认：")
        printIssues(result.issues)
      }
      return
    }
    const issues = checkArchive(ctx.dir)
    console.log(`归档归一化检查：发现 ${issues.length} 处问题`)
    printIssues(issues)
  } catch (e) {
    console.error(`⚠️ 操作失败：${(e as Error).message}`)
    process.exitCode = 1
  }
}

// 导出：按视图与过滤导出到文件，格式由扩展名决定
async function runTasksExport(path: string, options: TasksQueryOptions): Promise<void> {
  const ctx = resolveTasksContext(options)
  if (!ctx) return
  const view = resolveTaskView(options.view, "active")
  if (!view) return
  const filter = buildTaskFilter(options)
  if (!filter) return
  try {
    const { rows, summary } = queryTasks(ctx.dir, view, filter)
    await exportTasks(path, rows, summary, ctx.redact)
    console.log(`已导出 ${rows.length} 个任务 → ${path}`)
  } catch (e) {
    console.error(`⚠️ 操作失败：${(e as Error).message}`)
    process.exitCode = 1
  }
}

// 导入：独立动作，兼容自定义列映射与目标视图
async function runTasksImport(
  file: string,
  options: TasksCommonOptions & { target?: string; dryRun?: boolean; owner?: string; scope?: string },
): Promise<void> {
  const ctx = resolveTasksContext(options)
  if (!ctx) return
  const section = getConfigSection("tasks")
  const custom = section?.importColumns && typeof section.importColumns === "object" ? (section.importColumns as Record<string, string>) : undefined
  const target = options.target ?? "active"
  if (!["active", "archive"].includes(target)) {
    console.error(`⚠️ 非法导入目标「${target}」，仅支持 active / archive`)
    process.exitCode = 1
    return
  }
  try {
    await importTasks(file, ctx.dir, {
      owner: options.owner,
      scope: options.scope,
      target: target as ImportTarget,
      dryRun: Boolean(options.dryRun),
      importColumns: custom,
    })
  } catch (e) {
    console.error(`⚠️ 导入失败：${(e as Error).message}`)
    process.exitCode = 1
  }
}

const tasksCmd = program.command("tasks").description("任务管理")

addTasksCommonOptions(tasksCmd)
addTasksFilterOptions(tasksCmd)
tasksCmd
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action(async (options: TasksQueryOptions) => {
    await runTasksOverview(options)
  })

// list 为隐式子命令：`toolkit tasks list` 等价于裸 `tasks` 看板，补命令名与直觉不一致的入口
const tasksListCmd = tasksCmd.command("list", { hidden: true })
addTasksCommonOptions(tasksListCmd)
addTasksFilterOptions(tasksListCmd)
tasksListCmd.option("--format <format>", "输出格式（json，输出到 stdout）").action(async (options: TasksQueryOptions) => {
  await runTasksOverview(options)
})

addTasksCommonOptions(tasksCmd.command("archive").description("归档已完成任务"))
  .option("--dry-run", "预演（只预览，不落盘）")
  .option("--task <key>", "只归档指定任务（唯一键）")
  .action((options: TasksCommonOptions & { dryRun?: boolean; task?: string }) => {
    runTasksArchive(options)
  })

addTasksCommonOptions(tasksCmd.command("check").description("校验任务区：规则与变更集前缀，存在 error 时退出码 1"))
  .action((options: TasksCommonOptions) => {
    runTasksCheck(options)
  })

addTasksCommonOptions(tasksCmd.command("normalize").description("归档块归一化：默认只读检查，--fix 修复"))
  .option("--fix", "修复归档块问题")
  .option("--check", "只读检查（默认行为，与 --fix 互斥）")
  .action((options: TasksCommonOptions & { fix?: boolean; check?: boolean }) => {
    runTasksNormalize(options)
  })

addTasksFilterOptions(addTasksCommonOptions(tasksCmd.command("stats").description("任务统计：周期 / 滞留 / 吞吐")))
  .option("--format <format>", "输出格式（json，输出到 stdout）")
  .action((options: TasksQueryOptions) => {
    runTasksStats(options)
  })

addTasksFilterOptions(addTasksCommonOptions(tasksCmd.command("export").description("导出任务到文件（.csv / .xlsx / .json）")))
  .argument("<path>", "导出文件路径")
  .action(async (path: string, options: TasksQueryOptions) => {
    await runTasksExport(path, options)
  })

addTasksCommonOptions(tasksCmd.command("import").description("从文件导入任务（.csv / .xlsx / .json）"))
  .argument("<file>", "导入文件路径")
  .option("--target <target>", "导入目标：active / archive（默认 active）")
  .option("--owner <name>", "导入时统一赋值负责人")
  .option("--scope <scope>", "导入时统一赋值范围")
  .option("--dry-run", "预演（只预览，不落盘）")
  .action(async (file: string, options: TasksCommonOptions & { target?: string; dryRun?: boolean; owner?: string; scope?: string }) => {
    await runTasksImport(file, options)
  })

// changelog 域：doc / version / format / audit 自处理，其余子命令透传给 changesets

// 语言与开关选项：自处理子命令共用
interface ChangelogOptions {
  lang?: string
  redact?: boolean
  warn?: boolean
}

// 自处理子命令公共选项
function addChangelogCommonOptions(command: Command): Command {
  return command
    .option("--lang <lang>", "语言 zh/en", DEFAULT_LANG)
    .option("--redact", "开启隐私脱敏")
    .option("--no-redact", "关闭隐私脱敏")
    .option("--warn", "开启软告警")
    .option("--no-warn", "关闭软告警")
}

// 解析语言与开关：未知语言回落默认并告警
function resolveChangelogContext(options: ChangelogOptions): {
  merged: ReturnType<typeof resolveLanguages>
  lang: ChangelogLanguage
  docLang: string
  redact: boolean
  warn: boolean
} {
  const merged = resolveLanguages()
  const { lang, unknown } = resolveLang(merged, options.lang ?? DEFAULT_LANG, DEFAULT_LANG)
  if (unknown) console.warn(`⚠️ 未知语言「${unknown}」，已回落 ${DEFAULT_LANG}`)
  return {
    merged,
    lang,
    docLang: unknown ? DEFAULT_LANG : (options.lang ?? DEFAULT_LANG),
    redact: resolveRedactEnabled(options.redact),
    warn: resolveEnabled(options.warn, "FX_CHECK_WARN", getCheckWarnings(), true),
  }
}

// 版本：消费变更集 → 归类格式化 → 同步文档镜像
function runChangelogVersion(options: ChangelogOptions & { history?: boolean; syncDoc?: boolean }): void {
  const ctx = resolveChangelogContext(options)
  // 软告警：发版前存在未归档任务
  if (ctx.warn && hasActiveTasks()) {
    console.warn("⚠️ 存在未归档的 active 任务，建议先归档再发版")
  }
  runChangeset(["version"])
  // 软告警须前置于归类（须待 changesets 写入新块后再取数，否则无英文源标题块可扫）；
  // 归类后无前缀条目即并入兜底组，前缀缺失无从统计
  if (ctx.warn) warnUntypedEntries(Object.values(ctx.merged))
  formatChangelogs(".", localDate(), ctx.lang, ctx.redact, Boolean(options.history))
  // 发版后自动同步文档站镜像：失败只告警，不阻断发版（镜像不是发版必需产物）
  if (options.syncDoc !== false) syncDocAfterVersion(ctx.docLang)
}

// 格式化：按语言与类型归类重排，不消费变更集
function runChangelogFormat(options: ChangelogOptions & { history?: boolean }): void {
  const ctx = resolveChangelogContext(options)
  if (ctx.warn) warnUntypedEntries(Object.values(ctx.merged))
  formatChangelogs(".", localDate(), ctx.lang, ctx.redact, Boolean(options.history))
}

// 文档镜像：默认从根 CHANGELOG.md 生成，--check 只比对不写
function runChangelogDoc(
  options: ChangelogOptions & { check?: boolean; from?: string; to?: string; title?: string; outline?: string; frontmatter?: boolean },
): void {
  const ctx = resolveChangelogContext(options)
  try {
    const docOptions = resolveDocOptions({
      from: options.from,
      to: options.to,
      title: options.title,
      outline: options.outline,
      // --no-frontmatter 未传时 commander 给 true，视为未传，交由配置决定
      frontmatter: options.frontmatter === false ? false : undefined,
      lang: ctx.docLang,
    })
    if (options.check) {
      const result = checkDoc(docOptions)
      if (!result.ok) {
        console.error(`⚠️ CHANGELOG 镜像不一致：第 ${result.line} 行`)
        if (result.expected !== undefined) console.error(`  期望：${result.expected}`)
        if (result.actual !== undefined) console.error(`  实际：${result.actual}`)
        process.exitCode = 1
        return
      }
      console.log(`CHANGELOG 镜像一致：${docOptions.target}`)
      return
    }
    const result = syncDoc(docOptions)
    console.log(result.changed ? `CHANGELOG 镜像已更新：${docOptions.target}` : `CHANGELOG 镜像无变化：${docOptions.target}`)
  } catch (e) {
    console.error(`⚠️ ${(e as Error).message}`)
    process.exitCode = 1
  }
}

// 审计：只列出同对象净变更候选，不改写
function runChangelogAudit(): void {
  console.log(formatAuditReport(auditChangesets(".changeset")))
}

const changelogCmd = program.command("changelog").description("多语言 CHANGELOG（封装 changesets）")
changelogCmd.enablePositionalOptions(true)

addChangelogCommonOptions(changelogCmd.command("version").description("消费变更集并生成新版本块，随后同步文档镜像"))
  .option("--history", "追溯改写历史版本块（默认保留）")
  .option("--no-sync-doc", "不自动同步文档站镜像")
  .action((options: ChangelogOptions & { history?: boolean; syncDoc?: boolean }) => {
    runChangelogVersion(options)
  })

addChangelogCommonOptions(changelogCmd.command("format").description("按语言与类型归类重排 CHANGELOG 条目"))
  .option("--history", "追溯改写历史版本块（默认保留）")
  .action((options: ChangelogOptions & { history?: boolean }) => {
    runChangelogFormat(options)
  })

addChangelogCommonOptions(changelogCmd.command("doc").description("生成或校验文档站 CHANGELOG 镜像页"))
  .option("--check", "只比对镜像页与根 CHANGELOG，不写文件")
  .option("--from <path>", "根 CHANGELOG 路径")
  .option("--to <path>", "镜像页路径")
  .option("--title <text>", "镜像页标题")
  .option("--outline <value>", "frontmatter outline")
  .option("--no-frontmatter", "不写 frontmatter")
  .action((options: ChangelogOptions & { check?: boolean; from?: string; to?: string; title?: string; outline?: string; frontmatter?: boolean }) => {
    runChangelogDoc(options)
  })

addChangelogCommonOptions(changelogCmd.command("audit").description("审计待发布变更集，列出需要合并的候选（只提示不改写）"))
  .action(() => {
    runChangelogAudit()
  })

// 裸 changelog：仍透传给 changesets（无参数时按其默认行为）
changelogCmd.action(() => {
  runChangeset([])
})

// changesets 原生子命令：参数原样透传
const CHANGESET_PASSTHROUGH: Array<[string, string]> = [
  ["add", "新增变更集（透传给 changesets）"],
  ["status", "查看待发布变更集状态（透传给 changesets）"],
  ["pre", "进入或退出预发布模式（透传给 changesets）"],
  ["tag", "为已发布版本打标签（透传给 changesets）"],
  ["init", "初始化 .changeset 配置（透传给 changesets）"],
  ["publish", "发布变更集（透传给 changesets）"],
]
for (const [name, description] of CHANGESET_PASSTHROUGH) {
  changelogCmd
    .command(name)
    .description(description)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[args...]", "透传给 changesets 的参数")
    .action((args: string[]) => {
      runChangeset([name, ...(args ?? [])])
    })
}

// 规则域：全局规则模块的自由组合、复制与缓存管理
const rulesCmd = program.command("rules").description("全局规则：列出模块、组合输出与缓存管理")
rulesCmd.action(() => {
  rulesCmd.help()
})

rulesCmd
  .command("list")
  .description("列出规则模块、预设与当前缓存选择")
  .option("--format <format>", "输出格式（json）")
  .action((options: { format?: string }) => {
    try {
      if (options.format && options.format !== "json") console.error("⚠️ --format 仅支持 json，已回落文本输出")
      const listed = listRules()
      const selection = readRulesSelection(listed.modules.map((mod) => mod.id))
      if (options.format === "json") {
        console.log(JSON.stringify({ ...listed, selection: selection?.modules ?? null }, null, 2))
        return
      }
      console.log("规则模块：")
      for (const mod of listed.modules) {
        const mark = selection?.modules.includes(mod.id) ? "●" : " "
        console.log(`  ${mark} ${mod.id.padEnd(8)} ${mod.anchor}  ${mod.title}（${mod.presets.join(" / ") || "无预设"}）`)
      }
      console.log(`预设：${Object.entries(listed.presets).map(([name, ids]) => `${name}=${ids.join("+")}`).join("；")}`)
      console.log(`当前缓存：${selection ? selection.modules.join(" → ") : "无（默认 recommended）"}`)
    } catch (error) {
      console.error(`⚠️ ${(error as Error).message}`)
      process.exitCode = 1
    }
  })

rulesCmd
  .command("compose")
  .description("组合规则模块并输出（默认输出到 stdout）")
  .option("--preset <name>", "预设：minimal / recommended / complete / full")
  .option("--module <id...>", "模块 id（可重复，也可逗号分隔）")
  .option("--no-anchor", "不输出首行更新时间锚点")
  .option("--out <file>", "写入文件（stdout 为空）")
  .option("--copy", "写入系统剪贴板（stdout 为空）")
  .option("--no-cache", "不读取也不写入组合缓存")
  .action((options: { preset?: string; module?: string[]; anchor?: boolean; out?: string; copy?: boolean; cache?: boolean }) => {
    try {
      if (options.copy && options.out) {
        console.error("⚠️ --copy 与 --out 不能同时使用")
        process.exitCode = 1
        return
      }
      const rawModules = options.module ?? []
      const modules = rawModules
        .flatMap((item) => item.split(/[,，]/))
        .map((item) => item.trim())
        .filter(Boolean)
      if (rawModules.length > 0 && modules.length === 0) {
        console.error("⚠️ --module 不能为空")
        process.exitCode = 1
        return
      }
      if (options.preset && modules.length > 0) {
        console.error("⚠️ --preset 与 --module 不能同时使用")
        process.exitCode = 1
        return
      }
      const ruleset = loadRuleset()
      const cached = options.cache === false ? null : readRulesSelection(ruleset.modules.map((mod) => mod.id))
      let ids: string[]
      let explicit = false
      if (modules.length > 0) {
        ids = modules
        explicit = true
      } else if (options.preset) {
        const preset = ruleset.presets[options.preset]
        if (!preset) {
          console.error(`⚠️ 未知预设「${options.preset}」，可选：${Object.keys(ruleset.presets).join(" / ")}`)
          process.exitCode = 1
          return
        }
        ids = preset
        explicit = true
      } else if (cached) {
        ids = cached.modules
      } else {
        ids = ruleset.presets.recommended ?? []
      }
      const text = composeRules(ids, { anchor: options.anchor !== false })
      if (explicit && options.cache !== false) {
        // 导出 / 复制属一次性动作，不改变「下次裸跑 compose」的默认组合
        if (options.out || options.copy) {
          console.error("已跳过组合缓存写入（--out / --copy 不改变默认组合）")
        } else {
          writeRulesSelection(ids)
          console.error(`已记住本次组合（${ids.join(" → ")}），下次直接 rules compose 复用`)
        }
      }
      if (options.copy) {
        const result = copyToClipboard(text)
        if (!result.ok) {
          console.error(`⚠️ 写入剪贴板失败：${result.error}`)
          process.exitCode = 1
          return
        }
        console.error(`已复制到剪贴板（${result.command}）`)
        return
      }
      if (options.out) {
        mkdirSync(dirname(resolve(options.out)), { recursive: true })
        writeFileAtomic(options.out, `${text}\n`)
        console.error(`已写入：${options.out}`)
        return
      }
      console.log(text)
    } catch (error) {
      console.error(`⚠️ ${(error as Error).message}`)
      process.exitCode = 1
    }
  })

rulesCmd
  .command("reset")
  .description("清除规则组合缓存")
  .action(() => {
    console.log(clearRulesSelection() ? "已清除规则组合缓存" : "无规则组合缓存可清除")
  })

// 使用情况域：技能使用统计（默认关闭，本地存储）
registerUsageCommands(program)

// 帮助口径统一：命令声明完毕后递归换中文帮助文案并对齐父级清单
// ⚠️ 顺序：须先 setupHelp 再 helpCommand——help 子命令自带 helpOption(false)，反过来会把它的 Usage 撑成 [options] [command]
setupHelp(program)
program.helpCommand("help [command]", "显示帮助")

ensureUtf8()
// main 包装：兼容 CJS 产物（顶层 await 仅 ESM 支持）；主命令完成后同步读缓存提示升级（零网络、不影响退出码）
async function main(): Promise<void> {
  // 内部升级检查 worker：仅联网刷新缓存后退出，不执行命令、不做技能自愈（参数由版本提示器派生时注入）
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
    // 所有路径统一收口：成功命令按通道输出一行提示；帮助 / 版本 / JSON / 透传在函数内跳过。
    // 技能取证按需触发：不可提示的命令不读技能文件
    const skillAlerts = () => {
      const updates = collectSkillVersionUpdates()
      return [
        ...updates.builtin.map((item) => ({ channel: "builtin" as const, name: item.name, current: item.installed, latest: item.latest })),
        ...updates.external.map((item) => ({ channel: "external" as const, source: item.source, name: item.name, current: item.installed, latest: item.latest })),
      ]
    }
    emitVersionHint(version, {
      argv: process.argv.slice(2),
      exitCode: typeof process.exitCode === "number" ? process.exitCode : 0,
      skillAlerts,
    })
  }
}
// 执行语义不变，仅导出 Promise 供测试 await 主流程（cli.ts 无法被静态 import，见 src/__tests__/options-matrix.test.ts）
export const cliReady = main()
