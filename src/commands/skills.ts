// skills 命令：技能分发、状态、卸载与来源管理的注册入口与报告打印
import { join } from "node:path"
import type { Command } from "commander"
import { getHomeDir } from "../config"
import { assertJsonFormat } from "../json-output"
import { exitWithCancel, isInteractive, runInteractive } from "../prompts"
import { assertChoice } from "../cli-ui"
import { runScopeMount } from "../scope/wizard"
import { analyzeSkillLinkage, formatLinkageHints, type SkillLinkageReport } from "../scope/linkage"
import { collectSkillVersionUpdates, type SkillVersionReport } from "../skills/version-status"
import { versionGt } from "../version"
import {
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
  listPackageSkills,
  planSkillSelection,
  planSkills,
  planProjectSkills,
  deliveryModeLabel,
  readSkillsDeliveryConfig,
  writeSkillsDeliveryDefault,
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
  lintSkills,
  BUILTIN_SOURCE,
  gateRulesToDeliveryRules,
  resolveDelivery,
  explainSkillDelivery,
  packageVersion,
  type InstallReport,
  type ProjectDirResult,
  type ProjectInstallReport,
  type ProjectItemState,
  type ProjectRemoveReport,
  type CurrentForm,
  type ProjectStatusReport,
  type SkillItem,
  type SkillItemState,
  type SkillsMode,
  type SkillsPlanReport,
  type SkillsRemoveReport,
  type SkillsStatusReport,
  type SkillLintReport,
  type UninstallChoice,
} from "../skills"
import {
  readCachedLatest,
  resolveRegistry,
  resolveNotify,
  resolveNotifySource,
  resolveBuiltinNotifyLabel,
  isUpdateCheckEnabled,
  dismissSkillAlerts,
  readHintTiming,
  type RegistryInfo,
  type SkillAlert,
} from "../update-check"
import { line, style } from "../term-style"
import { collectDir, printJson, splitMulti } from "./shared"

// 版本号与包内技能版本同源：走 packageVersion() 解析包根，避免依赖产物相对路径
const version = packageVersion()

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
  gate: "入口壳（正文由 toolkit scope guard 按作用域下发）",
  "gate-drift": "入口壳已过期（与当前版本不一致，运行 toolkit skills install 刷新）",
  "form-drift": "产物形态与目标分发形态不一致（运行 toolkit skills install 收敛）",
  residue: "分发形态为 off，存在残留（运行 toolkit skills install --prune 清理）",
  missing: "缺失",
  conflict: "同名冲突（非本包产物）",
  "not-selected": "未选择",
  "installed-unselected": "未选择但已安装",
}

// 需要处理的异常状态：status 汇总提示与 install 修复范围
const SKILL_PROBLEM_STATES: SkillItemState[] = ["dangling", "wrong", "copy-drift", "gate-drift", "form-drift", "missing", "conflict"]

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
    for (const warning of expiredSelectionWarnings(resolved)) console.warn(warning)
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
    interactive: isInteractive(),
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
  // ESC 等同回退：install 首步取消，由调用方按取消口径结束
  if (picked === null) return null
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
  if (!isInteractive() || options.yes) return undefined
  const all = resolveSkillTargets()
  const choices = buildGlobalTargetChoices(all, readSkillsInstallConfig().targets, options.dir)
  const selectable = choices.filter((choice) => !choice.disabled)
  // 只有一个可用目标时无需选择
  if (selectable.length <= 1) return selectable.map((choice) => choice.value)
  const picked = await promptTargetSelection(choices, "选择要写入技能的目标（空格切换，回车确认）")
  // ESC 返回上一步：由 install 循环回技能选择
  if (picked === null) return null
  const known = new Set(all.filter((target) => target.name).map((target) => target.name))
  return picked.filter((value) => known.has(value))
}

// 项目目标选择：TTY 交互多选已存在候选目录；非交互返回 undefined 交由 install 读取保存选择
async function chooseProjectTargets(options: { dir: string[]; yes?: boolean }): Promise<string[] | undefined | null> {
  if (!isInteractive() || options.yes) return undefined
  const targets = resolveProjectTargets()
  const choices = buildProjectTargetChoices(targets.shellDirs, readProjectSkillsConfig().targets, options.dir, targets.missingDirs)
  const selectable = choices.filter((choice) => !choice.disabled)
  // 只有一个可用目录时无需选择
  if (selectable.length <= 1) return selectable.map((choice) => choice.value)
  const picked = await promptTargetSelection(choices, "选择要写入的项目技能目录（空格切换，回车确认）")
  // ESC 返回上一步：由 install 循环回技能选择
  if (picked === null) return null
  return picked.filter((value) => targets.shellDirs.includes(value))
}

// 全局目标回显：名字映射为显示名，未显式选择时说明回落口径
function globalTargetSummary(names: string[] | undefined): string {
  if (!names) return "按已保存选择 / 全部可用目标"
  const labelBy = new Map(resolveSkillTargets().map((target) => [target.name, target.label]))
  return names.map((name) => labelBy.get(name) ?? name).join("、") || "无"
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
    if (t.gates.length > 0) modes.push(`入口壳 ${t.gates.length} 个`)
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
      line.hint(`本机未检测到的 agent ${report.skippedTargets.length} 个已跳过（不凭空创建目录）；如需装到未识别的 agent：toolkit skills install --dir <其全局技能目录>`),
    )
  }
  console.log(`${tag}状态文件：${report.stateFile}`)
  if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
}

