// 使用情况向导：初始化与无参数菜单；所有选择都有默认值，取消时不留下半成品
import { AGENT_ADAPTERS, detectedAdapters, isAdapterAvailable, resolveAdapters } from "./adapters"
import type { AgentAdapter } from "./adapters/types"
import { buildHookCommand } from "./hook-command"
import { loadUsageConfig, resolveUsageDir, usageConfigPath, updateUsageConfig } from "./config"
import { purgeEvents, usagePaths } from "./store"
import { runUploadSetup } from "./upload"
import { readHookActivity, readLastHookError } from "./ingest"
import { line, style } from "../term-style"
import { LIST_PAGE_SIZE, ask, exitWithCancel, isPromptCancel, loadPrompts, requireInteractive } from "../prompts"
import { askCheckbox, askConfirm, askInput, confirmWrite, runMenu } from "../cli-ui"
import { createContext, formatLocalTime, printDefaultStats, printUsageInfo } from "./cli/context"
import { exportUsageEvents, purgeUsageEvents } from "./cli/data"
import type { UsageChannel, UsageConfig, UsageRotation, UsageSkillMode } from "./types"

// 预设：已配置时沿用当前配置，首次默认覆盖一方与第三方技能
export type Preset = "keep" | "off" | "recommended" | "third-party" | "custom" | "advanced"

// 预设显示名：易混淆项显式写明是否上传，避免与「本地来源 / 本地目录」混淆
export const PRESET_LABELS: Record<Preset, string> = {
  keep: "保持当前配置（按现有选择重装 Hook）",
  off: "保持关闭（不安装 Hook、不采集）",
  recommended: "推荐：仅一方技能（数据只留本机，不上传）",
  "third-party": "一方 + 第三方技能（数据只留本机，不上传）",
  custom: "自定义（沿用并修改当前选择）",
  advanced: "高级：一方 + 第三方技能，并配置上传",
}

// 首次初始化的默认预设：显式执行 init 即启用意图，默认一并统计第三方技能
export const DEFAULT_INIT_PRESET = "third-party" as const

// 初始化选项：--yes 走非交互路径，只支持 off / recommended / third-party
export interface InitWizardOptions {
  yes?: boolean
  preset?: string
  agent?: string
  channel?: string
}

// 卸载选项：默认保留数据，--purge 才删除事件
export interface UninstallOptions {
  yes?: boolean
  agent?: string
  purge?: boolean
  dryRun?: boolean
}

// 逗号分隔 Agent 名单
function splitAgentNames(value: string | undefined): string[] {
  if (!value) return []
  return [...new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))]
}

// 非交互初始化：按预设写入配置并安装 Hook（规则通道不装 Hook），不做任何提问
function runNonInteractiveInit(options: InitWizardOptions): void {
  // 非交互模式必须显式给预设：不再回落「关闭」，避免显式 init 变成静默空操作
  if (!options.preset) {
    console.error("⚠️ 非交互模式须显式指定 --preset（off / recommended / third-party）")
    process.exitCode = 1
    return
  }
  const preset = options.preset
  // --preset off 与 --channel 同时出现时 off 优先：保持关闭、不改任何配置
  if (preset === "off") {
    console.log(line.hint("保持关闭，未修改任何文件"))
    return
  }
  if (preset !== "recommended" && preset !== "third-party") {
    console.error("⚠️ 非交互模式仅支持 --preset off / recommended / third-party")
    process.exitCode = 1
    return
  }
  const rawChannel = options.channel ?? "rule"
  if (rawChannel !== "rule" && rawChannel !== "hook") {
    console.error("⚠️ --channel 取值须为 rule / hook")
    process.exitCode = 1
    return
  }
  const channel: UsageChannel = rawChannel
  const config = loadUsageConfig()
  const dir = resolveUsageDir(undefined, config)
  const base = {
    enabled: true,
    channel,
    sources: { firstParty: true, thirdParty: preset === "third-party", unmanaged: false },
    skills: { mode: "all" as UsageSkillMode, include: [], exclude: [] },
    capture: { triggerPrompt: false, skillArgs: false, outcome: false },
    storage: { dir, rotation: "monthly" as UsageRotation, retentionDays: 180 },
  }
  // 规则通道只写采集配置：不装 Hook，也不依赖本机是否检测到 Agent
  if (channel === "rule") {
    updateUsageConfig({ ...base, agents: {} })
    console.log(line.ok(`已启用技能使用情况（${preset}，通道 rule），数据目录：${dir}`))
    console.log(line.hint("规则通道不依赖 Hook：把 toolkit rules compose --module usage 的输出复制进 Agent 全局规则"))
    return
  }
  const { adapters, invalid, unavailable } = resolveAdapters(splitAgentNames(options.agent))
  if (invalid.length > 0) {
    console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
    process.exitCode = 1
    return
  }
  if (unavailable.length > 0) console.warn(`⚠️ 忽略本机未检测到的 Agent：${unavailable.join("、")}（不凭空创建配置）`)
  if (adapters.length === 0) {
    console.error("⚠️ 没有可接入的 Agent：请先安装对应工具，或用 --agent 指定已安装的 Agent；也可改用 --channel rule")
    process.exitCode = 1
    return
  }
  updateUsageConfig({ ...base, agents: Object.fromEntries(adapters.map((adapter) => [adapter.id, true])) })
  installHooks(adapters)
  console.log(line.ok(`已启用技能使用情况（${preset}，通道 hook），数据目录：${dir}`))
}

