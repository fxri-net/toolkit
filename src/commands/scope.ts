// scope 命令：状态与规则清单只读；向导、目录增删与批量挂载在 TTY 下交互
import { existsSync } from "node:fs"
import type { Command } from "commander"
import { resolveScope } from "../scope"
import { runGuard } from "../scope/guard"
import { formatList, formatStatus, plainIncludeHint } from "../scope/print"
import { isInteractive, runInteractive } from "../prompts"
import { isLiteralPath, resolveComparablePath, toTreePattern } from "../scope/paths"
import { runScopeWizard } from "../scope/wizard"
import { line, policyEffectText, policyLayerText, scopeModeText, termText } from "../term-style"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { printJson } from "./shared"
import { assertChoice, confirmWrite, fail } from "../cli-ui"
import { describePlan, modeLabel, planAdd, planDefault, planRemove, planReset, readScopeState, type ScopeList, type RemoveFrom } from "../scope/edit"
import { applyScopePlan } from "../scope/apply"
import { isLegacyPolicyId } from "../scope/policy"
import { deliveryModeLabel } from "../skills/delivery"
import { analyzeSkillLinkage, formatLinkageHints, listInstalledSkillNames } from "../scope/linkage"
import {
  POLICY_LAYERS,
  applyPolicyPlanWithPrompt,
  describePolicyPlan,
  listProfilesInLayer,
  planPolicyAdd,
  planPolicyRemove,
  planPolicyReset,
  planProfileRemove,
  planProfileUpsert,
  planSkillReset,
  profileAllowPatterns,
  readPolicyState,
} from "../scope/edit-policy"
import type { PolicyDelivery, PolicyLayer, PolicySkills, ScopeCondition } from "../scope/types"

// 配置层取值
const LAYERS = ["global", "project", "local"] as const

// 解析 --layer：缺省全局，非法值统一报错
function resolveLayer(value?: string): (typeof LAYERS)[number] | null {
  const layer = (value ?? "global") as (typeof LAYERS)[number]
  return assertChoice(layer, LAYERS, "--layer") ? layer : null
}

// 策略层解析：额外记录用户是否显式传了 --layer（--name 删除歧义判定用）
function resolvePolicyLayer(value?: string): { layer: PolicyLayer; explicit: boolean } | null {
  const layer = (value ?? "global") as PolicyLayer
  if (!assertChoice(layer, POLICY_LAYERS, "--layer")) return null
  return { layer, explicit: value !== undefined }
}

// 从命令选项组装 when：未写的字段不进入配置
function buildWhen(options: {
  paths?: string[]
  subpaths?: string[]
  markers?: string[]
  gitRemotes?: string[]
  tree?: boolean
}): ScopeCondition | undefined {
  const when: ScopeCondition = {}
  if (options.paths?.length) when.paths = options.tree ? options.paths.map(toTreePattern) : options.paths
  if (options.subpaths?.length) when.subpaths = options.subpaths
  if (options.markers?.length) when.markers = options.markers
  if (options.gitRemotes?.length) when.gitRemotes = options.gitRemotes
  return Object.keys(when).length > 0 ? when : undefined
}

// 条件人读：只列已写字段
function describeWhen(when: ScopeCondition | undefined): string {
  if (!when) return ""
  const parts: string[] = []
  if (when.paths?.length) parts.push(`路径 ${when.paths.join("、")}`)
  if (when.subpaths?.length) parts.push(`子路径 ${when.subpaths.join("、")}`)
  if (when.markers?.length) parts.push(`标记 ${when.markers.join("、")}`)
  if (when.gitRemotes?.length) parts.push(`远端 ${when.gitRemotes.join("、")}`)
  return parts.join("；")
}