// 计划动作文案：保持 / 建壳 / 换全文 / 清理
const PLAN_ACTION_LABEL: Record<"keep" | "shell" | "full" | "clean", string> = {
  keep: "保持",
  shell: "建壳",
  full: "换全文",
  clean: "清理",
}

// 当前形态文案：无产物与漂移单列，其余复用形态文案
function currentFormLabel(current: CurrentForm): string {
  if (current === "none") return "无产物"
  if (current === "drift") return "漂移"
  return deliveryModeLabel(current)
}

// 打印分发计划：逐目标逐技能列出动作、目标形态与判定来源；skills plan 与 install --dry-run 共用
function printPlanReport(report: SkillsPlanReport): void {
  console.log(`[预演] 技能分发计划：${report.skills.length} 个技能 · ${report.targets.length} 个目标`)
  for (const t of report.targets) {
    console.log("")
    console.log(`${t.label}：${t.dir}`)
    for (const item of t.items) {
      const target = deliveryModeLabel(item.target)
      const form = item.current === "none" ? target : `${currentFormLabel(item.current)} → ${target}`
      console.log(`  ${PLAN_ACTION_LABEL[item.action]}　${item.name}　${form}　← ${item.source}（${item.reason}）`)
    }
    for (const m of t.migrations) console.log(`  [预演] 已改名迁移：${m.from} → ${m.to}`)
  }
  console.log("")
  if (report.skippedTargets.length > 0) {
    console.log(
      line.hint(`本机未检测到的 agent ${report.skippedTargets.length} 个已跳过（不凭空创建目录）；如需装到未识别的 agent：toolkit skills install --dir <其全局技能目录>`),
    )
  }
  console.log(`[预演] 状态文件：${report.stateFile}`)
  console.log(
    report.pending > 0
      ? `[预演] 待收敛 ${report.pending} 项：执行 toolkit skills install 应用`
      : "[预演] 全部已就绪，无需写入",
  )
}

// --refresh 只刷新已存在产物：其余写选项无法采纳时明确告警，不静默忽略
function warnRefreshIgnored(options: { prune?: boolean; force?: boolean; mode?: string; dir: string[] }): void {
  const ignored: string[] = []
  if (options.prune) ignored.push("--prune")
  if (options.force) ignored.push("--force")
  if (options.mode !== undefined) ignored.push("--mode")
  if (options.dir.length > 0) ignored.push("--dir")
  if (ignored.length > 0) console.warn(`⚠️ --refresh 只刷新已存在产物，已忽略：${ignored.join("、")}`)
}

// 解释单个技能的分发形态：逐级列出命中 / 未命中与被压规则，回答「为什么是壳 / 为什么不是」
function printDeliveryExplanation(name: string): void {
  const explanation = explainSkillDelivery(name)
  console.log(`技能 ${name} 分发形态：${deliveryModeLabel(explanation.decision.mode)}（${explanation.decision.source}）`)
  for (const level of explanation.levels) {
    console.log(`  ${level.hit ? "命中" : "未命中"}　${level.level}：${level.detail}`)
  }
  if (explanation.overridden.length > 0) console.log(`  被压规则：${explanation.overridden.join("、")}`)
  console.log(`  原因：${explanation.decision.reason}`)
}