// 打印配置摘要：向导预览与菜单共用
function printConfigSummary(
  agents: string[],
  firstParty: boolean,
  thirdParty: boolean,
  mode: UsageSkillMode,
  dir: string,
  rotation: UsageRotation,
  retention: number,
  channel: UsageChannel,
): void {
  console.log("")
  console.log("即将应用：")
  console.log(`  通道：${channel === "rule" ? "全局规则上报（rule）" : "Agent Hook（hook）"}`)
  console.log(`  Agent：${channel === "rule" ? "不适用（规则通道）" : agents.length > 0 ? agents.join("、") : "无"}`)
  console.log(`  来源：一方 ${firstParty ? "开" : "关"} / 第三方 ${thirdParty ? "开" : "关"} / 未托管 关`)
  console.log(`  技能模式：${mode}`)
  console.log(`  存储：${dir}（${rotation}，保留 ${retention} 天）`)
  console.log("  上传：关闭")
}

// 安装 Hook：只在用户确认后调用；返回逐 Agent 结果
export function installHooks(agents: AgentAdapter[], dryRun = false): void {
  for (const adapter of agents) {
    try {
      const result = adapter.installHooks({ command: buildHookCommand(adapter.id), dryRun })
      if (result.changed) console.log(`  ${dryRun ? "将安装" : "已安装"} Hook：${adapter.displayName} → ${result.file}`)
      else console.log(`  Hook 已存在：${adapter.displayName}`)
      for (const warning of result.warnings ?? []) console.warn(`  ⚠️ ${adapter.displayName}：${warning}`)
    } catch (error) {
      console.error(`  ⚠️ ${adapter.displayName} Hook 安装失败：${(error as Error).message}`)
    }
  }
}

// 向导默认值：从现有配置推导，重复执行时沿用历史选择
export interface InitDefaults {
  configured: boolean
  agents: string[]
  firstParty: boolean
  thirdParty: boolean
  mode: UsageSkillMode
  include: string[]
  exclude: string[]
  triggerPrompt: boolean
  skillArgs: boolean
  outcome: boolean
  dir: string
  rotation: UsageRotation
  retentionDays: number
}

// 推导向导默认值：未配置过时保持「关闭 + 保守默认」
export function resolveInitDefaults(config: UsageConfig): InitDefaults {
  const agents = Object.entries(config.agents).filter(([, enabled]) => enabled).map(([id]) => id)
  const configured =
    config.enabled ||
    agents.length > 0 ||
    config.skills.mode !== "none" ||
    config.capture.triggerPrompt ||
    config.capture.skillArgs ||
    config.capture.outcome
  return {
    configured,
    agents,
    firstParty: configured ? config.sources.firstParty : true,
    thirdParty: configured ? config.sources.thirdParty : false,
    mode: config.skills.mode,
    include: config.skills.include,
    exclude: config.skills.exclude,
    triggerPrompt: config.capture.triggerPrompt,
    skillArgs: config.capture.skillArgs,
    outcome: config.capture.outcome,
    dir: config.storage.dir || resolveUsageDir(undefined, config),
    rotation: config.storage.rotation,
    retentionDays: config.storage.retentionDays,
  }
}

