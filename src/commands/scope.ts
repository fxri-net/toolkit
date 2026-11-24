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
import { registerHelpCommand } from "../help"
import { assertChoice, fail } from "../cli-ui"
import { modeLabel, planAdd, planDefault, planRemove, planReset, readScopeState, type ScopeList, type RemoveFrom } from "../scope/edit"
import { applyScopePlan } from "../scope/apply"
import { isLegacyPolicyId } from "../scope/policy"
import { DELIVERY_MODES, deliveryModeLabel } from "../skills/delivery"
import { analyzeSkillLinkage, formatLinkageHints, listInstalledSkillNames } from "../scope/linkage"
import {
  POLICY_LAYERS,
  applyPolicyPlanWithPrompt,
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

// 从命令选项组装技能维度：模式 / 档案 / 名单
function buildSkills(options: {
  mode?: string
  profile?: string[]
  allow?: string[]
  deny?: string[]
}): PolicySkills | undefined {
  const skills: PolicySkills = {}
  if (options.mode) skills.mode = options.mode as PolicySkills["mode"]
  if (options.profile?.length) skills.profiles = options.profile
  if (options.allow?.length) skills.allow = options.allow
  if (options.deny?.length) skills.deny = options.deny
  return Object.keys(skills).length > 0 ? skills : undefined
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

interface PolicyAddOptions {
  tree?: boolean
  id?: string
  name?: string
  effect?: string
  paths?: string[]
  subpaths?: string[]
  markers?: string[]
  gitRemotes?: string[]
  mode?: string
  profile?: string[]
  allow?: string[]
  deny?: string[]
  delivery?: string
  layer?: string
  dryRun?: boolean
  yes?: boolean
}

// 新增策略：deny 未限定技能时须 --yes
async function runPolicyAdd(options: PolicyAddOptions): Promise<void> {
  const resolved = resolvePolicyLayer(options.layer)
  if (!resolved) return
  const effect = options.effect ?? "allow"
  if (!assertChoice(effect, ["allow", "deny"], "--effect")) return
  if (options.delivery !== undefined && !assertChoice(options.delivery, DELIVERY_MODES, "--delivery")) return
  try {
    const plan = planPolicyAdd(readPolicyState(resolved.layer), {
      id: options.id,
      name: options.name,
      effect: effect as "allow" | "deny",
      when: buildWhen(options),
      skills: buildSkills(options),
      delivery: options.delivery as PolicyDelivery | undefined,
    })
    if (plan.requiresYes && !options.yes && !options.dryRun) {
      fail(`${plan.warnings.join("；")}；确认后加 --yes 再执行（未写入配置）`)
      return
    }
    await applyPolicyPlanWithPrompt("作用域策略：新增", plan, options)
  } catch (error) {
    fail((error as Error).message)
  }
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
        command: "scope policy list",
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
    console.log(line.hint("名单规则由 activation 配置生成，只读；请用 toolkit scope list 的 add / exclude / default / reset 修改"))
  }
}

// 技能维度清单：档案 + 带 skills 的策略
function runSkillsList(options: { at?: string; format?: string }): void {
  if (!assertJsonFormat(options.format)) return
  const report = resolveScope(options.at)
  for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
  const policies = report.policies.filter((policy) => policy.skills && Object.keys(policy.skills).length > 0)
  const linkage = analyzeSkillLinkage(options.at)
  if (options.format === "json") {
    printJson(
      jsonEnvelope({
        command: "scope skills list",
        data: {
          at: report.context.cwd,
          baseDir: report.decision.baseDir,
          profiles: report.profiles,
          linkage,
          policies: policies.map((policy) => ({
            ...policy,
            legacy: isLegacyPolicyId(policy.id),
          })),
        },
      }),
    )
    return
  }
  console.log("技能档案：")
  if (report.profiles.length === 0) console.log("  未配置")
  else {
    for (const profile of report.profiles) {
      const parts: string[] = []
      if (profile.allow.length) parts.push(`allow=${profile.allow.join(",")}`)
      if (profile.deny.length) parts.push(`deny=${profile.deny.join(",")}`)
      console.log(`  ${profile.name}（${profile.layer}）：${parts.join("；") || "空档案"}`)
    }
  }
  console.log("技能策略：")
  if (policies.length === 0) console.log("  未配置")
  else {
    for (const policy of policies) {
      const legacy = isLegacyPolicyId(policy.id)
      const legacyTag = legacy ? " · 由名单配置生成，只读" : ""
      const name = policy.name ? `（${policy.name}）` : ""
      const label = legacy ? (policy.name ?? "名单规则") : `${policy.id}${name}`
      const layer = termText(policyLayerText, policy.layer ?? "global")
      const effect = termText(policyEffectText, policy.effect ?? "allow")
      console.log(`  ${layer} ${label} ${effect}${legacyTag}`)
      const when = describeWhen(policy.when)
      if (when) console.log(`    条件：${when}`)
      const skills = describeSkills(policy.skills)
      if (skills) console.log(`    技能：${skills}`)
      const delivery = describeDelivery(policy.delivery)
      if (delivery) console.log(`    ${delivery}`)
    }
  }
  for (const hint of formatLinkageHints(linkage)) console.log(line.hint(hint))
}

interface SkillPolicyOptions {
  id?: string
  name?: string
  paths?: string[]
  subpaths?: string[]
  markers?: string[]
  gitRemotes?: string[]
  profile?: string[]
  layer?: string
  dryRun?: boolean
  yes?: boolean
}

// 只允许列出的技能：生成 allowlist 技能维度策略
async function runSkillsAllow(skills: string[], options: SkillPolicyOptions): Promise<void> {
  const resolved = resolvePolicyLayer(options.layer)
  if (!resolved) return
  const profiles = options.profile ?? []
  if (skills.length === 0 && profiles.length === 0) {
    fail("请指定技能或 --profile；未写入配置")
    return
  }
  const skillsConfig: PolicySkills = { mode: "allowlist" }
  if (skills.length) skillsConfig.allow = skills
  if (profiles.length) skillsConfig.profiles = profiles
  try {
    const plan = planPolicyAdd(readPolicyState(resolved.layer), {
      id: options.id,
      name: options.name,
      effect: "allow",
      when: buildWhen(options),
      skills: skillsConfig,
    })
    await applyPolicyPlanWithPrompt("作用域技能：只允许", plan, options)
  } catch (error) {
    fail((error as Error).message)
  }
}

// 排除列出的技能：生成带技能选择器的 deny 策略
async function runSkillsDeny(skills: string[], options: SkillPolicyOptions): Promise<void> {
  const resolved = resolvePolicyLayer(options.layer)
  if (!resolved) return
  try {
    const profiles = profileAllowPatterns(process.cwd(), options.profile ?? [], resolved.layer)
    const match = [...skills, ...profiles]
    if (match.length === 0) {
      fail("请指定技能或 --profile；未写入配置")
      return
    }
    const plan = planPolicyAdd(readPolicyState(resolved.layer), {
      id: options.id,
      name: options.name,
      effect: "deny",
      when: buildWhen(options),
      skills: { match },
    })
    await applyPolicyPlanWithPrompt("作用域技能：排除", plan, options)
  } catch (error) {
    fail((error as Error).message)
  }
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

// 加入白 / 黑名单
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
    .option("--at <dir>", "以指定目录为判定与配置查找起点（不改变进程 cwd）")
    .action((options: { format?: string; skill?: string; skills?: boolean; at?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
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

  // 目录名单组：裸 list 查看现状，增删改作为同组子命令
  const listCmd = scopeCmd
    .command("list")
    .description("目录名单：查看当前名单、配置来源与判定目录（add / exclude / remove / default / reset 同组）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { format?: string }) => {
      try {
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
              command: "scope list",
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
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  // 策略命令组：统一表达路径、标记、远端与技能维度
  const policyCmd = scopeCmd
    .command("policy")
    .description("作用域策略：多条命中时只取优先级最高的一条（层 > 具体度 > 拒绝优先 > 后写），不合并")
  registerHelpCommand(policyCmd)
  policyCmd
    .command("list")
    .description("列出策略、来源层与当前目录命中结果")
    .option("--at <dir>", "以指定目录为判定与配置查找起点（不改变进程 cwd）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { at?: string; format?: string }) => runPolicyList(options))

  policyCmd
    .command("add")
    .description("新增策略：同字段条件满足其一、跨字段需同时满足；不传 --effect 时为允许")
    .option("--effect <effect>", "允许（allow，默认）/ 拒绝（deny，只接受技能选择器，不接受技能名单）")
    .option("--paths <paths...>", "按项目根匹配的路径 / glob")
    .option("--subpaths <subpaths...>", "相对项目根、按当前目录匹配；在项目根执行时允许规则按未命中处理")
    .option("--markers <markers...>", "目录或 git 根下须存在的标记文件")
    .option("--git-remotes <remotes...>", "git 远端的扁平文本 / glob")
    .option("--mode <mode>", "技能名单模式：全部生效（all）/ 仅名单内生效（allowlist）/ 排除名单（denylist）")
    .option("--tree", "把 --paths 的裸目录扩为 <目录>/**，覆盖其下所有项目")
    .option("--profile <profiles...>", "引用技能档案（需已定义）")
    .option("--allow <patterns...>", "允许的技能名 / glob（仅名单内生效时参与）")
    .option("--deny <patterns...>", "排除技能名 / glob")
    .option("--delivery <mode>", "该范围的内容形态：全文安装（full）/ 入口壳（gated）/ 不安装（off）")
    .option("--name <name>", "可读标签，可重复")
    .option("--id <id>", "稳定标识：跨层唯一、不可变；缺省自动生成")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (options: PolicyAddOptions) => {
      await runInteractive(() => runPolicyAdd(options))
    })

  policyCmd
    .command("remove")
    .description("移除策略：优先 --id；--name 仅在该层唯一时可用")
    .option("--id <id>", "稳定标识")
    .option("--name <name>", "可读标签（该层唯一）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (options: { id?: string; name?: string; layer?: string; dryRun?: boolean; yes?: boolean }) => {
      await runInteractive(() => runPolicyRemove(options))
    })

  policyCmd
    .command("reset")
    .description("按 --id / --paths 批量清除；整层清空需 --all --yes（不改名单配置）")
    .option("--id <ids...>", "按稳定标识批量清除")
    .option("--paths <paths...>", "按路径条件批量清除")
    .option("--all", "清除该层全部策略（不改名单配置）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (options: { id?: string[]; paths?: string[]; all?: boolean; layer?: string; dryRun?: boolean; yes?: boolean }) => {
      await runInteractive(() => runPolicyReset(options))
    })

  // 技能维度快捷视图：底层复用同一计划与写盘模块
  const skillsCmd = scopeCmd
    .command("skills")
    .description("技能维度快捷视图：allow 只允许列出的技能 / deny 排除列出的技能")
  registerHelpCommand(skillsCmd)

  skillsCmd
    .command("list")
    .description("列出技能档案与技能维度策略")
    .option("--at <dir>", "以指定目录为判定与配置查找起点（不改变进程 cwd）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { at?: string; format?: string }) => runSkillsList(options))

  skillsCmd
    .command("allow [skills...]")
    .description("只允许列出的技能（等同新增一条仅名单内生效的技能策略）")
    .option("--profile <profiles...>", "引用技能档案（需已定义）")
    .option("--paths <paths...>", "按项目根匹配的路径 / glob")
    .option("--subpaths <subpaths...>", "相对项目根、按当前目录匹配；在项目根执行时允许规则按未命中处理")
    .option("--markers <markers...>", "目录或 git 根下须存在的标记文件")
    .option("--git-remotes <remotes...>", "git 远端的扁平文本 / glob")
    .option("--name <name>", "可读标签，可重复")
    .option("--id <id>", "稳定标识：跨层唯一、不可变；缺省自动生成")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (skills: string[] = [], options: SkillPolicyOptions = {}) => {
      await runInteractive(() => runSkillsAllow(skills, options))
    })

  skillsCmd
    .command("deny [skills...]")
    .description("排除列出的技能（等同新增一条带技能选择器的拒绝策略）")
    .option("--profile <profiles...>", "展开档案中的允许技能一并排除")
    .option("--paths <paths...>", "按项目根匹配的路径 / glob")
    .option("--subpaths <subpaths...>", "相对项目根、按当前目录匹配；在项目根执行时允许规则按未命中处理")
    .option("--markers <markers...>", "目录或 git 根下须存在的标记文件")
    .option("--git-remotes <remotes...>", "git 远端的扁平文本 / glob")
    .option("--name <name>", "可读标签，可重复")
    .option("--id <id>", "稳定标识：跨层唯一、不可变；缺省自动生成")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (skills: string[] = [], options: SkillPolicyOptions = {}) => {
      await runInteractive(() => runSkillsDeny(skills, options))
    })

  skillsCmd
    .command("profile [name]")
    .description("查看 / 写入 / 移除技能档案；移除时提示引用与同名回退（省略档案名时列出）")
    .option("--allow <patterns...>", "档案允许技能名 / glob")
    .option("--deny <patterns...>", "档案排除技能名 / glob")
    .option("--remove", "移除档案（需 --yes）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(
      async (
        name: string | undefined,
        options: { allow?: string[]; deny?: string[]; remove?: boolean; layer?: string; dryRun?: boolean; yes?: boolean },
      ) => {
        await runInteractive(() => runSkillsProfile(name, options))
      },
    )

  skillsCmd
    .command("reset")
    .description("清除该层全部技能维度策略（需 --yes）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (options: { layer?: string; dryRun?: boolean; yes?: boolean }) => {
      await runInteractive(() => runSkillsReset(options))
    })

  // 内容闸门：stdout 只放正文，未激活时退出码 3
  scopeCmd
    .command("guard <skill>")
    .description("按当前目录作用域输出技能正文（未激活时退出码 3，stdout 为空）")
    .action((skill: string) => {
      process.exitCode = runGuard(skill)
    })

  listCmd
    .command("add [dirs...]")
    .description("把目录加入白名单（需显式指定目录；交互设置请运行 toolkit scope）")
    .option("--tree", "覆盖该目录及其下所有项目（写入 <目录>/**）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (dirs: string[] = [], options: { layer?: string; dryRun?: boolean; yes?: boolean; tree?: boolean } = {}) => {
      await runInteractive(() => runListEdit("include", dirs, options))
    })

  listCmd
    .command("exclude [dirs...]")
    .description("把目录加入黑名单（默认值保持不变；需显式指定目录）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (dirs: string[] = [], options: { layer?: string; dryRun?: boolean; yes?: boolean } = {}) => {
      await runInteractive(() => runListEdit("exclude", dirs, options))
    })

  listCmd
    .command("remove [dirs...]")
    .description("移除条目，可指定来源侧与转入侧")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--from <list>", "从哪侧移除：白名单（include）/ 黑名单（exclude）/ 两侧（both，默认）")
    .option("--to <list>", "移除后转入另一侧：白名单（include）/ 黑名单（exclude）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(
      async (dirs: string[] = [], options: { layer?: string; from?: string; to?: string; dryRun?: boolean; yes?: boolean } = {}) => {
        await runInteractive(() => runRemove(dirs, options))
      },
    )

  listCmd
    .command("default [value]")
    .description("查看或切换名单外目录的处理：on（全部生效）/ off（仅名单内生效）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (value: string | undefined, options: { layer?: string; dryRun?: boolean; yes?: boolean } = {}) => {
      await runInteractive(() => runDefault(value, options))
    })

  listCmd
    .command("reset")
    .description("清除限制（全部生效并清空两名单）")
    .option("--layer <layer>", "配置层：全局（global，默认）/ 项目（project）/ 本地（local）")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过写前确认（预览照常打印）")
    .option("--no-link", "只写配置，不联动收敛技能产物（之后可跑 toolkit skill reconcile）")
    .action(async (options: { layer?: string; dryRun?: boolean; yes?: boolean } = {}) => {
      await runInteractive(() => runReset(options))
    })
}