// 打印现场状态：先列技能真源版本基准，再逐目标报状态——健康目标折叠为一行，仅异常目标逐条展开，末尾汇总
// 多 agent 机器上目标数可达十余个，逐技能刷「软链正常」会把真正的问题淹没在噪音里
function printStatusReport(report: SkillsStatusReport): void {
  console.log(`技能源：${report.source}`)
  console.log(`技能版本：${skillVersionLine(report)}`)
  // 闸门状态按实际产物分流：已判定入口壳但尚未生成产物时，不能让用户以为已是入口壳形态
  const gateArtifacts = report.targets.reduce((count, target) => count + target.items.filter((item) => item.state === "gate").length, 0)
  const gateText =
    report.delivery.gated === 0
      ? "未开启（全文安装）"
      : gateArtifacts > 0
        ? `已开启（${gateArtifacts} 个入口壳，正文由 toolkit scope guard 下发）`
        : "已开启（尚未生成入口壳产物，运行 toolkit skills install 生效）"
  console.log(`内容闸门：${gateText}`)
  if (report.delivery.gated > 0 || report.delivery.off > 0) {
    console.log(
      `分发形态（本次选择）：全文 ${report.delivery.full} / 入口壳 ${report.delivery.gated} / 不安装 ${report.delivery.off}`,
    )
  }
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
  let residueCount = 0
  // 来源已无此名的旧名残留：install 无法补齐，汇总时给出含实际名字的可复制命令
  let staleNameCount = 0
  const staleNames = new Set<string>()
  for (const t of report.targets) {
    const head = `${t.label}：${t.dir}${t.dirExists ? "" : "（目录未创建）"}${t.selected ? "" : "（未选择）"}`
    const bad = t.items.filter((item) => SKILL_PROBLEM_STATES.includes(item.state))
    const unselected = t.items.filter((item) => item.state === "installed-unselected")
    const residues = t.items.filter((item) => item.state === "residue")
    problems += bad.length
    unselectedCount += unselected.length
    residueCount += residues.length
    for (const item of bad) if (item.source === "") staleNames.add(item.name)
    staleNameCount += bad.filter((item) => item.source === "").length
    console.log("")
    // 健康目标折叠为一行：逐技能刷「软链正常」在目标多时纯属噪音（完整信息另见 --format json）
    if (bad.length === 0 && unselected.length === 0 && residues.length === 0) {
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
    for (const item of residues) console.log(`  ${item.name}：${SKILL_STATE_LABEL[item.state]}`)
    const ok = t.items.length - bad.length - unselected.length - residues.length
    if (ok > 0) console.log(`  其余 ${ok} 项正常`)
  }
  if (report.pendingAgents.length > 0) {
    console.log("")
    console.log(line.hint(`未安装的 agent ${report.pendingAgents.length} 个未纳入分发（需要时用 toolkit skills install --dir <路径> 指定）`))
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
      ? line.error(`共 ${problems} 处需处理：缺失 / 悬空 / 指向其他版本 / 副本漂移 / 入口壳过期用 toolkit skills install 补齐，同名冲突用 toolkit skills install --force 覆盖`)
      : line.ok("所有已纳入的目标均正常"),
  )
  if (staleNameCount > 0) {
    console.log(
      line.hint(
        `其中 ${staleNameCount} 项为来源已无此名的旧名残留：install 无法补齐，执行 toolkit skills uninstall --scope global --skills ${[...staleNames].join(",")} 清理`,
      ),
    )
  }
  if (unselectedCount > 0) {
    console.log(line.hint(`未选择但已安装 ${unselectedCount} 项：保留不影响使用，需要清理时运行 toolkit skills install --prune`))
  }
  if (residueCount > 0) {
    console.log(line.hint(`分发形态为 off 的残留 ${residueCount} 项：运行 toolkit skills install --prune 清理`))
  }
  if (report.pending.length > 0) {
    console.log(line.hint(`待收敛 ${report.pending.length} 项：运行 toolkit skills install 收敛（可先 toolkit skills plan 预览）`))
  }
  // 软链落点是写入穿透形态：改落点文件等于改真源，需在报告末尾点明纪律，避免用户误在落点上编辑
  const linkCount = report.targets.reduce((n, t) => n + t.items.filter((i) => i.state === "link").length, 0)
  if (linkCount > 0) console.log(line.hint(`软链落点 ${linkCount} 项：写入将穿透至技能真源目录，改内容请改真源`))
}

// 打印卸载报告：按目标区分已移除 / 已不存在 / 需人工确认三类，并说明状态文件处置
function printRemoveReport(report: SkillsRemoveReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  if (!report.stateExists) {
    console.log(line.hint("未找到本包的状态文件，没有由本包安装的产物需要清理（其他方式安装的技能不受影响）"))
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
  else if (report.stateRemoved) console.log(line.ok("状态文件已删除，本包产物清理完毕"))
  else console.log(line.hint("状态文件已保留（存在需人工确认或未移除的条目）"))
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
  residue: "分发形态为 off，存在残留（运行 toolkit skills install --scope project --prune 清理）",
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
  if (result.gates.length > 0) console.log(`${pad}入口壳：${result.gates.join("、")}`)
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
  if (report.delivery.gated > 0 || report.delivery.off > 0) {
    console.log(
      `项目面 · 分发形态（本次选择）：全文 ${report.delivery.full} / 入口壳 ${report.delivery.gated} / 不安装 ${report.delivery.off}`,
    )
  }
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
  let residueCount = 0
  for (const d of report.dirs) {
    const bad = d.items.filter((item) => PROJECT_PROBLEM_STATES.includes(item.state))
    const unselected = d.items.filter((item) => item.state === "installed-unselected")
    const residues = d.items.filter((item) => item.state === "residue")
    problems += bad.length
    unselectedCount += unselected.length
    residueCount += residues.length
    const head = `${d.kind === "source" ? "真源副本" : "薄壳"}：${d.dir}${d.selected ? "" : "（未选择）"}`
    console.log("")
    // 健康目录折叠为一行，避免目标多时把真正的问题淹没在噪音里（完整信息另见 --format json）
    if (bad.length === 0 && unselected.length === 0 && residues.length === 0) {
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
    for (const item of residues) console.log(`  ${item.name}：${PROJECT_STATE_LABEL[item.state]}`)
    const ok = d.items.length - bad.length - unselected.length - residues.length
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
      ? line.error(`项目面共 ${problems} 处需处理：漂移 / 缺失用 toolkit skills install --scope project 补齐，同名冲突加 --force`)
      : line.ok("项目面所有已纳入的目录均正常"),
  )
  if (unselectedCount > 0) {
    console.log(line.hint(`项目面未选择但已安装 ${unselectedCount} 项：保留不影响使用，需要清理时运行 toolkit skills install --scope project --prune`))
  }
  if (residueCount > 0) {
    console.log(line.hint(`项目面分发形态为 off 的残留 ${residueCount} 项：运行 toolkit skills install --scope project --prune 清理`))
  }
  if (report.pending.length > 0) {
    console.log(line.hint(`项目面待收敛 ${report.pending.length} 项：运行 toolkit skills install --scope project 收敛`))
  }
}

// 打印项目面卸载报告：按目录区分已移除 / 已不存在 / 需人工确认，并说明归属账处置
function printProjectRemoveReport(report: ProjectRemoveReport, dryRun: boolean): void {
  const tag = dryRun ? "[预演] " : ""
  if (!report.stateExists) {
    console.log(line.hint("项目面：未找到归属账，没有由本包安装的项目内技能产物需要清理"))
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
  else if (report.stateRemoved) console.log(line.ok("项目面归属账已删除，本包产物清理完毕"))
  else console.log(line.hint("项目面归属账已保留（存在需人工确认或未移除的条目）"))
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

// 打印状态报告（按作用域分派到对应面）；矩阵联动按项目面评估，全局面说明未评估
function printStatusReports(
  scope: { choice: ScopeChoice; explicit: boolean },
  glob: SkillsStatusReport | null,
  project: ProjectStatusReport | null,
  versionInfo: Parameters<typeof printVersionStatus>[0],
  linkage: SkillLinkageReport | null,
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
  if (!linkage) {
    console.log("")
    console.log(line.hint("全局面未评估技能矩阵联动；查看项目面请用 toolkit skills status --scope project"))
    return
  }
  // 矩阵联动：闸门未接管、策略失效与已安装但矩阵未允许的技能；只提示，不自动删除
  const hints = formatLinkageHints(linkage)
  if (hints.length === 0) return
  console.log("")
  console.log("技能矩阵联动：")
  for (const hint of hints) console.log(line.hint(`  ${hint}`))
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

// 打印技能校验报告：stdout 只放数据，诊断由调用方写 stderr
function printLintReport(report: SkillLintReport): void {
  if (report.issues.length === 0) {
    const ignored = report.summary.ignored > 0 ? `，跳过 ${report.summary.ignored} 个被忽略的技能` : ""
    console.log(`✔ ${report.summary.skills} 个技能通过校验${ignored}`)
    return
  }
  for (const issue of report.issues) {
    const location = issue.line === undefined ? issue.file : `${issue.file}:${issue.line}`
    console.log(`${issue.level === "error" ? "✖" : "⚠️"} ${location} [${issue.code}] ${issue.message}`)
  }
  console.log(`\n${report.summary.errors} 个错误、${report.summary.warnings} 个告警（共 ${report.summary.skills} 个技能）`)
}

// 正整数参数解析：未给出返回 undefined，非法返回 null（调用方按用法错误退出 2）
function parsePositiveInt(value: string | undefined): number | undefined | null {
  if (value === undefined) return undefined
  return /^[1-9]\d*$/.test(value) ? Number(value) : null
}

// 注册 skills 命令：装配点只负责按序调用
export function registerSkillsCommands(program: Command): void {
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
    .option("--all", "安装包内全部技能（含可选技能；非交互执行须加 --yes）")
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
    .option("--check", "只报告待收敛项：有漂移时退出码 1（不写文件，供 CI 使用）")
    .option("--refresh", "只收敛已存在的项目面产物，不新增技能；非 TTY / CI 下只打印漂移（prepare 钩子）")
    .option("--force", "覆盖同名非本包产物（默认跳过，避免破坏用户自装技能；不改本包已登记副本的形态）")
    .option("--prune", "清理未选择且内容与本包真源一致的旧产物（只清本包登记条目）")
    .option("--mode <mode>", "技能安装模式：skills（core 必装）/ package（纯包管理器，允许零选）")
    .option("--gate", "开启内容闸门：本次全部技能写入口壳，正文由 toolkit scope guard 按作用域下发")
    .option("--embed", "回退内容闸门：把入口壳改回全文")
    .option("--no-skills", "本次不安装任何技能，不改模式与已保存选择")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .addHelpText(
      "after",
      [
        "",
        "非交互语义：",
        "  --yes            跳过选择与确认，采用已保存选择（首次只装 core 与全部可用目标）",
        "  --use-saved      采用已保存选择，不询问技能与目标，仍保留最终确认",
        "  --no-save-agents 目标选择只本次生效，不写回配置",
        "  非 TTY 且未给 --yes / --use-saved：按已保存选择安装，不进入交互",
        "  交互流程：技能 → 目标 → 确认；ESC 逐级返回，Ctrl+C 退出码 130",
      ].join("\n"),
    )
    .action(async (options: { scope?: string; skills?: string; all?: boolean; optional?: boolean; from: string[]; save?: string | boolean; agent?: string; allAgents?: boolean; saveAgents?: boolean; yes?: boolean; useSaved?: boolean; copy?: boolean; dir: string[]; dryRun?: boolean; check?: boolean; refresh?: boolean; force?: boolean; prune?: boolean; mode?: string; gate?: boolean; embed?: boolean; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        const scope = resolveScopeChoice(options.scope)
        if (!scope) return
        const dryRun = Boolean(options.dryRun)
        // --no-skills 用 argv 判定：commander 的 --no- 前缀默认值会与 --skills 的字符串属性冲突
        const noSkills = process.argv.includes("--no-skills")
        // 互斥声明集中一处：命中即「原因 + 未执行安装」，避免各分支手写文案漂移
        const conflicts: Array<[boolean, string]> = [
          [options.mode !== undefined && noSkills, "--mode 与 --no-skills 不能同时使用"],
          [
            noSkills && (typeof options.skills === "string" || options.all || options.optional === false),
            "--no-skills 与 --skills / --all / --no-optional 不能同时使用",
          ],
          [Boolean(options.gate) && Boolean(options.embed), "--gate 与 --embed 不能同时使用"],
        ]
        const conflict = conflicts.find(([hit]) => hit)
        if (conflict) {
          console.error(`⚠️ ${conflict[1]}，未执行安装`)
          process.exitCode = 1
          return
        }
        if (!assertChoice(options.mode, ["skills", "package"], "--mode", "，未执行安装")) return
        const runProject = scope.choice !== "global"
        const runGlobal = scope.choice !== "project"
        // 兼容提示：项目面此前忽略 --gate / --embed，现已实际生效；随 2.0.0 移除
        if ((options.gate || options.embed) && runProject) {
          console.warn("⚠️ 项目面 --gate / --embed 现已生效（2.0.0 起移除该提示）")
        }
        // JSON 消费方通常非 TTY；即使 TTY 也不弹窗，避免提示污染 stdout 的机器可读输出
        const nonInteractive =
          Boolean(options.yes) || Boolean(options.check) || Boolean(options.refresh) || options.format === "json"
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
        // 批量安装属高风险写：非交互须显式 --yes，--dry-run 只预览
        if (options.all && !dryRun && !options.yes && !isInteractive()) {
          console.error("⚠️ 非交互环境批量安装需显式加 --yes，未执行安装")
          process.exitCode = 1
          return
        }
        // scope=all 时两面共用一次技能选择：以全局面已保存选择为基准，避免连弹两次交互
        const selectSkills = async () =>
          resolveSkillSelection(
            { ...options, skills: noSkills ? undefined : options.skills, noSkills, yes: selectionNonInteractive },
            scope.choice === "project" ? "project" : "global",
            items,
          )
        let selectionResult = await selectSkills()
        if (!selectionResult) {
          console.error(line.hint("已取消技能选择，未写入任何文件"))
          exitWithCancel()
        }
        // 三步交互：技能 → 目标 → 确认；目标页 ESC 回技能选择，确认页 ESC 回目标选择，「否」按成功退出
        let globalTargets: string[] | undefined
        let projectTargets: string[] | undefined
        for (;;) {
          globalTargets = undefined
          projectTargets = undefined
          let back = false
          if (runGlobal) {
            const chosen = await chooseGlobalTargets({ agent: options.agent, allAgents: options.allAgents, yes: selectionNonInteractive, dir: options.dir })
            if (chosen === null) back = true
            else globalTargets = chosen
          }
          if (!back && runProject) {
            if (options.agent !== undefined || options.allAgents) console.warn("⚠️ --agent / --all-agents 仅作用于全局面，项目面按项目目录选择执行")
            const chosen = await chooseProjectTargets({ dir: options.dir, yes: selectionNonInteractive })
            if (chosen === null) back = true
            else projectTargets = chosen
          }
          if (back) {
            const reselected = await selectSkills()
            if (!reselected) {
              console.error(line.hint("已取消技能选择，未写入任何文件"))
              exitWithCancel()
            }
            selectionResult = reselected
            continue
          }
          // 非交互或 JSON 输出不弹确认，避免污染 stdout
          if (nonInteractive || !isInteractive()) break
          console.log("")
          console.log("即将安装：")
          console.log(`  技能：${selectionResult.names.join("、") || "无"}`)
          if (externalSources.length > 0) console.log(`  外部来源：${externalSources.map((source) => source.path).join("、")}`)
          if (runGlobal) console.log(`  全局目标：${globalTargetSummary(globalTargets)}`)
          if (runProject) console.log(`  项目目录：${projectTargets ? projectTargets.join("、") : "按已保存选择 / 全部已存在候选目录"}`)
          const ok = await promptConfirm("确认执行安装？")
          if (ok === null) continue
          if (!ok) {
            console.log(line.hint("已取消安装，未写入任何文件"))
            return
          }
          break
        }
        const selection = selectionResult.names
        // 内容闸门开关由安装结果决定落盘时机（成功后才写），此处只计算本次取值
        const gateOption = options.gate ? true : options.embed ? false : undefined
        // --check / 非交互 --refresh：只报告待收敛项，不写文件；prepare 钩子在 CI / 非 TTY 下走这里
        const refreshReportOnly = Boolean(options.refresh) && (!isInteractive() || Boolean(process.env.CI))
        if (options.check || refreshReportOnly) {
          if (options.refresh) warnRefreshIgnored(options)
          const plans: SkillsPlanReport[] = []
          if (runGlobal) plans.push(planSkills({ skills: selection, targets: globalTargets, dirs: options.dir, externalSources, gate: gateOption }))
          if (runProject) plans.push(planProjectSkills({ cwd: process.cwd(), skills: selection, targetDirs: projectTargets, refreshOnly: Boolean(options.refresh) }))
          const pending = plans.reduce((count, plan) => count + plan.pending, 0)
          if (options.format === "json") {
            printJson({ check: Boolean(options.check), refresh: Boolean(options.refresh), scope: scope.choice, plans })
          } else {
            console.log(scopeHeadline(scope))
            console.log("")
            for (const plan of plans) printPlanReport(plan)
            if (options.check) console.log(pending > 0 ? line.error(`待收敛 ${pending} 项（退出码 1）`) : line.ok("无待收敛项"))
          }
          if (options.check && pending > 0) process.exitCode = 1
          return
        }
        // TTY 下的 --refresh：只收敛已存在的项目面产物，不新增技能、不改选择集
        if (options.refresh) {
          warnRefreshIgnored(options)
          if (runGlobal) console.warn("⚠️ --refresh 仅作用于项目面，已忽略全局面")
          const refreshed = installProjectSkills({
            dirs: options.dir,
            skills: selection,
            targetDirs: projectTargets,
            saveTargets: false,
            saveSelection: false,
            externalSources,
            mode: selectionResult.mode,
            gate: gateOption,
            refresh: true,
          })
          if (options.format === "json") printJson({ refresh: true, scope: "project", project: refreshed })
          else {
            console.log(scopeHeadline({ choice: "project", explicit: scope.explicit }))
            console.log("")
            printProjectInstallReport(refreshed, false)
          }
          return
        }
        // --dry-run 是 skills plan 的别名：只预览分发计划，不写任何文件
        if (dryRun) {
          const plan = runGlobal
            ? planSkills({ skills: selection, targets: globalTargets, dirs: options.dir, externalSources, gate: gateOption })
            : null
          const preview = runProject
            ? planProjectSkills({ cwd: process.cwd(), skills: selection, targetDirs: projectTargets })
            : null
          if (options.format === "json") printJson({ dryRun, scope: scope.choice, plan, project: preview })
          else {
            console.log(scopeHeadline(scope))
            console.log("")
            if (plan) printPlanReport(plan)
            if (preview) printPlanReport(preview)
          }
          return
        }
        // 模式切换在技能选择解析后、安装前持久化
        if (options.mode !== undefined) {
          const mode = options.mode as SkillsMode
          if (scope.choice === "global" || scope.choice === "all") writeSkillsInstallConfig({ mode })
          if (scope.choice === "project" || scope.choice === "all") writeProjectSkillsConfig({ mode })
        }
        // 降级不静默：判定为入口壳的技能以壳写入，--copy 对其无法采纳
        if (options.copy && runGlobal) {
          const deliveryConfig = gateOption === undefined ? readSkillsDeliveryConfig("global") : { rules: [] }
          const gated = selection.filter(
            (name) =>
              resolveDelivery({
                name,
                config: deliveryConfig,
                rules: gateOption !== undefined && typeof gateOption === "object" ? gateRulesToDeliveryRules(gateOption) : [],
                override: gateOption === true ? "gated" : gateOption === false ? "full" : undefined,
              }).mode === "gated",
          )
          if (gated.length > 0) console.warn(`⚠️ 分发形态为入口壳的 ${gated.join("、")} 只写入口壳，--copy 对其不生效`)
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
              gate: gateOption,
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
              gate: gateOption,
            })
          : null
        if (selection.length === 0) {
          console.log(line.hint(selectionResult.mode === "package" ? "纯包管理器模式：本次未安装任何技能" : "未选择任何技能"))
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
    .option("--explain <skill>", "解释指定技能的分发形态推导过程（只读，不受 --scope 影响）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { scope?: string; explain?: string; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        if (options.explain) {
          if (options.format === "json") printJson(explainSkillDelivery(options.explain))
          else printDeliveryExplanation(options.explain)
          return
        }
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
        // 矩阵联动只在项目面评估：全局面没有项目目录，JSON 与文本同口径输出 null / 说明
        const linkage = scope.choice === "global" ? null : analyzeSkillLinkage()
        if (options.format === "json") {
          const withUpdates = <T extends object>(report: T | null) =>
            report ? { ...report, skillsOutdated: updates.builtin.map((item) => item.name) } : null
          printJson({ scope: scope.choice, versionStatus, linkage, global: withUpdates(global), project: withUpdates(project) })
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
          }, linkage)
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
        const interactive = isInteractive() && options.format !== "json"
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
              console.log(line.hint("没有可卸载的技能"))
              return
            }
            const picked = await promptUninstallSelection(candidates)
            if (picked === null) {
              console.error(line.hint("已取消，未执行任何清理"))
              exitWithCancel()
            }
            if (picked.length === 0) {
              console.log(line.hint("未选择任何技能，未执行卸载"))
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
                  console.error(line.hint("已取消，未执行任何清理"))
                  exitWithCancel()
                }
                if (!answer) {
                  console.log(line.hint("已取消，未执行任何清理"))
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

  // 技能规范校验：只读命令，可对任意技能目录运行，供各工具仓在 verify 中复用
  skillsCmd
    .command("lint")
    .description("校验技能规范（命名 / frontmatter / 版本双写 / 篇幅 / references / 敏感信息 / 版本递增）")
    .argument("[dirs...]", "技能目录（可多个；缺省为本包 skills/）")
    .option("--dir <path>", "技能目录（可重复，与位置参数并用）", collectDir, [])
    .option("--base <ref>", "版本递增基准（git ref）；不传则不校验递增")
    .option("--budget <chars>", "入口字符硬上限（默认 12000；告警线为 2/3）")
    .option("--max-lines <n>", "入口行数硬上限（默认 200）")
    .option("--warn-lines <n>", "入口行数告警线（默认 150）")
    .option("--ignore <glob>", "跳过匹配的技能目录（可重复）", collectDir, [])
    .option("--prefix <name>", "技能目录名前缀（默认 fxri-）")
    .option("--strict", "告警按失败处理")
    .option("--json", "输出格式（等价于 --format json）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .addHelpText(
      "after",
      [
        "",
        "退出码：0 无问题、1 存在错误（或 --strict 下的告警）、2 用法错误",
        "版本递增：仅当传入 --base 且技能内容相对基准有变更时要求版本更高；git 不可用会在 stderr 说明跳过原因",
      ].join("\n"),
    )
    .action((dirs: string[], options: { dir?: string[]; base?: string; budget?: string; maxLines?: string; warnLines?: string; ignore?: string[]; prefix?: string; strict?: boolean; json?: boolean; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        const budget = parsePositiveInt(options.budget)
        const maxLines = parsePositiveInt(options.maxLines)
        const warnLines = parsePositiveInt(options.warnLines)
        if (budget === null || maxLines === null || warnLines === null) {
          console.error("⚠️ --budget / --max-lines / --warn-lines 须为正整数")
          process.exitCode = 2
          return
        }
        if (warnLines !== undefined && maxLines !== undefined && warnLines > maxLines) {
          console.error("⚠️ --warn-lines 不能大于 --max-lines")
          process.exitCode = 2
          return
        }
        if (options.base !== undefined && options.base.trim() === "") {
          console.error("⚠️ --base 不能为空；不校验递增时请不要传入")
          process.exitCode = 2
          return
        }
        const report = lintSkills({
          dirs: [...dirs, ...(options.dir ?? [])],
          base: options.base?.trim() || undefined,
          budget,
          maxLines,
          warnLines,
          ignore: options.ignore ?? [],
          prefix: options.prefix,
        })
        if (report.summary.baseSkipped) console.error(`⚠️ 跳过版本递增校验：${report.summary.baseSkipped}`)
        if (options.json || options.format === "json") printJson(report)
        else printLintReport(report)
        if (report.summary.errors > 0 || (options.strict && report.summary.warnings > 0)) process.exitCode = 1
      } catch (e) {
        console.error(`⚠️ 校验失败：${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  // 技能版本递增：只改 skills/<name>/SKILL.md 的 frontmatter 与正文首部两处版本声明
  skillsCmd
    .command("bump")
    .description("递增技能版本（两处版本声明同源改写；--all 批量、--set 直接设定、--dir 支持外部目录）")
    .argument("[name]", "技能名；与 --all 二选一")
    .argument("[type]", "patch / minor / major（缺省 patch）")
    .option("--all", "批量递增技能目录下的全部技能")
    .option("--dir <path>", "技能目录（可重复；缺省为本包 skills/）", collectDir, [])
    .option("--set <version>", "直接设定版本（与递增类型互斥）")
    .option("--from <source>", "两处版本不一致时的取值源头：frontmatter / body（缺省报错）")
    .option("--dry-run", "只打印变更，不写盘")
    .option("--yes", "批量写入时跳过确认（非交互环境必须显式给出）")
    .option("--json", "输出格式（等价于 --format json）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .addHelpText(
      "after",
      [
        "",
        "外部仓用法：toolkit skills bump --dir skills --all patch",
        "两处版本不一致时默认报错；用 --from frontmatter|body 显式选择源头后再递增",
      ].join("\n"),
    )
    .action(async (name: string | undefined, type: string | undefined, options: { all?: boolean; dir?: string[]; set?: string; from?: string; dryRun?: boolean; yes?: boolean; json?: boolean; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        if (options.all && name) {
          console.error("⚠️ --all 与显式技能名不能同时使用，未写入任何文件")
          process.exitCode = 1
          return
        }
        if (!options.all && !name) {
          console.error("⚠️ 请指定技能名，或使用 --all 批量递增，未写入任何文件")
          process.exitCode = 1
          return
        }
        const kind = type ?? "patch"
        if (!assertChoice(kind, ["patch", "minor", "major"], "递增类型", "，未写入任何文件")) return
        if (options.set && type) {
          console.error("⚠️ --set 与递增类型不能同时使用，未写入任何文件")
          process.exitCode = 1
          return
        }
        if (options.set && !isValidVersion(options.set)) {
          console.error(`⚠️ 非法版本号「${options.set}」，须为 x.y.z，未写入任何文件`)
          process.exitCode = 1
          return
        }
        if (!assertChoice(options.from, ["frontmatter", "body"], "--from", "，未写入任何文件")) return
        // 批量写按同一风险阈值：确认后再写，非交互须显式 --yes，--dry-run 只打印
        if (options.all && !options.dryRun && options.yes !== true) {
          const action = options.set ? `把全部技能的版本设为 ${options.set}` : `把全部技能按 ${kind} 递增`
          if (!isInteractive()) {
            console.error(`⚠️ 非交互环境批量${options.set ? "设定版本" : "递增"}需显式 --yes，未写入任何文件`)
            process.exitCode = 1
            return
          }
          const confirmed = await promptConfirm(`将${action}，确认继续？`)
          if (confirmed === null) {
            console.error(line.hint("已取消，未写入任何文件"))
            exitWithCancel()
          }
          if (!confirmed) {
            console.log(line.hint("已取消，未写入任何文件"))
            return
          }
        }
        const results = bumpSkillVersions({
          skillsDirs: options.dir && options.dir.length > 0 ? options.dir : [join(process.cwd(), "skills")],
          names: name ? [name] : undefined,
          all: options.all,
          type: kind as "patch" | "minor" | "major",
          set: options.set,
          from: options.from as "frontmatter" | "body" | undefined,
          dryRun: options.dryRun,
        })
        if (options.json || options.format === "json") printJson({ dryRun: Boolean(options.dryRun), skills: results })
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
          console.log(line.hint("未登记外部来源"))
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
    .option("--scope <layer>", "写入层：global（默认）/ project；此处指配置层，与安装面的 --scope 语义不同")
    .option("--layer <layer>", "写入层别名（与 --scope 等价，先按配置层术语表达）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((name: string, options: { frequency: string; scope?: string; layer?: string; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        if (options.scope !== undefined && options.layer !== undefined && options.scope !== options.layer) {
          console.error("⚠️ --scope 与 --layer 取值冲突，未修改配置")
          process.exitCode = 1
          return
        }
        const scope = options.layer ?? options.scope ?? "global"
        if (!assertChoice(scope, ["global", "project"], "--scope / --layer", "，未修改配置")) return
        const frequency = options.frequency
        if (!assertChoice(frequency, ["always", "daily", "weekly", "off"], "--frequency", "，未修改配置")) return
        if (!readSkillsInstallConfig().sources?.[name]) {
          console.error(`⚠️ 未找到已登记来源：${name}（临时来源请先用 --save 登记）`)
          process.exitCode = 1
          return
        }
        const file = writeUpdateCheckSourceNotify(name, frequency as "always" | "daily" | "weekly" | "off", scope as "global" | "project")
        if (options.format === "json") printJson({ name, frequency, scope, file })
        else console.log(line.ok(`已设置来源 ${name} 的更新提示频率为 ${frequency}（${scope}）：${file}`))
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
            if (cleaned.length > 0) console.log(line.ok(`已清理来源提示配置：${cleaned.join("、")}`))
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
        console.log(`${line.ok(`已注销来源登记：${name}`)}；${style.hint("产物与状态保留，如需清理加 --prune")}`)
      } catch (e) {
        console.error(`⚠️ 注销来源失败：${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  // 分发计划：逐技能给出目标 / 当前形态与动作，install --dry-run 的别名
  skillsCmd
    .command("plan")
    .description("预览技能分发计划（目标形态 / 当前形态 / 动作与判定来源；install --dry-run 的别名）")
    .option("--scope <scope>", "作用域（global 全局面；项目面分发形态在后续版本接入）")
    .option("--skills <names>", "只预览指定技能（逗号分隔）")
    .option("--all", "预览全部技能（含可选技能）")
    .option("--no-optional", "只预览 core 技能")
    .option("--agent <names>", "只预览指定 agent（逗号分隔，含 canonical）")
    .option("--all-agents", "预览全部已检测的 agent")
    .option("--dir <path>", "额外目标目录（可多次指定）", collectDir, [])
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action(async (options: { scope?: string; skills?: string; all?: boolean; optional?: boolean; agent?: string; allAgents?: boolean; dir: string[]; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        const scope = resolveScopeChoice(options.scope)
        if (!scope) return
        let items: SkillItem[]
        try {
          items = collectSkillItems({ dryRun: true })
        } catch (e) {
          console.error(`⚠️ 技能来源解析失败：${(e as Error).message}`)
          process.exitCode = 1
          return
        }
        // 只读预览：选择与目标都按非交互口径解析，不写入任何配置
        const runProject = scope.choice !== "global"
        const runGlobal = scope.choice !== "project"
        let globalPlan: SkillsPlanReport | null = null
        let projectPlan: SkillsPlanReport | null = null
        if (runGlobal) {
          const selection = await resolveSkillSelection(
            { skills: options.skills, all: options.all, optional: options.optional, yes: true },
            "global",
            items,
          )
          if (!selection) return
          const targets = await chooseGlobalTargets({ agent: options.agent, allAgents: options.allAgents, yes: true, dir: options.dir })
          if (targets === null) return
          globalPlan = planSkills({ skills: selection.names, targets, dirs: options.dir })
        }
        if (runProject) {
          const selection = await resolveSkillSelection(
            { skills: options.skills, all: options.all, optional: options.optional, yes: true },
            "project",
            items,
          )
          if (!selection) return
          projectPlan = planProjectSkills({ cwd: process.cwd(), skills: selection.names })
        }
        if (options.format === "json") printJson({ scope: scope.choice, global: globalPlan, project: projectPlan })
        else {
          console.log(scopeHeadline(scope))
          console.log("")
          if (globalPlan) printPlanReport(globalPlan)
          if (projectPlan) printPlanReport(projectPlan)
        }
      } catch (e) {
        console.error(`⚠️ 生成分发计划失败：${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  // 内容闸门默认形态：on / off 写 skillsDelivery.default，不覆盖已有 rules；入口壳由 install 生成或还原
  skillsCmd
    .command("gate [value]")
    .description("查看或切换内容闸门默认形态（on = 默认入口壳 / off = 默认全文；不覆盖 skillsDelivery.rules）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((value: string | undefined, options: { format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        if (value !== undefined && value !== "on" && value !== "off") {
          console.error("⚠️ gate 取值须为 on / off，未修改配置")
          process.exitCode = 1
          return
        }
        if (value !== undefined) writeSkillsDeliveryDefault(value === "on" ? "gated" : "full")
        const config = readSkillsDeliveryConfig("global")
        const enabled = config.default === "gated"
        if (options.format === "json") {
          printJson({ default: config.default ?? "full", rules: config.rules })
          return
        }
        console.log(`内容闸门：${enabled ? "已开启（默认入口壳，正文由 toolkit scope guard 下发）" : "未开启（全文安装）"}`)
        if (config.rules.length > 0) console.log(`分发规则：${config.rules.length} 条（优先级高于默认形态）`)
        console.log(
          line.hint(
            value === undefined
              ? "切换默认形态：toolkit skills gate on|off；生成入口壳：toolkit skills install"
              : "运行 toolkit skills install 生成入口壳或还原全文",
          ),
        )
      } catch (e) {
        console.error(`⚠️ 读取内容闸门失败：${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  // 批量挂载：承接原 scope mount；只扫一层、交互多选并确认后逐仓安装
  skillsCmd
    .command("mount [dir]")
    .description("在父目录下的项目里批量安装技能（交互选择项目并确认，会向所选项目写文件）")
    .option("--dry-run", "只预览，不写入")
    .action(async (dir: string | undefined, options: { dryRun?: boolean } = {}) => {
      await runInteractive(() => runScopeMount(dir, Boolean(options.dryRun)))
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
}