// 初始化向导：检测 → 预设 → Agent → 范围 → 字段 → 存储 → 预览 → 应用
export async function runUsageInitWizard(options: InitWizardOptions = {}): Promise<void> {
  if (options.yes) {
    runNonInteractiveInit(options)
    return
  }
  if (!requireInteractive({ action: "usage init", hint: "非交互请用 --yes --preset，或执行 toolkit usage --help" })) return
  const { select, checkbox, confirm, input } = await loadPrompts()
  try {
    const detected = detectedAdapters()
    if (detected.length === 0) console.log(line.hint("未检测到可接入的 Agent：本向导将只能使用规则通道（toolkit rules compose --module usage）"))
    const existingConfig = loadUsageConfig()
    const defaults = resolveInitDefaults(existingConfig)
    // 默认预设：已配置时沿用当前配置，首次默认「一方与第三方」，显式 init 即启用
    const defaultPreset: Preset = defaults.configured ? "keep" : DEFAULT_INIT_PRESET
    const presetChoices: Array<{ name: string; value: Preset }> = [
      ...(defaults.configured ? [{ name: PRESET_LABELS.keep, value: "keep" as Preset }] : []),
      { name: PRESET_LABELS["third-party"], value: "third-party" },
      { name: PRESET_LABELS.recommended, value: "recommended" },
      { name: PRESET_LABELS.off, value: "off" },
      { name: PRESET_LABELS.custom, value: "custom" },
      { name: PRESET_LABELS.advanced, value: "advanced" },
    ]
    const preset = await select<Preset>({
      message: defaults.configured ? "选择技能使用情况预设（默认沿用当前配置）" : "选择技能使用情况预设（默认启用，数据只留本机）",
      default: defaultPreset,
      choices: presetChoices,
    })
    if (preset === "off") {
      console.log(line.hint("保持关闭，未修改任何文件。需要时执行 toolkit usage enable"))
      return
    }
    if (preset === "keep") {
      // 规则通道不需要 Hook：只回显当前配置
      if (existingConfig.channel === "rule") {
        printConfigSummary(
          [],
          defaults.firstParty,
          defaults.thirdParty,
          defaults.mode,
          defaults.dir,
          defaults.rotation,
          defaults.retentionDays,
          "rule",
        )
        console.log(line.hint("当前为规则通道，无需重装 Hook；如需调整配置请选「自定义」"))
        return
      }
      const selected = detected.filter((adapter) => defaults.agents.includes(adapter.id))
      if (selected.length === 0) {
        console.log(line.hint("当前配置没有可接入且已启用的 Agent，请改用「自定义」重新选择"))
        return
      }
      printConfigSummary(
        selected.map((adapter) => adapter.displayName),
        defaults.firstParty,
        defaults.thirdParty,
        defaults.mode,
        defaults.dir,
        defaults.rotation,
        defaults.retentionDays,
        "hook",
      )
      if (!existingConfig.enabled) console.log("  ⚠️ 当前总开关关闭：Hook 会重装，但不会写入事件")
      const applyKeep = await confirm({ message: "按当前配置重装 Hook？", default: true })
      if (!applyKeep) {
        console.log(line.hint("已取消，未修改任何文件"))
        return
      }
      installHooks(selected)
      console.log(line.ok("已按当前配置重装 Hook"))
      return
    }

    // 仅「自定义」回填历史值；推荐 / 第三方 / 高级仍按预设语义取值
    const usingSaved = preset === "custom"
    if (usingSaved && defaults.configured) console.log("⚠️ 本次选择将覆盖现有配置（如需保留原值请重跑并选「保持当前配置」)")
    // 步骤机：ESC 回到上一步；顺序随通道变化（hook 多一步 Agent 选择）
    const state = {
      channel: (usingSaved ? existingConfig.channel : "rule") as UsageChannel,
      agents: detected.filter((adapter) => defaults.agents.includes(adapter.id)),
      firstParty: usingSaved ? defaults.firstParty : true,
      thirdParty: preset === "third-party" || preset === "advanced" ? true : usingSaved ? defaults.thirdParty : false,
      mode: (usingSaved ? defaults.mode : "all") as UsageSkillMode,
      include: [] as string[],
      triggerPrompt: usingSaved ? defaults.triggerPrompt : false,
      skillArgs: usingSaved ? defaults.skillArgs : false,
      outcome: usingSaved ? defaults.outcome : false,
      dir: usingSaved ? defaults.dir : resolveUsageDir(undefined, existingConfig),
      rotation: (usingSaved ? defaults.rotation : "monthly") as UsageRotation,
      retention: usingSaved ? String(defaults.retentionDays) : "180",
    }
    // 步骤顺序：规则通道跳过 Agent 选择
    const flow = (): string[] =>
      state.channel === "hook"
        ? ["channel", "agents", "firstParty", "thirdParty", "mode", "include", "trigger", "args", "outcome", "dir", "rotation", "retention", "confirm"]
        : ["channel", "firstParty", "thirdParty", "mode", "include", "trigger", "args", "outcome", "dir", "rotation", "retention", "confirm"]
    // 首步按 ESC = 放弃整个向导，按取消口径退出
    const abortWizard = (): never => {
      console.error(line.hint("已取消，未修改任何文件"))
      exitWithCancel()
    }
    let index = 0
    for (;;) {
      const steps = flow()
      if (index >= steps.length) break
      const step = steps[index]
      if (step === "channel") {
        const answer = await ask(
          () =>
            select<UsageChannel>({
              message: "采集通道",
              default: state.channel,
              choices: [
                { name: "全局规则上报（不依赖 Agent 配置）", value: "rule" },
                { name: "Agent Hook（自动触发，需在 Agent 侧启用）", value: "hook" },
              ],
            }),
          { back: true },
        )
        if ("back" in answer) {
          abortWizard()
          return
        }
        state.channel = answer.value
        if (state.channel === "rule") console.log(line.hint("规则通道：不安装 Hook；完成后把 toolkit rules compose --module usage 的输出复制进全局规则"))
        index += 1
        continue
      }
      if (step === "agents") {
        const answer = await ask(
          () =>
            checkbox<string>({
              message: "选择要接入的 Agent（空格切换，回车确认）",
              choices: detected.map((adapter) => ({
                name: adapter.displayName,
                value: adapter.id,
                checked: state.agents.some((item) => item.id === adapter.id),
              })),
              pageSize: LIST_PAGE_SIZE,
              required: false,
            }),
          { back: true },
        )
        if ("back" in answer) {
          index -= 1
          continue
        }
        state.agents = detected.filter((adapter) => answer.value.includes(adapter.id))
        if (state.agents.length === 0) {
          console.log(line.hint("未选择 Agent，未修改任何文件"))
          return
        }
        index += 1
        continue
      }
      if (step === "firstParty") {
        const answer = await ask(() => confirm({ message: "统计 toolkit 一方技能（fxri-*）？", default: state.firstParty }), { back: true })
        if ("back" in answer) {
          index -= 1
          continue
        }
        state.firstParty = answer.value
        index += 1
        continue
      }
      if (step === "thirdParty") {
        // 预设已确定第三方来源时不再重复提问
        if (preset === "third-party" || preset === "advanced") {
          state.thirdParty = true
          index += 1
          continue
        }
        const answer = await ask(() => confirm({ message: "统计 toolkit 分发的第三方技能？", default: state.thirdParty }), { back: true })
        if ("back" in answer) {
          index -= 1
          continue
        }
        state.thirdParty = answer.value
        index += 1
        continue
      }
      if (step === "mode") {
        const answer = await ask(
          () =>
            select<UsageSkillMode>({
              message: "技能统计范围",
              default: state.mode,
              choices: [
                { name: "全部已开启来源", value: "all" },
                { name: "只统计指定技能", value: "include" },
                { name: "排除指定技能", value: "exclude" },
                { name: "不统计任何技能", value: "none" },
              ],
            }),
          { back: true },
        )
        if ("back" in answer) {
          index -= 1
          continue
        }
        state.mode = answer.value
        index += 1
        continue
      }
      if (step === "include") {
        // 点名统计仅在有 include / exclude 时出现，其余模式直接跳过
        if (state.mode !== "include" && state.mode !== "exclude") {
          index += 1
          continue
        }
        const savedList = state.mode === "include" ? defaults.include : defaults.exclude
        const answer = await ask(
          () =>
            input({
              message: state.mode === "include" ? "要统计的技能名（逗号分隔）" : "要排除的技能名（逗号分隔）",
              default: usingSaved ? savedList.join("，") : "",
            }),
          { back: true },
        )
        if ("back" in answer) {
          index -= 1
          continue
        }
        state.include = (answer.value ?? "")
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean)
        index += 1
        continue
      }
      if (step === "trigger" || step === "args" || step === "outcome") {
        const labels: Record<string, { message: string; current: boolean }> = {
          trigger: { message: "采集触发词（截断 200 字并脱敏）？", current: state.triggerPrompt },
          args: { message: "采集技能参数（截断 500 字并脱敏）？", current: state.skillArgs },
          outcome: { message: "采集执行结果与耗时？", current: state.outcome },
        }
        const item = labels[step]
        if (!item) {
          index += 1
          continue
        }
        const answer = await ask(() => confirm({ message: item.message, default: item.current }), { back: true })
        if ("back" in answer) {
          index -= 1
          continue
        }
        if (step === "trigger") state.triggerPrompt = answer.value
        if (step === "args") state.skillArgs = answer.value
        if (step === "outcome") state.outcome = answer.value
        index += 1
        continue
      }
      if (step === "dir") {
        const answer = await ask(() => input({ message: "数据目录", default: state.dir }), { back: true })
        if ("back" in answer) {
          index -= 1
          continue
        }
        state.dir = answer.value || state.dir
        index += 1
        continue
      }
      if (step === "rotation") {
        const answer = await ask(
          () =>
            select<UsageRotation>({
              message: "事件文件轮转",
              default: state.rotation,
              choices: [
                { name: "按月轮转", value: "monthly" },
                { name: "按文件大小轮转", value: "size" },
                { name: "不轮转", value: "none" },
              ],
            }),
          { back: true },
        )
        if ("back" in answer) {
          index -= 1
          continue
        }
        state.rotation = answer.value
        index += 1
        continue
      }
      if (step === "retention") {
        // 非法取值就地重问，不前进也不写盘
        const answer = await ask(() => input({ message: "保留天数", default: state.retention }), { back: true })
        if ("back" in answer) {
          index -= 1
          continue
        }
        const retention = Number(answer.value)
        if (!Number.isInteger(retention) || retention <= 0) {
          console.error("⚠️ 保留天数须为正整数，请重新输入（ESC 返回上一步）")
          continue
        }
        state.retention = String(retention)
        index += 1
        continue
      }
      if (step !== "confirm") {
        index += 1
        continue
      }
      printConfigSummary(
        state.agents.map((adapter) => adapter.displayName),
        state.firstParty,
        state.thirdParty,
        state.mode,
        state.dir,
        state.rotation,
        Number(state.retention),
        state.channel,
      )
      if (state.channel === "hook") {
        console.log("  Hook 将写入：")
        for (const adapter of state.agents) console.log(`    ${adapter.displayName} → ${adapter.configPath()}`)
      }
      const apply = await ask(
        () => confirm({ message: state.channel === "hook" ? "确认写入配置并安装 Hook？" : "确认写入配置？", default: true }),
        { back: true },
      )
      if ("back" in apply) {
        index -= 1
        continue
      }
      if (!apply.value) {
        console.log(line.hint("已取消，未修改任何文件"))
        return
      }
      index += 1
    }

    updateUsageConfig({
      enabled: true,
      channel: state.channel,
      agents: state.channel === "hook" ? Object.fromEntries(state.agents.map((adapter) => [adapter.id, true])) : {},
      sources: { firstParty: state.firstParty, thirdParty: state.thirdParty, unmanaged: false },
      skills: {
        mode: state.mode,
        include: state.mode === "include" ? state.include : [],
        exclude: state.mode === "exclude" ? state.include : [],
      },
      capture: { triggerPrompt: state.triggerPrompt, skillArgs: state.skillArgs, outcome: state.outcome },
      storage: { dir: state.dir, rotation: state.rotation, retentionDays: Number(state.retention) },
    })
    if (state.channel === "hook") installHooks(state.agents)
    if (preset === "advanced") await runUploadSetup()
    console.log("")
    console.log(`${line.ok("已启用技能使用情况")}。${style.hint("下一步：")}`)
    if (state.channel === "rule") console.log("  toolkit rules compose --module usage   # 把输出复制进全局规则")
    console.log("  toolkit usage info")
    console.log("  toolkit usage stats")
  } catch (error) {
    if (isPromptCancel(error)) console.error(line.hint("已取消，未修改任何文件"))
    throw error
  }
}

