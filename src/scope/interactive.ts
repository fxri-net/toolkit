// 作用域向导：状态优先菜单，覆盖名单增删、条目互转、默认值、高级规则与批量挂载
import { existsSync } from "node:fs"
import { relative } from "node:path"
import { LIST_PAGE_SIZE, requireInteractive } from "../prompts"
import { installProjectSkills, listPackageSkills } from "../skills"
import { formatChoiceLine, terminalColumns } from "../prompt-line"
import { line } from "../term-style"
import { askCheckbox, askConfirm, askInput, askSelect, reportWrite, runMenu } from "../cli-ui"
import { applyScopePlan } from "./apply"
import { layerConfigTarget, type ConfigLayer } from "./config-file"
import {
  currentActivation,
  modeLabel,
  pathKey,
  planAdd,
  planDefault,
  planManage,
  planReset,
  readScopeState,
  stringList,
  type ScopeState,
} from "./edit"
import { applyPolicyPlan, describePolicyPlan, planPolicyAdd, readPolicyState } from "./edit-policy"
import { resolveScope } from "./load"
import { matchPathPattern } from "./pattern"
import { resolveComparablePath } from "./paths"
import { scanRepositories, scanRepositoryTree, type ScanOptions } from "./plan"
import { displayPath, formatStatus } from "./print"
import type { PolicySkills, ScopeCondition } from "./types"

// 配置层人读名
const LAYER_LABEL: Record<ConfigLayer, string> = {
  global: "全局",
  project: "当前项目（随仓库共享）",
  local: "当前项目本机（不入库）",
}

// 查看当前判定
export function printScopeStatus(): void {
  const report = resolveScope()
  for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
  if (report.migrationHint) console.error(`⚠️ ${report.migrationHint}`)
  for (const text of formatStatus(report)) console.log(text)
}

// 可选配置层：固定顺序，交互与默认值共用
const LAYERS: ConfigLayer[] = ["global", "project", "local"]

// 层选择项：不可用时只显示层名，避免展示一个实际不会写入的路径（原因由禁用文案承载）
export function buildLayerChoices(startDir = process.cwd()): Array<{ name: string; value: ConfigLayer; disabled: boolean | string }> {
  return LAYERS.map((layer) => {
    const target = layerConfigTarget(layer, startDir)
    return {
      name: target.available ? `${LAYER_LABEL[layer]}（${displayPath(target.file)}）` : LAYER_LABEL[layer],
      value: layer,
      disabled: target.available ? false : target.reason,
    }
  })
}

// 选择规则归属：首步（allowExit）末位给「退出」，ESC 同样按取消返回
async function pickLayer(current?: ConfigLayer, allowExit = false): Promise<ConfigLayer | null> {
  const message = "把规则写进哪一层配置"
  const choices = buildLayerChoices()
  if (!allowExit) return askSelect({ message, choices, default: current })
  const picked = await runMenu<ConfigLayer>({ message, choices })
  return picked === "exit" || picked === "back" ? null : picked
}

// 空列表显示「未配置」
function displayList(items: string[]): string {
  return items.length > 0 ? items.join("、") : "未配置"
}

// 技能级规则摘要：只显示键与覆盖模式
function skillSummary(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "未配置"
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return "未配置"
  return entries
    .map(([key, rule]) => {
      const mode = rule && typeof rule === "object" && !Array.isArray(rule) ? (rule as Record<string, unknown>).mode : undefined
      return `${key}（${typeof mode === "string" ? mode : "继承"}）`
    })
    .join("、")
}

// 菜单头部：层、配置文件、默认值与两列表条数
function printStateHeader(state: ScopeState): void {
  console.log("")
  console.log(`作用域 · ${LAYER_LABEL[state.layer]}`)
  console.log(`配置来源：${displayPath(state.target.file)}`)
  console.log(`名单模式：${modeLabel(state.mode)}　白名单 ${state.include.length}　黑名单 ${state.exclude.length}`)
  console.log(
    line.hint(
      "内容闸门：toolkit config set skillDelivery.default gated（入口壳）/ full（全文）；单次用 toolkit skill install --gate / --embed；批量挂载用 toolkit skill mount",
    ),
  )
}