// 技能维度人读
function describeSkills(skills: PolicySkills | undefined): string {
  if (!skills) return ""
  const parts: string[] = []
  if (skills.match?.length) parts.push(`技能 ${skills.match.join("、")}`)
  if (skills.mode) parts.push(`名单模式 ${termText(scopeModeText, skills.mode)}`)
  if (skills.profiles?.length) parts.push(`档案 ${skills.profiles.join("、")}`)
  if (skills.allow?.length) parts.push(`允许 ${skills.allow.join("、")}`)
  if (skills.deny?.length) parts.push(`拒绝 ${skills.deny.join("、")}`)
  return parts.join("；")
}

// 策略形态人读：未声明时不打印，避免与推导结论混淆
function describeDelivery(delivery: PolicyDelivery | undefined): string {
  return delivery ? `形态：${deliveryModeLabel(delivery)}` : ""
}

// 当前命中判定：matchedRule 为 policy:<id>，兼容带 name 的旧形态
function isWinner(matchedRule: string | null, id: string): boolean {
  if (!matchedRule?.startsWith("policy:")) return false
  const rest = matchedRule.slice("policy:".length)
  return (rest.split(/[ （(]/)[0] ?? "") === id
}

// 移除策略：--id 优先，--name 仅在该层唯一且无跨层同名时可用
async function runPolicyRemove(options: {
  id?: string
  name?: string
  layer?: string
  dryRun?: boolean
  yes?: boolean
}): Promise<void> {
  const resolved = resolvePolicyLayer(options.layer)
  if (!resolved) return
  if (!options.id && !options.name) {
    fail("请指定 --id 或 --name；未写入配置")
    return
  }
  try {
    const plan = planPolicyRemove(
      readPolicyState(resolved.layer),
      { id: options.id, name: options.name },
      resolved.explicit,
    )
    await applyPolicyPlanWithPrompt("作用域策略：移除", plan, options)
  } catch (error) {
    fail((error as Error).message)
  }
}

// 清除策略：按 id / 路径批量移除，整层清空须 --all --yes
async function runPolicyReset(options: {
  id?: string[]
  paths?: string[]
  all?: boolean
  layer?: string
  dryRun?: boolean
  yes?: boolean
}): Promise<void> {
  const resolved = resolvePolicyLayer(options.layer)
  if (!resolved) return
  try {
    const plan = planPolicyReset(readPolicyState(resolved.layer), {
      ids: options.id,
      paths: options.paths,
      all: options.all,
      confirmed: Boolean(options.yes) || Boolean(options.dryRun),
    })
    await applyPolicyPlanWithPrompt("作用域策略：清除", plan, options)
  } catch (error) {
    fail((error as Error).message)
  }
}

// 策略清单：来源层、条件、技能维度与当前目录命中结果
function runPolicyList(options: { at?: string; format?: string }): void {
  if (!assertJsonFormat(options.format)) return
  const report = resolveScope(options.at)
  for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
  if (options.format === "json") {
    printJson(
      jsonEnvelope({
        command: "scope status",
        data: {
          at: report.context.cwd,
          baseDir: report.decision.baseDir,
          active: report.decision.active,
          matchedRule: report.decision.matchedRule,
          reason: report.decision.reason,
          policies: report.policies.map((policy) => ({
            ...policy,
            legacy: isLegacyPolicyId(policy.id),
          })),
        },
      }),
    )
    return
  }
  console.log("作用域策略：")
  console.log(`  当前目录：${report.context.cwd}`)
  console.log(`  结果：${report.decision.active ? "生效" : "未生效"}（${report.decision.reason}）`)
  if (report.policies.length === 0) {
    console.log("  未配置策略")
    return
  }
  for (const policy of report.policies) {
    const legacy = isLegacyPolicyId(policy.id)
    const legacyTag = legacy ? " · 由名单配置生成，只读" : ""
    const winner = isWinner(report.decision.matchedRule, policy.id) ? " ← 当前命中" : ""
    const name = policy.name ? `（${policy.name}）` : ""
    const label = legacy ? (policy.name ?? "名单规则") : `${policy.id}${name}`
    const layer = termText(policyLayerText, policy.layer ?? "global")
    const effect = termText(policyEffectText, policy.effect ?? "allow")
    console.log(`  ${layer} ${label} ${effect}${legacyTag}${winner}`)
    const when = describeWhen(policy.when)
    if (when) console.log(`    条件：${when}`)
    const skills = describeSkills(policy.skills)
    if (skills) console.log(`    技能：${skills}`)
    const delivery = describeDelivery(policy.delivery)
    if (delivery) console.log(`    ${delivery}`)
  }
  if (report.policies.some((policy) => isLegacyPolicyId(policy.id))) {
    console.log(line.hint("名单规则由 activation 配置生成，只读；请用 toolkit scope allow / deny / default / reset 修改"))
  }
}

// 目录名单视图：status --lists 与旧 list 视图共用同一份输出
function runScopeList(options: { format?: string } = {}): void {
  if (!assertJsonFormat(options.format)) return
  const report = resolveScope()
  for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
  const activation = report.activation
  const include = activation?.include ?? []
  const exclude = activation?.exclude ?? []
  // glob / re: 规则不是真实路径，存在性检查跳过，避免误报「路径不存在」
  const entryState = (path: string) => !isLiteralPath(path) || existsSync(resolveComparablePath(path, report.decision.baseDir))
  const items = [
    ...include.map((path) => ({ path, list: "include", exists: entryState(path) })),
    ...exclude.map((path) => ({ path, list: "exclude", exists: entryState(path) })),
  ]
  if (options.format === "json") {
    printJson(
      jsonEnvelope({
        command: "scope status",
        data: {
          configured: Boolean(activation),
          sourceFile: report.decision.sourceFile,
          baseDir: report.decision.baseDir,
          mode: report.decision.mode,
          include,
          exclude,
          markers: activation?.markers ?? { include: [], exclude: [] },
          gitRemotes: activation?.gitRemotes ?? [],
          skills: activation?.skills ?? {},
          items,
        },
      }),
    )
    return
  }
  for (const text of formatList(report)) console.log(text)
  const treeHint = plainIncludeHint(report)
  if (treeHint) console.log(line.hint(treeHint))
  const missing = items.filter((item) => !item.exists)
  if (missing.length > 0) console.log(line.hint(`  条目异常：${missing.map((item) => item.path).join("、")}（路径不存在）`))
}

// 档案：省略名称时列出，--remove 删除，其余整份写入
async function runSkillsProfile(
  name: string | undefined,
  options: { allow?: string[]; deny?: string[]; remove?: boolean; layer?: string; dryRun?: boolean; yes?: boolean },
): Promise<void> {
  const resolved = resolvePolicyLayer(options.layer)
  if (!resolved) return
  try {
    if (!name) {
      if (options.allow?.length || options.deny?.length || options.remove) {
        fail("请指定档案名；未写入配置")
        return
      }
      if (resolved.explicit) {
        const layerProfiles = listProfilesInLayer(readPolicyState(resolved.layer))
        console.log(`技能档案（${resolved.layer} 层）：`)
        if (layerProfiles.length === 0) {
          console.log("  未配置")
          return
        }
        for (const profile of layerProfiles) {
          const parts: string[] = []
          if (profile.allow.length) parts.push(`allow=${profile.allow.join(",")}`)
          if (profile.deny.length) parts.push(`deny=${profile.deny.join(",")}`)
          console.log(`  ${profile.name}：${parts.join("；") || "空档案"}`)
        }
        return
      }
      const report = resolveScope()
      for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
      console.log("技能档案（合并视图）：")
      if (report.profiles.length === 0) {
        console.log("  未配置")
        return
      }
      for (const profile of report.profiles) {
        const parts: string[] = []
        if (profile.allow.length) parts.push(`allow=${profile.allow.join(",")}`)
        if (profile.deny.length) parts.push(`deny=${profile.deny.join(",")}`)
        console.log(`  ${profile.name}（${profile.layer}）：${parts.join("；") || "空档案"}`)
      }
      return
    }
    if (options.remove) {
      if (!options.yes && !options.dryRun) {
        fail("移除档案需加 --yes 确认；未写入配置")
        return
      }
      const plan = planProfileRemove(readPolicyState(resolved.layer), name)
      await applyPolicyPlanWithPrompt("作用域技能：移除档案", plan, options)
      return
    }
    const plan = planProfileUpsert(readPolicyState(resolved.layer), {
      name,
      allow: options.allow,
      deny: options.deny,
    })
    await applyPolicyPlanWithPrompt("作用域技能：写入档案", plan, options)
  } catch (error) {
    fail((error as Error).message)
  }
}

// 清除该层全部技能维度策略
async function runSkillsReset(options: { layer?: string; dryRun?: boolean; yes?: boolean }): Promise<void> {
  const resolved = resolvePolicyLayer(options.layer)
  if (!resolved) return
  try {
    const plan = planSkillReset(readPolicyState(resolved.layer), Boolean(options.yes) || Boolean(options.dryRun))
    await applyPolicyPlanWithPrompt("作用域技能：清除技能策略", plan, options)
  } catch (error) {
    fail((error as Error).message)
  }
}

// 加入白 / 黑名单或写入策略：条件选项任一出现即写策略，否则写目录名单
export interface EntryOptions {
  skill?: string[]
  profile?: string[]
  paths?: string[]
  subpaths?: string[]
  markers?: string[]
  gitRemotes?: string[]
  delivery?: string
  tree?: boolean
  name?: string
  id?: string
  layer?: string
  dryRun?: boolean
  yes?: boolean
  noLink?: boolean
}

// 条件选项出现即走策略：技能 / 档案 / 路径条件 / 标记 / 远端 / 形态
export function hasPolicyConditions(options: EntryOptions): boolean {
  return Boolean(
    options.skill?.length ||
      options.profile?.length ||
      options.paths?.length ||
      options.subpaths?.length ||
      options.markers?.length ||
      options.gitRemotes?.length ||
      options.delivery !== undefined,
  )
}

// 允许策略的技能维度：点名技能或档案时为仅名单内生效，否则整段允许
export function allowSkills(options: EntryOptions): PolicySkills | undefined {
  const allow = options.skill ?? []
  const profiles = options.profile ?? []
  if (allow.length === 0 && profiles.length === 0) return undefined
  const skills: PolicySkills = { mode: "allowlist" }
  if (allow.length > 0) skills.allow = allow
  if (profiles.length > 0) skills.profiles = profiles
  return skills
}

// 拒绝策略的技能维度：档案展开为允许清单后一并排除；未点名即拒绝该范围全部技能
export function denySkills(options: EntryOptions, layer: PolicyLayer): PolicySkills | undefined {
  const match = [...(options.skill ?? []), ...profileAllowPatterns(process.cwd(), options.profile ?? [], layer)]
  return match.length > 0 ? { match } : undefined
}

async function runEntryWrite(effect: "allow" | "deny", dirs: string[], options: EntryOptions): Promise<void> {
  const resolved = resolvePolicyLayer(options.layer)
  if (!resolved) return
  // 无条件选项：写目录名单（白名单 / 黑名单），与策略写入共用同一预览与联动
  if (!hasPolicyConditions(options)) {
    if (dirs.length === 0) {
      fail("请指定目录或条件选项；交互设置请运行 toolkit scope --interactive")
      return
    }
    await runListEdit(effect === "allow" ? "include" : "exclude", dirs, options)
    return
  }
  // 条件选项出现：位置参数按路径条件处理，其余条件原样进入策略
  const paths = [...(options.paths ?? []), ...dirs]
  try {
    const plan = planPolicyAdd(readPolicyState(resolved.layer), {
      id: options.id,
      name: options.name,
      effect,
      when: buildWhen({ ...options, paths }),
      skills: effect === "allow" ? allowSkills(options) : denySkills(options, resolved.layer),
      delivery: effect === "allow" ? (options.delivery as PolicyDelivery | undefined) : undefined,
    })
    if (plan.requiresYes && !options.yes && !options.dryRun) {
      fail(`${plan.warnings.join("；")}；确认后加 --yes 再执行（未写入配置）`)
      return
    }
    await applyPolicyPlanWithPrompt(effect === "allow" ? "作用域：允许" : "作用域：拒绝", plan, options)
  } catch (error) {
    fail((error as Error).message)
  }
}

// 移除条目：--id / --name 移除策略，--paths 按条件批量清除策略，其余按目录移除名单条目
async function runEntryRemove(
  dirs: string[],
  options: { id?: string; name?: string; paths?: string[]; from?: string; to?: string; layer?: string; dryRun?: boolean; yes?: boolean },
): Promise<void> {
  if (options.id || options.name) {
    await runPolicyRemove(options)
    return
  }
  if (options.paths?.length) {
    await runPolicyReset({ paths: options.paths, layer: options.layer, dryRun: options.dryRun, yes: options.yes })
    return
  }
  if (dirs.length === 0) {
    fail("请指定目录、--paths 或 --id / --name；未写入配置")
    return
  }
  await runRemove(dirs, options)
}

// 清除：默认清名单、策略与档案；--what 可只清其中一类，三类共用一次预览与确认
async function runScopeReset(options: { what?: string; layer?: string; dryRun?: boolean; yes?: boolean; noLink?: boolean }): Promise<void> {
  const allowed = ["lists", "policies", "profiles"] as const
  const raw = options.what ?? "all"
  const parts = raw
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
  const invalid = parts.filter((item) => item !== "all" && !(allowed as readonly string[]).includes(item))
  if (invalid.length > 0) {
    fail(`--what 取值须为 lists / policies / profiles / all（非法：${invalid.join("、")}）`)
    return
  }
  const selected = new Set<string>(parts.includes("all") ? allowed : parts)
  const resolved = resolvePolicyLayer(options.layer)
  if (!resolved) return
  try {
    // 预览取自同一份现场：只用于展示，实际落盘按类别顺序逐项重读现场
    const previews: string[] = []
    const targets = { lists: false, policies: false, profiles: false }
    if (selected.has("lists")) {
      const listsPlan = planReset(readScopeState(resolved.layer))
      if (listsPlan.changed) {
        previews.push(...describePlan(listsPlan))
        targets.lists = true
      }
    }
    const policyState = readPolicyState(resolved.layer)
    // 空类别不算失败：没有可清除项时跳过该类，其余类别照常预览
    if (selected.has("policies")) {
      try {
        previews.push(...describePolicyPlan(planPolicyReset(policyState, { all: true, confirmed: true })))
        targets.policies = true
      } catch {
        targets.policies = false
      }
    }
    if (selected.has("profiles")) {
      try {
        previews.push(...describePolicyPlan(planSkillReset(policyState, true)))
        targets.profiles = true
      } catch {
        targets.profiles = false
      }
    }
    if (previews.length === 0) {
      console.log(line.hint("没有可清除的条目，未写入配置"))
      return
    }
    const confirmed = await confirmWrite({
      title: `作用域：清除（${[...selected].join(" / ")}）`,
      lines: previews,
      yes: Boolean(options.yes) || !isInteractive(),
      dryRun: Boolean(options.dryRun),
    })
    if (options.dryRun) {
      console.log(line.hint("[预演] 未写入任何文件"))
      return
    }
    if (!confirmed) {
      console.error(line.hint("已取消，未写入任何文件"))
      return
    }
    // 逐类落盘：每次都重读现场，避免后一类用旧快照覆盖前一类的结果
    if (targets.lists) await runReset({ ...options, yes: true })
    if (targets.policies) await runPolicyReset({ all: true, layer: options.layer, yes: true })
    if (targets.profiles) await runSkillsReset({ layer: options.layer, yes: true })
  } catch (error) {
    fail((error as Error).message)
  }
}

async function runListEdit(
  kind: ScopeList,
  dirs: string[],
  options: { layer?: string; dryRun?: boolean; yes?: boolean; tree?: boolean },
): Promise<void> {
  const layer = resolveLayer(options.layer)
  if (!layer) return
  if (dirs.length === 0) {
    fail("请指定目录；交互设置请运行 toolkit scope --interactive")
    return
  }
  await applyScopePlan(
    kind === "include" ? "作用域：加入白名单" : "作用域：加入黑名单",
    planAdd(readScopeState(layer), kind, dirs, process.cwd(), options.tree),
    options,
  )
}

// 移除 / 互转
async function runRemove(dirs: string[], options: { layer?: string; dryRun?: boolean; yes?: boolean; from?: string; to?: string }): Promise<void> {
  const layer = resolveLayer(options.layer)
  if (!layer) return
  if (dirs.length === 0) {
    fail("请指定目录；交互管理请运行 toolkit scope --interactive")
    return
  }
  const from = (options.from ?? "both") as RemoveFrom
  if (!assertChoice(from, ["include", "exclude", "both"], "--from")) return
  const to = options.to as ScopeList | undefined
  if (to !== undefined) {
    if (!assertChoice(to, ["include", "exclude"], "--to")) return
    if (from === "both") {
      fail("--from both 不能与 --to 同时使用")
      return
    }
    if (from === to) {
      fail("--to 须与 --from 不同")
      return
    }
  }
  await applyScopePlan("作用域：移除 / 互转", planRemove(readScopeState(layer), dirs, { from, to }), options)
}

// 查看或切换默认值
async function runDefault(value: string | undefined, options: { layer?: string; dryRun?: boolean; yes?: boolean }): Promise<void> {
  const layer = resolveLayer(options.layer)
  if (!layer) return
  const state = readScopeState(layer)
  if (value === undefined) {
    console.log(`名单模式：${modeLabel(state.mode)}（白名单 ${state.include.length} / 黑名单 ${state.exclude.length}）`)
    console.log(`配置来源：${state.target.file}`)
    return
  }
  if (value !== "on" && value !== "off") {
    fail("取值须为 on / off")
    return
  }
  await applyScopePlan(value === "on" ? "作用域：默认全部生效" : "作用域：默认仅名单内生效", planDefault(state, value === "on"), options)
}

// 清除限制
async function runReset(options: { layer?: string; dryRun?: boolean; yes?: boolean }): Promise<void> {
  const layer = resolveLayer(options.layer)
  if (!layer) return
  await applyScopePlan("作用域：清除限制", planReset(readScopeState(layer)), options)
}

// 注册 scope 命令：默认行为不变（无配置时全域生效）
export function registerScopeCommands(program: Command): void {
  const scopeCmd = program
    .command("scope")
    .description("作用域：按项目 / 目录判定技能是否生效（默认全域生效）")
    .option("--interactive", "即使无终端也强制进入交互向导")
  scopeCmd.action(async (options: { interactive?: boolean }) => {
    // 裸命令：TTY 或显式 --interactive 进状态优先向导；非 TTY 输出状态摘要并成功退出
    if (options.interactive || isInteractive()) {
      await runInteractive(() => runScopeWizard())
      return
    }
    const report = resolveScope()
    for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
    const treeHint = plainIncludeHint(report)
    if (treeHint) console.error(`⚠️ ${treeHint}`)
    for (const text of formatStatus(report)) console.log(text)
    console.log(line.hint("非交互环境已输出状态摘要；交互向导请在终端运行 toolkit scope，或加 --interactive 强制进入"))
  })

  scopeCmd
    .command("status")
    .description("查看当前目录的作用域判定与说明")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .option("--skill <name>", "按指定技能判定（应用技能级规则）")
    .option("--skills", "列出包内与已安装外部技能在该目录的生效结论")
    .option("--lists", "查看目录名单、配置来源与判定目录")
    .option("--policies", "列出策略、来源层与当前目录命中结果")
    .option("--at <dir>", "以指定目录为判定与配置查找起点（不改变进程 cwd）")
    .action((options: { format?: string; skill?: string; skills?: boolean; lists?: boolean; policies?: boolean; at?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        if (options.policies) {
          runPolicyList({ at: options.at, format: options.format })
          return
        }
        if (options.lists) {
          runScopeList({ format: options.format })
          return
        }
        if (options.skills) {
          const base = resolveScope(options.at)
          const treeHint = plainIncludeHint(base)
          if (treeHint) console.error(`⚠️ ${treeHint}`)
          const names = options.skill ? [options.skill] : listInstalledSkillNames(options.at)
          const reports = names.map((name) => resolveScope(options.at, name))
          const warnings = new Set([...base.warnings, ...reports.flatMap((report) => report.warnings)])
          for (const warning of warnings) console.error(`⚠️ ${warning}`)
          const hints = new Set(reports.map((report) => report.migrationHint).filter((hint): hint is string => Boolean(hint)))
          for (const hint of hints) console.error(`⚠️ ${hint}`)
          const items = reports.map((report) => ({
            name: report.context.skill ?? "",
            active: report.decision.active,
            delivery: report.decision.delivery ?? "full",
            matchedRule: report.decision.matchedRule,
            reason: report.decision.reason,
          }))
          const linkage = analyzeSkillLinkage(options.at)
          if (options.format === "json") {
            printJson(
              jsonEnvelope({
                command: "scope status",
                data: {
                  at: base.context.cwd,
                  baseDir: base.decision.baseDir,
                  linkage,
                  skills: items,
                },
              }),
            )
            return
          }
          console.log("技能作用域：")
          console.log(`  当前目录：${base.context.cwd}`)
          if (items.length === 0) {
            console.log("  包内未找到技能")
            return
          }
          for (const item of items) {
            const state = item.active ? "生效" : "未生效"
            const shape = ` · 形态 ${deliveryModeLabel(item.delivery)}`
            console.log(`  ${item.active ? "✔" : "✖"} ${item.name}：${state}${shape}（${item.reason}）`)
          }
          for (const hint of formatLinkageHints(linkage)) console.log(line.hint(hint))
          return
        }
        const report = resolveScope(options.at, options.skill)
        for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
        if (report.migrationHint) console.error(`⚠️ ${report.migrationHint}`)
        const treeHint = plainIncludeHint(report)
        if (treeHint) console.error(`⚠️ ${treeHint}`)
        if (options.format === "json") {
          const { decision } = report
          printJson(
            jsonEnvelope({
              command: "scope status",
              data: {
                active: decision.active,
                mode: decision.mode,
                baseDir: decision.baseDir,
                skill: options.skill ?? null,
                sourceFile: decision.sourceFile,
                policySourceFile: report.policySourceFile,
                policyCount: report.policyCount,
                matchedRule: decision.matchedRule,
                reason: decision.reason,
              },
            }),
          )
          for (const hint of formatLinkageHints(analyzeSkillLinkage(options.at))) console.error(`⚠️ ${hint}`)
          return
        }
        for (const text of formatStatus(report)) console.log(text)
        for (const hint of formatLinkageHints(analyzeSkillLinkage(options.at))) console.log(line.hint(hint))
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  // 内容闸门：stdout 只放正文，未激活时退出码 3
  scopeCmd
    .command("guard <skill>")
    .description("按当前目录作用域输出技能正文（未激活时退出码 3，stdout 为空）")
    .action((skill: string) => {
      process.exitCode = runGuard(skill)
    })

  // 写入命令的公共条件选项：出现任一条件即写策略，否则写目录名单
  function entryConditions(command: Command, withDelivery: boolean): Command {
    command
      .option("--skill <patterns...>", "技能名 / glob（出现即写策略）")
      .option("--profile <profiles...>", "引用技能档案（需已定义）")
      .option("--paths <paths...>", "按项目根匹配的路径 / glob")
      .option("--subpaths <subpaths...>", "相对项目根、按当前目录匹配")
      .option("--markers <markers...>", "目录或 git 根下须存在的标记文件")
      .option("--git-remotes <remotes...>", "git 远端的扁平文本 / glob")
      .option("--tree", "把路径条件中的裸目录扩为 <目录>/**")
      .option("--name <name>", "可读标签，可重复")
      .option("--id <id>", "稳定标识：跨层唯一、不可变；缺省自动生成")
      .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
      .option("--dry-run", "只预览，不写配置")
      .option("--yes", "跳过写前确认（预览照常打印）")
      .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    if (withDelivery) command.option("--delivery <mode>", "该范围的内容形态：全文安装（full）/ 入口壳（gated）")
    return command
  }

  entryConditions(
    scopeCmd.command("allow [dirs...]").description("允许：目录写入白名单；带条件选项（技能 / 档案 / 路径条件 / 形态）时写入允许策略"),
    true,
  ).action(async (dirs: string[] = [], options: EntryOptions = {}) => {
    await runInteractive(() => runEntryWrite("allow", dirs, options))
  })

  entryConditions(
    scopeCmd.command("deny [dirs...]").description("拒绝：目录写入黑名单；带条件选项时写入拒绝策略（未限定技能即拒绝该范围全部技能）"),
    false,
  ).action(async (dirs: string[] = [], options: EntryOptions = {}) => {
    await runInteractive(() => runEntryWrite("deny", dirs, options))
  })

  scopeCmd
    .command("remove [dirs...]")
    .description("移除：目录按名单移除，--paths 按条件清除策略，--id / --name 移除指定策略")
    .option("--paths <paths...>", "按路径条件批量清除策略")
    .option("--id <id>", "策略稳定标识")
    .option("--name <name>", "策略可读标签（该层唯一）")
    .option("--from <list>", "名单来源侧：白名单（include）/ 黑名单（exclude）/ 两侧（both，默认）")
    .option("--to <list>", "移除后转入另一侧：白名单（include）/ 黑名单（exclude）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .action(
      async (
        dirs: string[] = [],
        options: { id?: string; name?: string; paths?: string[]; from?: string; to?: string; layer?: string; dryRun?: boolean; yes?: boolean } = {},
      ) => {
        await runInteractive(() => runEntryRemove(dirs, options))
      },
    )

  scopeCmd
    .command("default [value]")
    .description("查看或切换名单外目录的处理：on（全部生效）/ off（仅名单内生效）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (value: string | undefined, options: { layer?: string; dryRun?: boolean; yes?: boolean } = {}) => {
      await runInteractive(() => runDefault(value, options))
    })

  scopeCmd
    .command("reset")
    .description("清除限制：默认清名单、策略与技能档案；--what 可只清其中一类")
    .option("--what <what>", "清除范围：lists / policies / profiles / all（默认 all，可逗号分隔）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .action(async (options: { what?: string; layer?: string; dryRun?: boolean; yes?: boolean } = {}) => {
      await runInteractive(() => runScopeReset(options))
    })

  scopeCmd
    .command("profile [name]")
    .description("技能档案：省略名称时列出；写入允许 / 排除清单；--remove 移除")
    .option("--allow <patterns...>", "档案允许技能名 / glob")
    .option("--deny <patterns...>", "档案排除技能名 / glob")
    .option("--remove", "移除档案（需 --yes）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .action(
      async (
        name: string | undefined,
        options: { allow?: string[]; deny?: string[]; remove?: boolean; layer?: string; dryRun?: boolean; yes?: boolean },
      ) => {
        await runInteractive(() => runSkillsProfile(name, options))
      },
    )
}