// 卸载：停用采集、移除本包 Hook；默认保留数据，--purge 才删除事件
export async function runUsageUninstall(options: UninstallOptions = {}): Promise<void> {
  if (!options.yes && !options.dryRun && !requireInteractive({ action: "usage uninstall", hint: "非交互请加 --yes，或执行 toolkit usage --help" })) return
  // 卸载是清理场景：工具已卸载也要能移除它留下的配置
  const { adapters, invalid } = resolveAdapters(splitAgentNames(options.agent), { allowUnavailable: true })
  if (invalid.length > 0) {
    console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
    process.exitCode = 1
    return
  }
  try {
    let removeHooks = true
    let purge = Boolean(options.purge)
    if (!options.yes && !options.dryRun) {
      const hooksAnswer = await askConfirm({ message: "卸载已安装的 Hook？", default: true })
      if (hooksAnswer === null) {
        console.error(line.hint("已取消，未修改任何文件"))
        return
      }
      removeHooks = hooksAnswer
      const purgeAnswer = await askConfirm({ message: "同时删除本地事件？", default: false })
      if (purgeAnswer === null) {
        console.error(line.hint("已取消，未修改任何文件"))
        return
      }
      purge = purgeAnswer
    }
    const dir = resolveUsageDir(undefined, loadUsageConfig())
    const preview: string[] = ["停用技能使用情况总开关"]
    if (removeHooks) {
      for (const adapter of adapters) {
        const status = adapter.status()
        const verb = status.installed || status.legacyCommand ? "移除" : "未发现"
        preview.push(`${verb} Hook：${adapter.displayName}｜${status.file}`)
      }
    }
    if (purge) preview.push(`删除本地事件：${dir}`)
    const confirmed = await confirmWrite({ title: "即将卸载：", lines: preview, yes: options.yes, dryRun: options.dryRun })
    if (options.dryRun) return
    if (!confirmed) {
      console.error(line.hint("已取消，未修改任何文件"))
      return
    }
    updateUsageConfig({ enabled: false })
    if (removeHooks) {
      for (const adapter of adapters) {
        const result = adapter.uninstallHooks()
        console.log(`${adapter.displayName}：${result.changed ? "已移除 Hook" : "未发现本包 Hook"}`)
      }
    }
    if (purge) {
      const paths = usagePaths(resolveUsageDir(undefined, loadUsageConfig()))
      const removed = purgeEvents(paths, { all: true })
      console.log(line.ok(`已删除 ${removed} 条本地事件`))
    }
    console.log(`${line.ok("技能使用情况已停用")}；${style.hint("如需彻底删除数据，重跑时加 --purge")}`)
  } catch (error) {
    if (isPromptCancel(error)) console.error(line.hint("已取消，未修改任何文件"))
    throw error
  }
}