// 规则清单 / 高级规则详情
function printStateDetails(state: ScopeState, advanced = false): void {
  const activation = currentActivation(state.config)
  const markers = activation.markers && typeof activation.markers === "object" && !Array.isArray(activation.markers)
    ? (activation.markers as Record<string, unknown>)
    : {}
  console.log(`配置来源：${displayPath(state.target.file)}`)
  console.log(`名单模式：${modeLabel(state.mode)}`)
  console.log(`白名单：${displayList(state.include)}`)
  console.log(`黑名单：${displayList(state.exclude)}`)
  console.log(`启用标记：${displayList(stringList(markers.include))}`)
  console.log(`排除标记：${displayList(stringList(markers.exclude))}`)
  console.log(`git 远端：${displayList(stringList(activation.gitRemotes))}`)
  console.log(`技能级规则：${skillSummary(activation.skills)}`)
  if (advanced) console.log(line.hint("高级规则只读：复制配置路径后自行编辑，保存后运行 toolkit scope status 校验"))
}

// 扫描范围可开启项：按当前跳过计数生成，结果页与空结果页复用同一套文案
export function scanRangeChoices(
  hiddenCount: number,
  nestedCount: number,
): Array<{ name: string; value: "hidden" | "nested" }> {
  const choices: Array<{ name: string; value: "hidden" | "nested" }> = []
  if (hiddenCount > 0) choices.push({ name: "扫描隐藏目录（以 . 开头）", value: "hidden" })
  if (nestedCount > 0) choices.push({ name: "展开仓库内部，查找嵌套仓库", value: "nested" })
  return choices
}

