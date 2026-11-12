// 使用情况 CLI（lifecycle）：自 commands.ts 按子命令组拆分，文案与顺序逐字未改
import type { Command } from "commander"
import { assertJsonFormat } from "../../json-output"
import { AGENT_ADAPTERS, isAdapterAvailable, resolveAdapters } from "../adapters"
import { ingestFromStdin, readHookActivity, readLastHookError } from "../ingest"
import { uploadStatus } from "../upload"
import { installHooks, runUsageInitWizard, runUsageUninstall } from "../wizard"
import { loadUsageConfig, usageConfigPath } from "../config"
import { queueCount } from "../queue"
import { listEventFiles, readAllEvents, readIndex } from "../store"
import { createContext, formatLocalTime, printConfig, printJson, splitNames } from "./context"


export function registerUsageLifecycleCommands(usage: Command): void {
    // 初始化向导：执行即启用，所有选择都有默认值；--yes 走非交互预设且须显式给 --preset
    usage
      .command("init")
      .description("初始化技能使用情况：选择 Agent、来源、字段与存储（执行即启用，默认统计一方与第三方技能）")
      .option("--yes", "非交互执行，需配合 --preset 使用")
      .option("--preset <name>", "非交互预设：off / recommended / third-party")
      .option("--channel <mode>", "采集通道：rule（默认，全局规则上报）/ hook（Agent Hook）")
      .option("--agent <names>", "非交互模式指定 Agent（逗号分隔，仅 hook 通道需要）")
      .action(async (options: { yes?: boolean; preset?: string; agent?: string; channel?: string }) => {
        await runUsageInitWizard(options)
      })

    // 卸载：停用采集、移除 Hook；默认保留数据
    usage
      .command("uninstall")
      .description("停用技能使用情况并卸载 Hook（默认保留本地事件）")
      .option("--yes", "非交互执行")
      .option("--agent <names>", "只处理指定 Agent（逗号分隔）")
      .option("--purge", "同时删除本地事件")
      .option("--dry-run", "只预览将停用的配置与将移除的 Hook，不写盘")
      .action(async (options: { yes?: boolean; agent?: string; purge?: boolean; dryRun?: boolean }) => {
        await runUsageUninstall(options)
      })

    // Hook 内部入口：从 stdin 读取事件；stdout 保持为空，避免干扰 Agent
    usage
      .command("ingest", { hidden: true })
      .description("内部命令：从 stdin 读取 Hook 事件")
      .requiredOption("--agent <id>", "Agent 适配器 id")
      .action(async (options: { agent: string }) => {
        await ingestFromStdin(options.agent)
        process.exitCode = 0
      })

    // Hook 管理：安装 / 状态 / 卸载
    const hooks = usage
      .command("hooks")
      .description("管理 Agent Hook（安装 / 状态 / 卸载）")

    hooks
      .command("install")
      .description("安装 Hook（只写配置，不开启采集）")
      .option("--agent <names>", "只处理指定 Agent（逗号分隔）")
      .option("--dry-run", "只预览，不写文件")
      .action((options: { agent?: string; dryRun?: boolean }) => {
        const { adapters, invalid, unavailable } = resolveAdapters(splitNames(options.agent))
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
        installHooks(adapters, Boolean(options.dryRun))
        // 通道不自动切换：只提示冲突，由用户决定改用哪条通道
        if (loadUsageConfig().channel === "rule") {
          console.warn("⚠️ 当前采集通道为 rule（全局规则上报）：Hook 已安装但不会写入，需先执行 toolkit usage channel hook")
        }
        console.log("Hook 安装不等于开启采集；用 toolkit usage enable 打开总开关")
      })

    hooks
      .command("status")
      .description("查看 Hook 安装状态与最近触发时间")
      .option("--agent <names>", "只查看指定 Agent（逗号分隔）")
      .option("--all", "包含本机未安装的 Agent（用于查看残留配置）")
      .option("--dir <path>", "本次使用的数据目录")
      .action((options: { agent?: string; all?: boolean; dir?: string }) => {
        const { adapters, invalid, unavailable } = resolveAdapters(splitNames(options.agent), { allowUnavailable: Boolean(options.all) })
        if (invalid.length > 0) {
          console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
          process.exitCode = 1
          return
        }
        if (unavailable.length > 0) console.warn(`⚠️ 忽略本机未检测到的 Agent：${unavailable.join("、")}（不凭空创建配置）`)
        if (adapters.length === 0) {
          console.log("未检测到可接入的 Agent")
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
      })

    hooks
      .command("remove")
      .description("卸载 Hook（只移除本包命令，不影响其它 Hook）")
      .option("--agent <names>", "只处理指定 Agent（逗号分隔）")
      .action((options: { agent?: string }) => {
        // 移除是清理场景：工具已卸载也要能清掉它留下的 Hook
        const { adapters, invalid } = resolveAdapters(splitNames(options.agent), { allowUnavailable: true })
        if (invalid.length > 0) {
          console.error(`⚠️ 未知 Agent：${invalid.join("、")}`)
          process.exitCode = 1
          return
        }
        for (const adapter of adapters) {
          const result = adapter.uninstallHooks()
          console.log(`${adapter.displayName}：${result.changed ? "已移除 Hook" : "未发现本包 Hook"}｜${result.file}`)
        }
      })

    // 状态：配置、目录与事件计数
    usage
      .command("info")
      .description("查看技能使用情况：开关、数据目录与事件计数")
      .option("--dir <path>", "本次使用的数据目录")
      .option("--format <format>", "输出格式（json）")
      .action((options: { dir?: string; format?: string }) => {
        if (!assertJsonFormat(options.format)) return
        const { config, dir, paths } = createContext(options.dir)
        const index = readIndex(paths)
        const files = listEventFiles(paths)
        const events = readAllEvents(paths)
        const last = events.reduce<string | undefined>((acc, event) => (!acc || event.occurredAt > acc ? event.occurredAt : acc), undefined)
        const installedHooks = AGENT_ADAPTERS.filter((adapter) => {
          try {
            return adapter.status().installed
          } catch {
            return false
          }
        }).map((adapter) => adapter.id)
        const upload = uploadStatus()
        const lastHookError = readLastHookError(paths)
        const report = {
          enabled: config.enabled,
          channel: config.channel,
          queued: queueCount(paths),
          configFile: usageConfigPath(),
          dataDir: dir,
          eventFiles: files.length,
          events: events.length,
          indexed: index.eventIds.length,
          lastEventAt: last ?? null,
          hooks: installedHooks,
          upload: { enabled: upload.enabled, pending: upload.pending },
          lastHookError: lastHookError ?? null,
        }
        if (options.format === "json") {
          printJson(report)
          return
        }
        printConfig(config, dir)
        if (config.channel === "rule") console.log("规则入口：toolkit usage rule（输出可复制到全局规则的文案）")
        console.log(`Hook：${installedHooks.length > 0 ? installedHooks.join("、") : "未安装"}`)
        console.log(`队列：${report.queued} 条待处理`)
        console.log(`事件：${report.events} 条（索引 ${report.indexed} 条，文件 ${report.eventFiles} 个）`)
        console.log(`最近：${report.lastEventAt ?? "暂无"}`)
        if (lastHookError) console.log(`最近 Hook 错误：${lastHookError}`)
      })
}