// Hook 状态：菜单与 hooks status 共用同一份输出
export function printHooksStatus(options: { agent?: string; all?: boolean; dir?: string } = {}): void {
  const { adapters, invalid, unavailable } = resolveAdapters(splitAgentNames(options.agent), { allowUnavailable: Boolean(options.all) })
  if (invalid.length > 0) {
    console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
    process.exitCode = 1
    return
  }
  if (unavailable.length > 0) console.warn(`⚠️ 忽略本机未检测到的 Agent：${unavailable.join("、")}（不凭空创建配置）`)
  if (adapters.length === 0) {
    console.log(line.hint("未检测到可接入的 Agent"))
    return
  }
  const { config, paths } = createContext(options.dir)
  const activity = readHookActivity(paths)
  const lastError = readLastHookError(paths)
  const installed: string[] = []
  for (const adapter of adapters) {
    const status = adapter.status()
    if (status.installed) installed.push(adapter.id)
    const detected = isAdapterAvailable(adapter)
    console.log(`${adapter.displayName}：${status.installed ? "已安装" : "未安装"}｜${status.file}${detected ? "" : "（本机未检测到安装）"}`)
    if (status.command) console.log(`  命令：${status.command}`)
    if (status.legacyCommand) {
      console.warn(`  ⚠️ 检测到旧版 Hook（telemetry 命令）已失效，请执行 toolkit usage hooks install --agent ${adapter.id}`)
    }
    if (status.outdatedCommand) {
      console.warn(`  ⚠️ Hook 命令的平台形态已过期（按旧版方式生成），在所在系统上无法执行，请执行 toolkit usage hooks install --agent ${adapter.id}`)
    }
    if (status.missingPaths) {
      console.warn(`  ⚠️ Hook 命令中的路径已不存在，需重跑 toolkit usage hooks install --agent ${adapter.id}：${status.missingPaths.join("、")}`)
    }
    if (status.lastError) console.log(`  ⚠️ ${status.lastError}`)
    for (const warning of status.warnings ?? []) console.warn(`  ⚠️ ${warning}`)
    const last = activity[adapter.id]
    if (last) console.log(`  最近触发：${formatLocalTime(last.lastTriggerAt)}（${last.lastStatus}）`)
    else if (status.installed) console.log("  最近触发：暂无记录（Hook 已配置，但 Agent 尚未执行过）")
  }
  if (config.channel === "rule" && installed.length > 0) {
    console.warn(`⚠️ 采集通道为 rule（全局规则上报），但仍有 Hook：${installed.join("、")}；建议执行 toolkit usage hooks remove 清理，避免重复采集`)
  }
  if (config.channel === "hook" && installed.length === 0) {
    console.warn("⚠️ 采集通道为 hook，但未安装任何 Hook；执行 toolkit usage hooks install，或切换为 rule（toolkit usage channel rule）")
  }
  if (lastError) console.log(`最近 Hook 错误：${lastError}`)
}