// 扫描父目录并多选项目：0 结果时就地提供下探 / 隐藏 / 嵌套选项
async function pickFromScan(): Promise<string[] | null> {
  const input = await askInput({ message: "要扫描的父目录（多个用逗号或换行分隔）", default: process.cwd() })
  if (input === null) return null
  const requested = input
    .split(/[,，;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
  const parents = (requested.length > 0 ? requested : [process.cwd()]).filter((parent) => {
    if (existsSync(parent)) return true
    console.error(`⚠️ 目录不存在：${parent}`)
    return false
  })
  if (parents.length === 0) return null
  let options: ScanOptions = {}
  for (;;) {
    const results = parents.map((parent) => scanRepositoryTree(parent, options))
    const truncated = results.find((result) => result.truncated)?.truncated
    if (truncated) console.warn(`⚠️ 扫描未完成：${truncated}；可缩小范围或继续下探`)
    const seen = new Set<string>()
    let repos = results
      .flatMap((result) => result.repos)
      .filter((repo) => {
        const key = pathKey(repo.path)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    if (repos.length === 0) {
      const next = await runMenu<string>({
        message: "没找到仓库，接下来怎么做",
        back: true,
        choices: [
          { name: "下探更深", value: "deeper" },
          { name: "扫描隐藏目录（以 . 开头）", value: "hidden" },
          { name: "展开仓库内部，查找嵌套仓库", value: "nested" },
        ],
      })
      if (next === "back" || next === "exit") return null
      if (next === "deeper") options = { ...options, maxDepth: (options.maxDepth ?? 8) + 8 }
      if (next === "hidden") options = { ...options, hidden: true }
      if (next === "nested") options = { ...options, nested: true }
      continue
    }
    // 结果页固定展示跳过统计：让用户知道还有目录未被纳入，而不是只在空结果时提示
    const skipped = results.flatMap((result) => result.skipped)
    const hiddenCount = skipped.filter((item) => item.reason === "隐藏目录").length
    const depCount = skipped.filter((item) => item.reason === "依赖 / 产物目录").length
    const nestedCount = results.reduce((sum, result) => sum + result.nestedPruned, 0)
    console.log(line.hint(`已跳过：隐藏目录 ${hiddenCount} 个、依赖 / 产物目录 ${depCount} 个、未展开的仓库内部 ${nestedCount} 个`))
    // 有可开启项就给出入口；隐藏目录与嵌套仓库可先后开启，直到用户选择按当前范围继续
    const rangeChoices = scanRangeChoices(hiddenCount, nestedCount)
    if (rangeChoices.length > 0) {
      const scopeChoice = await runMenu<string>({
        message: "扫描范围",
        back: true,
        choices: [...rangeChoices, { name: "按当前范围继续", value: "keep" }],
      })
      if (scopeChoice === "back" || scopeChoice === "exit") return null
      if (scopeChoice === "hidden") {
        options = { ...options, hidden: true }
        continue
      }
      if (scopeChoice === "nested") {
        options = { ...options, nested: true }
        continue
      }
    }
    if (repos.length > 30) {
      const keyword = await askInput({ message: `发现 ${repos.length} 个项目，可输入关键字过滤（留空不过滤）`, default: "" })
      if (keyword === null) return null
      const needle = keyword.trim().toLowerCase()
      if (needle) repos = repos.filter((repo) => repo.name.toLowerCase().includes(needle) || repo.path.toLowerCase().includes(needle))
    }
    const columns = terminalColumns()
    const picked = await askCheckbox({
      message: `选择项目（共 ${repos.length} 个，空格切换，回车确认）`,
      choices: repos.map((repo) => {
        const relative = relativeToParents(parents, repo.path)
        const label = `${repo.name} · ${relative}`
        return {
          name: formatChoiceLine({
            name: label,
            description: repo.kind === "npm" ? "非 git" : undefined,
            reserved: 5,
            columns,
            path: true,
          }),
          short: label,
          value: repo.path,
          checked: false,
        }
      }),
      pageSize: LIST_PAGE_SIZE,
    })
    if (picked === null) return null
    return picked
  }
}

// 展示用相对路径：取包含该仓库的最短父目录前缀
function relativeToParents(parents: string[], target: string): string {
  const matched = parents
    .map((parent) => relative(parent, target))
    .filter((item) => item && !item.startsWith(".."))
    .sort((left, right) => left.length - right.length)[0]
  return matched || target
}

// 手动输入目录：支持逗号 / 分号 / 换行分隔与 ~ 展开
async function pickManual(): Promise<string[] | null> {
  const answer = await askInput({ message: "输入目录（绝对路径或 ~，多个用逗号分隔）", default: "" })
  if (answer === null) return null
  return answer
    .split(/[,，;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

// 加入白 / 黑名单：先选目标侧，再选来源
async function addFlow(state: ScopeState, list: "include" | "exclude"): Promise<void> {
  const source = await runMenu<string>({
    message: list === "include" ? "从哪里选要加入白名单的目录" : "从哪里选要加入黑名单的目录",
    back: true,
    choices: [
      { name: "扫描项目选择", value: "scan" },
      { name: "手动输入目录", value: "manual" },
      { name: "使用当前目录", value: "cwd" },
    ],
  })
  if (source === "back" || source === "exit") return
  const dirs = source === "scan" ? await pickFromScan() : source === "manual" ? await pickManual() : [process.cwd()]
  if (dirs === null) return
  if (dirs.length === 0) {
    console.log(line.hint("未选择目录，已取消"))
    return
  }
  const scope = await runMenu<string>({
    message: "生效范围",
    back: true,
    choices: [
      { name: "该目录及所有子目录（推荐）", value: "tree" },
      { name: "仅该目录", value: "dir" },
    ],
  })
  if (scope === "back" || scope === "exit") return
  await applyScopePlan(
    list === "include" ? "作用域：加入白名单" : "作用域：加入黑名单",
    planAdd(state, list, dirs, state.startDir, scope === "tree"),
  )
}

// 条目现场：路径是否存在、是否被同层其它规则覆盖
interface EntryRow {
  value: string
  label: string
}

// 合并两列表为一次性可勾选清单，值带侧别前缀避免同名冲突
function collectEntries(state: ScopeState): EntryRow[] {
  const baseDir = state.target.root ?? state.startDir
  const all = [...state.include, ...state.exclude]
  const rows: EntryRow[] = []
  for (const [list, items] of [
    ["include", state.include],
    ["exclude", state.exclude],
  ] as const) {
    for (const path of items) {
      const coveredBy =
        all
          .filter((other) => other !== path && matchPathPattern(path, other, { baseDir }))
          .sort((left, right) => left.length - right.length)[0] ?? null
      const missing = existsSync(resolveComparablePath(path, baseDir)) ? "" : "（路径不存在）"
      const covered = coveredBy ? `（已被 ${coveredBy} 覆盖）` : ""
      rows.push({ value: `${list}::${path}`, label: `${list === "include" ? "[白]" : "[黑]"} ${path}${missing}${covered}` })
    }
  }
  return rows
}

// 管理条目：勾选后移出或转到另一侧
async function manageFlow(state: ScopeState): Promise<void> {
  const entries = collectEntries(state)
  if (entries.length === 0) {
    console.log(line.hint("当前没有条目"))
    return
  }
  const picked = await askCheckbox({
    message: "选择条目（空格切换，回车确认）",
    choices: entries.map((entry) => ({ name: entry.label, value: entry.value })),
    pageSize: LIST_PAGE_SIZE,
  })
  if (picked === null || picked.length === 0) return
  const action = await runMenu<string>({
    message: "对选中的条目做什么",
    back: true,
    choices: [
      { name: "移出名单", value: "remove" },
      { name: "转到另一侧", value: "flip" },
    ],
  })
  if (action === "back" || action === "exit") return
  const dirs = picked.map((value) => value.slice(value.indexOf("::") + 2))
  await applyScopePlan(action === "remove" ? "作用域：移除条目" : "作用域：转到另一侧", planManage(state, dirs, action === "flip" ? "flip" : "remove"))
}

// 切换默认值
async function defaultFlow(state: ScopeState): Promise<void> {
  const choice = await runMenu<string>({
    message: `名单外目录的处理（当前：${modeLabel(state.mode)}）`,
    back: true,
    choices: [
      { name: "全部生效", value: "on" },
      { name: "仅名单内生效", value: "off" },
    ],
  })
  if (choice === "back" || choice === "exit") return
  await applyScopePlan("作用域：切换默认值", planDefault(state, choice === "on"))
}

// 清除限制
async function resetFlow(state: ScopeState): Promise<void> {
  await applyScopePlan("作用域：清除限制", planReset(state))
}

// 批量挂载：扫描父目录一层、多选仓库、显式确认后逐仓安装（会向项目写文件）
export async function runScopeMount(parent?: string, dryRun = false): Promise<void> {
  if (!requireInteractive({ action: "批量挂载", hint: "请在交互终端运行；挂载需要逐个项目确认" })) return
  const root = parent ?? process.cwd()
  if (!existsSync(root)) {
    console.error(`⚠️ 目录不存在：${root}`)
    process.exitCode = 1
    return
  }
  // 挂载沿用一层扫描，避免把技能写进深层项目
  const repos = scanRepositories(root)
  if (repos.length === 0) {
    console.log(line.hint("未发现仓库（按 .git / package.json / .tasks 识别）"))
    return
  }
  const picked = await askCheckbox({
    message: "选择要安装技能的项目（会把技能文件写入这些项目）",
    choices: repos.map((repo) => ({ name: repo.name, value: repo.path })),
    pageSize: LIST_PAGE_SIZE,
  })
  if (picked === null) return
  if (picked.length === 0) {
    console.log(line.hint("未选择项目，已取消"))
    return
  }
  if (!dryRun) {
    const confirmed = await askConfirm({
      message: `将向 ${picked.length} 个项目写入技能真源 / 薄壳 / 状态账（可能含项目配置），继续？`,
      default: false,
    })
    if (confirmed === null || !confirmed) return
  }
  const skills = listPackageSkills()
    .filter((skill) => skill.tier === "core")
    .map((skill) => skill.name)
  for (const repo of picked) {
    if (dryRun) {
      console.log(`[预演] 将安装到 ${repo}（技能 ${skills.length} 个）`)
      continue
    }
    try {
      const report = installProjectSkills({ cwd: repo, skills, mode: "skills", saveSelection: true, saveTargets: true })
      console.log(`✔ ${report.root}：技能 ${report.selection.length} 个，项目面薄壳 ${report.shells.length} 个`)
    } catch (error) {
      console.error(`⚠️ ${repo}：${(error as Error).message}`)
    }
  }
}

// 分隔输入：逗号 / 分号 / 换行统一拆分
function splitList(value: string): string[] {
  return value
    .split(/[,，;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

// 条件摘要：矩阵预览用
function describeCondition(when: ScopeCondition): string {
  const parts: string[] = []
  if (when.paths?.length) parts.push(`路径 ${when.paths.join("、")}`)
  if (when.subpaths?.length) parts.push(`子路径 ${when.subpaths.join("、")}`)
  if (when.markers?.length) parts.push(`标记 ${when.markers.join("、")}`)
  if (when.gitRemotes?.length) parts.push(`远端 ${when.gitRemotes.join("、")}`)
  return parts.join("；") || "全部目录"
}

// 技能维度摘要：矩阵预览用
function describeMatrixSkills(mode: "allowlist" | "denylist", profiles: string[], skills: string[]): string {
  if (mode === "allowlist") {
    return `只允许 ${[profiles.length ? `档案 ${profiles.join("、")}` : "", skills.join("、")].filter(Boolean).join("、")}`
  }
  return `排除 ${skills.join("、")}`
}

// 矩阵作用范围：当前项目 / 手动输入项目与子路径 / 扫描选择
async function pickMatrixWhen(state: ScopeState): Promise<ScopeCondition | null> {
  const source = await runMenu<string>({
    message: "这条技能规则作用于哪些目录",
    back: true,
    choices: [
      { name: "当前项目", value: "cwd" },
      { name: "手动输入项目与子路径", value: "manual" },
      { name: "扫描选择项目", value: "scan" },
    ],
  })
  if (source === "back" || source === "exit") return null
  if (source === "cwd") return { paths: [state.target.root ?? state.startDir] }
  if (source === "manual") {
    const project = await askInput({ message: "项目根目录（留空用当前目录）", default: "" })
    if (project === null) return null
    const subpath = await askInput({ message: "子路径（相对项目根，留空表示整个项目）", default: "" })
    if (subpath === null) return null
    const when: ScopeCondition = {
      paths: [resolveComparablePath(project.trim() || state.startDir, state.startDir)],
    }
    if (subpath.trim()) when.subpaths = [subpath.trim()]
    return when
  }
  const picked = await pickFromScan()
  if (!picked || picked.length === 0) return null
  return { paths: picked }
}

// 技能矩阵：在指定层内按技能维度生成一条策略，复用策略计划与写盘
async function skillMatrixFlow(state: ScopeState): Promise<void> {
  let current: ReturnType<typeof readPolicyState>
  try {
    current = readPolicyState(state.layer, state.startDir)
  } catch (error) {
    console.error(`⚠️ ${(error as Error).message}`)
    return
  }
  console.log("")
  console.log(`技能矩阵 · ${LAYER_LABEL[state.layer]}`)
  console.log(`配置：${displayPath(state.target.file)}`)
  console.log(`已有策略：${current.raw.length} 条　档案：${Object.keys(current.profiles).length} 个`)

  let when: ScopeCondition | null = null
  let mode: "allowlist" | "denylist" | null = null
  let selection: { skills: string[]; profiles: string[] } | null = null
  for (;;) {
    if (!when) {
      when = await pickMatrixWhen(state)
      if (!when) return
    }
    if (!mode) {
      const value = await runMenu<string>({
        message: "技能怎么放行",
        back: true,
        choices: [
          { name: "只允许列出的技能", value: "allowlist" },
          { name: "全部允许，只排除列出的技能", value: "denylist" },
        ],
      })
      if (value === "back") {
        when = null
        continue
      }
      if (value === "exit") return
      if (value !== "allowlist" && value !== "denylist") continue
      mode = value
    }
    if (!selection) {
      const profiles = resolveScope(state.startDir).profiles
      const columns = terminalColumns()
      const choices: Array<{ name: string; value: string; short?: string }> = []
      if (mode === "allowlist") {
        for (const profile of profiles) {
          const label = `[档案] ${profile.name}（允许 ${profile.allow.length} 项）`
          choices.push({ name: label, value: `profile::${profile.name}`, short: label })
        }
      }
      for (const skill of listPackageSkills()) {
        const label = `[技能] ${skill.name}`
        choices.push({
          name: formatChoiceLine({ name: label, description: skill.description, reserved: 5, columns }),
          short: label,
          value: `skill::${skill.name}`,
        })
      }
      if (choices.length === 0) {
        console.log(
          line.hint(
            mode === "allowlist"
              ? "没有可用技能或档案：请先安装技能，或用 toolkit scope profile 创建档案"
              : "没有可用技能：请先安装技能",
          ),
        )
        return
      }
      const picked = await askCheckbox({
        message: "选择技能或技能档案（空格切换，回车确认）",
        choices,
        pageSize: LIST_PAGE_SIZE,
      })
      if (picked === null) {
        mode = null
        continue
      }
      if (picked.length === 0) {
        console.log(line.hint("未选择技能，已取消"))
        return
      }
      selection = {
        skills: picked.filter((value) => value.startsWith("skill::")).map((value) => value.slice("skill::".length)),
        profiles: picked
          .filter((value) => value.startsWith("profile::"))
          .map((value) => value.slice("profile::".length)),
      }
    }

    const markers = await askInput({ message: "启用标记文件名（逗号分隔，留空跳过）", default: "" })
    if (markers === null) {
      selection = null
      continue
    }
    const remotes = await askInput({ message: "git 远端（逗号分隔，留空跳过）", default: "" })
    if (remotes === null) {
      selection = null
      continue
    }
    const condition: ScopeCondition = { ...when }
    if (markers.trim()) condition.markers = splitList(markers)
    if (remotes.trim()) condition.gitRemotes = splitList(remotes)
    const skillsConfig: PolicySkills =
      mode === "allowlist"
        ? {
            mode: "allowlist",
            ...(selection.skills.length > 0 ? { allow: selection.skills } : {}),
            ...(selection.profiles.length > 0 ? { profiles: selection.profiles } : {}),
          }
        : { mode: "denylist", deny: selection.skills }

    console.log(`范围：${describeCondition(condition)}`)
    console.log(`技能：${describeMatrixSkills(mode, selection.profiles, selection.skills)}`)
    let plan: ReturnType<typeof planPolicyAdd>
    try {
      plan = planPolicyAdd(readPolicyState(state.layer, state.startDir), {
        name: "技能矩阵",
        effect: "allow",
        when: condition,
        skills: skillsConfig,
      })
    } catch (error) {
      console.error(`⚠️ ${(error as Error).message}`)
      selection = null
      continue
    }
    console.log("")
    console.log("作用域：技能矩阵")
    for (const text of describePolicyPlan(plan)) console.log(`  ${text}`)
    const confirmed = await askConfirm({ message: "继续写入？", default: true })
    if (confirmed === null) {
      selection = null
      continue
    }
    if (!confirmed) return
    const file = applyPolicyPlan(plan)
    reportWrite({ file, notes: plan.changes })
    return
  }
}

// 无参入口：状态优先菜单，循环直到退出
export async function runScopeInteractive(): Promise<void> {
  if (!requireInteractive({ action: "作用域向导", hint: "非交互请使用 toolkit scope status / list / add / exclude / remove / default / reset" })) return
  let layer = await pickLayer(undefined, true)
  if (!layer) return
  for (;;) {
    const state = readScopeState(layer)
    printStateHeader(state)
    const choices: Array<{ name: string; value: string }> = []
    if (state.layer !== "global") {
      choices.push(
        { name: "仅本项目生效", value: "project-on" },
        { name: "在本项目内排除（本项目不生效）", value: "project-off" },
      )
    }
    choices.push(
      { name: "查看状态", value: "status" },
      { name: "查看名单与策略", value: "list" },
      { name: "添加白名单…", value: "add-include" },
      { name: "添加黑名单…", value: "add-exclude" },
      { name: "管理条目（移除 / 互转）…", value: "manage" },
      { name: `修改名单外目录的处理（当前：${modeLabel(state.mode)}）…`, value: "default" },
      { name: "清除限制", value: "reset" },
      { name: "高级规则（标记 / git 远端 / 技能级）", value: "advanced" },
      { name: "技能矩阵（按技能维度限制）…", value: "matrix" },
      { name: "切换配置层…", value: "layer" },
    )
    const action = await runMenu({ message: "下一步做什么", choices })
    if (action === "exit") return
    if (action === "status") printScopeStatus()
    else if (action === "list") printStateDetails(state)
    else if (action === "add-include") await addFlow(state, "include")
    else if (action === "add-exclude") await addFlow(state, "exclude")
    else if (action === "manage") await manageFlow(state)
    else if (action === "default") await defaultFlow(state)
    else if (action === "reset") await resetFlow(state)
    else if (action === "advanced") printStateDetails(state, true)
    else if (action === "matrix") await skillMatrixFlow(state)
    else if (action === "layer") {
      const next = await pickLayer(layer)
      if (next) layer = next
    } else if (action === "project-on") {
      await applyScopePlan("作用域：仅本项目生效", planAdd(state, "include", [state.target.root ?? state.startDir], state.startDir))
    } else if (action === "project-off") {
      await applyScopePlan("作用域：在本项目内排除", planAdd(state, "exclude", [state.target.root ?? state.startDir], state.startDir))
    }
  }
}
