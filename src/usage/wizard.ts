// 使用情况向导：初始化与无参数菜单；所有选择都有默认值，取消时不留下半成品
import { detectedAdapters, resolveAdapters } from "./adapters"
import type { AgentAdapter } from "./adapters/types"
import { buildHookCommand } from "./ingest"
import { loadUsageConfig, resolveUsageDir, usageConfigPath, updateUsageConfig } from "./config"
import { purgeEvents, readAllEvents, usagePaths } from "./store"
import { summarize } from "./stats"
import { runUploadSetup } from "./upload"
import type { UsageConfig, UsageRotation, UsageSkillMode } from "./types"

// 预设：默认保持关闭；已配置时可沿用当前配置
type Preset = "keep" | "off" | "recommended" | "third-party" | "custom" | "advanced"

// 初始化选项：--yes 走非交互路径，只支持 off / recommended / third-party
export interface InitWizardOptions {
  yes?: boolean
  preset?: string
  agent?: string
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

// 非交互初始化：按预设写入配置并安装 Hook，不做任何提问
function runNonInteractiveInit(options: InitWizardOptions): void {
  const preset = options.preset ?? "off"
  if (preset === "off") {
    console.log("保持关闭，未修改任何文件")
    return
  }
  if (preset !== "recommended" && preset !== "third-party") {
    console.error("⚠️ 非交互模式仅支持 --preset off / recommended / third-party")
    process.exitCode = 1
    return
  }
  const { adapters, invalid } = resolveAdapters(splitAgentNames(options.agent))
  if (invalid.length > 0) {
    console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
    process.exitCode = 1
    return
  }
  if (adapters.length === 0) {
    console.error("⚠️ 未检测到可接入的 Agent，可用 --agent 显式指定")
    process.exitCode = 1
    return
  }
  const config = loadUsageConfig()
  const dir = resolveUsageDir(undefined, config)
  updateUsageConfig({
    enabled: true,
    agents: Object.fromEntries(adapters.map((adapter) => [adapter.id, true])),
    sources: { firstParty: true, thirdParty: preset === "third-party", unmanaged: false },
    skills: { mode: "all", include: [], exclude: [] },
    capture: { triggerPrompt: false, skillArgs: false, outcome: false },
    storage: { dir, rotation: "monthly", retentionDays: 180 },
  })
  installHooks(adapters)
  console.log(`已启用技能使用情况（${preset}），数据目录：${dir}`)
}

// 用户取消（Ctrl+C / ESC）：inquirer 以 ExitPromptError 抛出
function isCancel(error: unknown): boolean {
  return error instanceof Error && (error.name === "ExitPromptError" || error.name === "AbortPromptError")
}

// 非 TTY：禁止交互，打印可执行命令并以退出码 2 结束
function requireTty(): boolean {
  if (process.stdin.isTTY && process.stdout.isTTY) return true
  console.error("⚠️ 当前环境不支持交互，请显式传入参数，或执行 toolkit usage --help")
  process.exitCode = 2
  return false
}

// 打印配置摘要：向导预览与菜单共用
function printConfigSummary(agents: string[], firstParty: boolean, thirdParty: boolean, mode: UsageSkillMode, dir: string, rotation: UsageRotation, retention: number): void {
  console.log("")
  console.log("即将应用：")
  console.log(`  Agent：${agents.length > 0 ? agents.join("、") : "无"}`)
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
  if (!requireTty()) return
  const { select, checkbox, confirm, input } = await import("@inquirer/prompts")
  try {
    const detected = detectedAdapters()
    if (detected.length === 0) {
      console.log("未检测到可接入的 Agent（Trae / Claude Code）；安装后重跑 toolkit usage init")
      return
    }
    const existingConfig = loadUsageConfig()
    const defaults = resolveInitDefaults(existingConfig)
    const presetChoices: Array<{ name: string; value: Preset }> = [
      ...(defaults.configured ? [{ name: "保持当前配置（按现有选择重装 Hook）", value: "keep" as Preset }] : []),
      { name: "保持关闭（不安装 Hook、不采集）", value: "off" },
      { name: "推荐：仅本地 + toolkit 一方技能", value: "recommended" },
      { name: "本地 + toolkit 一方与第三方技能", value: "third-party" },
      { name: "自定义（沿用并修改当前选择）", value: "custom" },
      { name: "高级：本地 + 上传", value: "advanced" },
    ]
    const preset = await select<Preset>({
      message: defaults.configured ? "选择技能使用情况预设（默认沿用当前配置）" : "选择技能使用情况预设（默认保持关闭）",
      default: defaults.configured ? "keep" : "off",
      choices: presetChoices,
    })
    if (preset === "off") {
      console.log("保持关闭，未修改任何文件。需要时执行 toolkit usage enable")
      return
    }
    if (preset === "keep") {
      const selected = detected.filter((adapter) => defaults.agents.includes(adapter.id))
      if (selected.length === 0) {
        console.log("当前配置没有可接入且已启用的 Agent，请改用「自定义」重新选择")
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
      )
      if (!existingConfig.enabled) console.log("  ⚠️ 当前总开关关闭：Hook 会重装，但不会写入事件")
      const applyKeep = await confirm({ message: "按当前配置重装 Hook？", default: true })
      if (!applyKeep) {
        console.log("已取消，未修改任何文件")
        return
      }
      installHooks(selected)
      console.log("已按当前配置重装 Hook")
      return
    }

    const agentIds = await checkbox<string>({
      message: "选择要接入的 Agent（空格切换，回车确认）",
      choices: detected.map((adapter) => ({ name: adapter.displayName, value: adapter.id, checked: defaults.agents.includes(adapter.id) })),
      required: false,
    })
    const selected = detected.filter((adapter) => agentIds.includes(adapter.id))
    if (selected.length === 0) {
      console.log("未选择 Agent，未修改任何文件")
      return
    }

    // 仅「自定义」回填历史值；推荐 / 第三方 / 高级仍按预设语义取值
    const usingSaved = preset === "custom"
    if (usingSaved && defaults.configured) console.log("⚠️ 本次选择将覆盖现有配置（如需保留原值请重跑并选「保持当前配置」)")
    const firstParty = await confirm({ message: "统计 toolkit 一方技能（fxri-*）？", default: usingSaved ? defaults.firstParty : true })
    const thirdParty =
      preset === "third-party" || preset === "advanced"
        ? true
        : await confirm({ message: "统计 toolkit 分发的第三方技能？", default: usingSaved ? defaults.thirdParty : false })
    const mode = await select<UsageSkillMode>({
      message: "技能统计范围",
      default: usingSaved ? defaults.mode : "all",
      choices: [
        { name: "全部已开启来源", value: "all" },
        { name: "只统计指定技能", value: "include" },
        { name: "排除指定技能", value: "exclude" },
        { name: "不统计任何技能", value: "none" },
      ],
    })
    let include: string[] = []
    if (mode === "include" || mode === "exclude") {
      const savedList = mode === "include" ? defaults.include : defaults.exclude
      const raw = await input({
        message: mode === "include" ? "要统计的技能名（逗号分隔）" : "要排除的技能名（逗号分隔）",
        default: usingSaved ? savedList.join("，") : "",
      })
      include = raw.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
    }
    const triggerPrompt = await confirm({ message: "采集触发词（截断 200 字并脱敏）？", default: usingSaved ? defaults.triggerPrompt : false })
    const skillArgs = await confirm({ message: "采集技能参数（截断 500 字并脱敏）？", default: usingSaved ? defaults.skillArgs : false })
    const outcome = await confirm({ message: "采集执行结果与耗时？", default: usingSaved ? defaults.outcome : false })
    const dir = await input({ message: "数据目录", default: usingSaved ? defaults.dir : resolveUsageDir(undefined, existingConfig) })
    const rotation = await select<UsageRotation>({
      message: "事件文件轮转",
      default: usingSaved ? defaults.rotation : "monthly",
      choices: [
        { name: "按月轮转", value: "monthly" },
        { name: "按文件大小轮转", value: "size" },
        { name: "不轮转", value: "none" },
      ],
    })
    const retentionRaw = await input({ message: "保留天数", default: usingSaved ? String(defaults.retentionDays) : "180" })
    const retention = Number(retentionRaw)
    if (!Number.isInteger(retention) || retention <= 0) {
      console.error("⚠️ 保留天数须为正整数，未修改任何文件")
      return
    }

    printConfigSummary(selected.map((adapter) => adapter.displayName), firstParty, thirdParty, mode, dir, rotation, retention)
    console.log("  Hook 将写入：")
    for (const adapter of selected) console.log(`    ${adapter.displayName} → ${adapter.configPath()}`)

    const apply = await confirm({ message: "确认写入配置并安装 Hook？", default: false })
    if (!apply) {
      console.log("已取消，未修改任何文件")
      return
    }

    updateUsageConfig({
      enabled: true,
      agents: Object.fromEntries(selected.map((adapter) => [adapter.id, true])),
      sources: { firstParty, thirdParty, unmanaged: false },
      skills: { mode, include: mode === "include" ? include : [], exclude: mode === "exclude" ? include : [] },
      capture: { triggerPrompt, skillArgs, outcome },
      storage: { dir, rotation, retentionDays: retention },
    })
    installHooks(selected)
    if (preset === "advanced") await runUploadSetup()
    console.log("")
    console.log("已启用技能使用情况。下一步：")
    console.log("  toolkit usage info")
    console.log("  toolkit usage stats")
  } catch (error) {
    if (isCancel(error)) {
      console.log("已取消，未修改任何文件")
      return
    }
    throw error
  }
}

// 卸载：停用采集、移除本包 Hook；默认保留数据，--purge 才删除事件
export async function runUsageUninstall(options: UninstallOptions = {}): Promise<void> {
  if (!options.yes && !options.dryRun && !requireTty()) return
  const { adapters, invalid } = resolveAdapters(splitAgentNames(options.agent))
  if (invalid.length > 0) {
    console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
    process.exitCode = 1
    return
  }
  let removeHooks = true
  let purge = Boolean(options.purge)
  try {
    if (!options.yes && !options.dryRun) {
      const { confirm } = await import("@inquirer/prompts")
      const disable = await confirm({ message: "停用技能使用情况总开关？", default: true })
      if (!disable) {
        console.log("已取消，未修改任何文件")
        return
      }
      removeHooks = await confirm({ message: "卸载已安装的 Hook？", default: true })
      purge = await confirm({ message: "同时删除本地事件？", default: false })
    }
    // 预演：只打印将执行的动作，不写配置、不动 Hook、不删数据
    if (options.dryRun) {
      console.log("[预演] 将停用技能使用情况总开关")
      if (removeHooks) {
        for (const adapter of adapters) {
          const status = adapter.status()
          const verb = status.installed || status.legacyCommand ? "将移除" : "未发现"
          console.log(`[预演] ${verb} Hook：${adapter.displayName}｜${status.file}`)
        }
      }
      if (purge) {
        const config = loadUsageConfig()
        console.log(`[预演] 将删除本地事件：${resolveUsageDir(undefined, config)}`)
      }
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
      const config = loadUsageConfig()
      const paths = usagePaths(resolveUsageDir(undefined, config))
      const removed = purgeEvents(paths, { all: true })
      console.log(`已删除 ${removed} 条本地事件`)
    }
    console.log("技能使用情况已停用；如需彻底删除数据，重跑时加 --purge")
  } catch (error) {
    if (isCancel(error)) {
      console.log("已取消，未修改任何文件")
      return
    }
    throw error
  }
}

// 无参数菜单：每项执行后回到菜单，q 退出
export async function runUsageMenu(): Promise<void> {
  if (!requireTty()) return
  const { select, confirm } = await import("@inquirer/prompts")
  try {
    for (;;) {
      const action = await select<string>({
        message: "技能使用情况",
        default: "status",
        choices: [
          { name: "查看状态", value: "status" },
          { name: "查看统计", value: "stats" },
          { name: "修改开关", value: "toggle" },
          { name: "管理 Hook", value: "hooks" },
          { name: "配置上传", value: "upload" },
          { name: "导出 / 清理", value: "maintenance" },
          { name: "退出", value: "quit" },
        ],
      })
      if (action === "quit") return
      if (action === "status") {
        const config = loadUsageConfig()
        const dir = resolveUsageDir(undefined, config)
        console.log(`技能使用情况：${config.enabled ? "已开启" : "已关闭"}；数据目录：${dir}；配置：${usageConfigPath()}`)
        continue
      }
      if (action === "stats") {
        const config = loadUsageConfig()
        const paths = usagePaths(resolveUsageDir(undefined, config))
        const summary = summarize(readAllEvents(paths))
        console.log(`共 ${summary.total} 条；技能 ${summary.bySkill.length} 个`)
        for (const item of summary.bySkill.slice(0, 10)) console.log(`  ${item.skill}  ${item.count} 次`)
        continue
      }
      if (action === "toggle") {
        const current = loadUsageConfig()
        const enabled = await confirm({ message: `当前${current.enabled ? "已开启" : "已关闭"}，是否${current.enabled ? "关闭" : "开启"}？`, default: true })
        if (enabled) {
          updateUsageConfig({ enabled: !current.enabled })
          console.log(current.enabled ? "已关闭" : "已开启")
        }
        continue
      }
      if (action === "hooks") {
        const detected = detectedAdapters()
        if (detected.length === 0) {
          console.log("未检测到可接入的 Agent")
          continue
        }
        for (const adapter of detected) {
          const status = adapter.status()
          console.log(`${adapter.displayName}：${status.installed ? "已安装" : "未安装"}｜${status.file}`)
        }
        const install = await confirm({ message: "是否为已检测的 Agent 安装 Hook？", default: false })
        if (install) {
          installHooks(detected)
          updateUsageConfig({ agents: Object.fromEntries(detected.map((adapter) => [adapter.id, true])) })
          console.log("Hook 已安装；采集总开关仍需 toolkit usage enable")
        }
        continue
      }
      if (action === "upload") {
        await runUploadSetup()
        continue
      }
      if (action === "maintenance") {
        console.log("导出：toolkit usage export --format jsonl --out events.jsonl")
        console.log("清理：toolkit usage purge --older-than 180")
        continue
      }
    }
  } catch (error) {
    if (isCancel(error)) return
    throw error
  }
}