// Hook 安装：写前统一预览与确认，非交互须显式 --yes
export async function installUsageHooks(options: { agent?: string; dryRun?: boolean; yes?: boolean } = {}): Promise<void> {
  if (!options.yes && !options.dryRun && !requireInteractive({ action: "usage hooks install", hint: "非交互请加 --yes，或执行 toolkit usage --help" })) return
  const { adapters, invalid, unavailable } = resolveAdapters(splitAgentNames(options.agent))
  if (invalid.length > 0) {
    console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
    process.exitCode = 1
    return
  }
  if (unavailable.length > 0) console.warn(`⚠️ 忽略本机未检测到的 Agent：${unavailable.join("、")}（不凭空创建配置）`)
  if (adapters.length === 0) {
    console.error("⚠️ 没有可接入的 Agent：请先安装对应工具，或用 --agent 指定已安装的 Agent")
    process.exitCode = 1
    return
  }
  const confirmed = await confirmWrite({
    title: "即将安装 Hook：",
    lines: adapters.map((adapter) => `${adapter.displayName} → ${adapter.configPath()}`),
    yes: options.yes,
    dryRun: options.dryRun,
  })
  if (options.dryRun) return
  if (!confirmed) {
    console.error(line.hint("已取消，未写入任何文件"))
    return
  }
  installHooks(adapters)
  // 通道不自动切换：只提示冲突，由用户决定改用哪条通道
  if (loadUsageConfig().channel === "rule") {
    console.warn("⚠️ 当前采集通道为 rule（全局规则上报）：Hook 已安装但不会写入，需先执行 toolkit usage channel hook")
  }
  console.log(line.hint("Hook 安装不等于开启采集；用 toolkit usage enable 打开总开关"))
}

// Hook 卸载：只移除本包命令；写前预览，非交互须显式 --yes
export async function removeUsageHooks(options: { agent?: string; yes?: boolean } = {}): Promise<void> {
  if (!options.yes && !requireInteractive({ action: "usage hooks remove", hint: "非交互请加 --yes，或执行 toolkit usage --help" })) return
  const { adapters, invalid } = resolveAdapters(splitAgentNames(options.agent), { allowUnavailable: true })
  if (invalid.length > 0) {
    console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
    process.exitCode = 1
    return
  }
  const lines = adapters.map((adapter) => {
    const status = adapter.status()
    return `${status.installed || status.legacyCommand ? "移除" : "未发现"}：${adapter.displayName}｜${status.file}`
  })
  const confirmed = await confirmWrite({ title: "即将移除 Hook：", lines, yes: options.yes })
  if (!confirmed) {
    console.error(line.hint("已取消，未写入任何文件"))
    return
  }
  for (const adapter of adapters) {
    const result = adapter.uninstallHooks()
    console.log(`${adapter.displayName}：${result.changed ? "已移除 Hook" : "未发现本包 Hook"}｜${result.file}`)
  }
}

// 菜单子页：Hook 管理
async function hooksFlow(): Promise<void> {
  const action = await runMenu<string>({
    message: "Hook 管理",
    back: true,
    choices: [
      { name: "查看状态", value: "status" },
      { name: "安装 Hook…", value: "install" },
      { name: "卸载 Hook…", value: "remove" },
    ],
  })
  if (action === "back" || action === "exit") return
  if (action === "status") {
    printHooksStatus()
    return
  }
  if (action === "install") {
    const detected = detectedAdapters()
    if (detected.length === 0) {
      console.log(line.hint("未检测到可接入的 Agent"))
      return
    }
    const picked = await askCheckbox({
      message: "选择要安装 Hook 的 Agent（安装不等于开启采集）",
      choices: detected.map((adapter) => ({ name: adapter.displayName, value: adapter.id })),
      pageSize: LIST_PAGE_SIZE,
    })
    if (picked === null || picked.length === 0) return
    await installUsageHooks({ agent: picked.join(","), yes: true })
    return
  }
  const installed = AGENT_ADAPTERS.filter((adapter) => {
    try {
      return adapter.status().installed
    } catch {
      return false
    }
  })
  if (installed.length === 0) {
    console.log(line.hint("未发现本包 Hook"))
    return
  }
  const picked = await askCheckbox({
    message: "选择要移除 Hook 的 Agent",
    choices: installed.map((adapter) => ({ name: adapter.displayName, value: adapter.id })),
    pageSize: LIST_PAGE_SIZE,
  })
  if (picked === null || picked.length === 0) return
  await removeUsageHooks({ agent: picked.join(","), yes: true })
}

// 菜单子页：导出 / 清理
async function maintenanceFlow(): Promise<void> {
  const action = await runMenu<string>({
    message: "导出 / 清理",
    back: true,
    choices: [
      { name: "导出事件到文件（JSONL）", value: "export" },
      { name: "清理早于保留期的事件", value: "purge" },
    ],
  })
  if (action === "back" || action === "exit") return
  if (action === "export") {
    const out = await askInput({ message: "导出文件路径", default: "usage-events.jsonl" })
    if (!out) return
    exportUsageEvents({ out })
    return
  }
  purgeUsageEvents({ dryRun: true })
  const confirmed = await askConfirm({ message: "确认删除上述记录？", default: false })
  if (confirmed !== true) return
  purgeUsageEvents({})
}

// 菜单子页：总开关
async function toggleFlow(): Promise<void> {
  const current = loadUsageConfig()
  const next = !current.enabled
  const confirmed = await confirmWrite({
    title: "即将修改总开关：",
    lines: [`技能使用情况：${current.enabled ? "开启 → 关闭" : "关闭 → 开启"}`, `配置：${usageConfigPath()}`],
  })
  if (!confirmed) {
    console.error(line.hint("已取消，未修改任何文件"))
    return
  }
  updateUsageConfig({ enabled: next })
  console.log(line.ok(next ? "技能使用情况已开启" : "技能使用情况已关闭"))
}

// 无参菜单：每项调用对应子命令的实现；顶层退出、Ctrl+C 取消
export async function runUsageWizard(): Promise<void> {
  if (!requireInteractive({ action: "usage 向导", hint: "非交互请直接使用 toolkit usage 子命令，或在终端运行 toolkit usage wizard" })) return
  for (;;) {
    const config = loadUsageConfig()
    const action = await runMenu<string>({
      message: "技能使用情况",
      choices: [
        { name: "查看状态", value: "info" },
        { name: "查看统计", value: "stats" },
        { name: `打开 / 关闭采集（当前：${config.enabled ? "已开启" : "已关闭"}）…`, value: "toggle" },
        { name: "管理 Hook…", value: "hooks" },
        { name: "配置上传…", value: "upload" },
        { name: "导出 / 清理…", value: "maintenance" },
      ],
    })
    if (action === "exit") return
    if (action === "info") printUsageInfo()
    else if (action === "stats") printDefaultStats(10)
    else if (action === "toggle") await toggleFlow()
    else if (action === "hooks") await hooksFlow()
    else if (action === "upload") await runUploadSetup()
    else if (action === "maintenance") await maintenanceFlow()
  }
}

