// 使用情况 CLI（lifecycle）：show 组的信息视图，以及 setup 组的初始化 / 停用 / Hook / 向导
import type { Command } from "commander"
import { assertJsonFormat, jsonEnvelope } from "../../json-output"
import { runInteractive } from "../../prompts"
import { AGENT_ADAPTERS } from "../adapters"
import { ingestFromStdin, readLastHookError } from "../ingest"
import { uploadStatus } from "../upload"
import {
  installUsageHooks,
  printHooksStatus,
  removeUsageHooks,
  runUsageInitWizard,
  runUsageUninstall,
  runUsageWizard,
} from "../wizard"
import { usageConfigPath } from "../config"
import { queueCount } from "../queue"
import { listEventFiles, readAllEvents, readIndex } from "../store"
import { createContext, printJson, printUsageInfo } from "./context"

// show 组：裸 show 与旧 info 等价；统计视图由 data 模块追加为二级子命令
export function registerUsageShowCommands(show: Command): void {
  show
    .description("查看技能使用情况：开关、数据目录与事件计数")
    .option("--dir <path>", "本次使用的数据目录")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { dir?: string; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      if (options.format !== "json") {
        printUsageInfo(options.dir)
        return
      }
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
      printJson(jsonEnvelope({ command: "usage show", data: report }))
    })
}

// setup 组：初始化 / 停用 / Hook / 向导；ingest 为 Hook 内部入口，保留在 usage 顶层
export function registerUsageSetupCommands(setup: Command, usage: Command): void {
  // 初始化向导：执行即启用，所有选择都有默认值；--yes 走非交互预设且须显式给 --preset
  setup
    .command("init")
    .description("初始化技能使用情况：选择 Agent、来源、字段与存储（执行即启用，默认统计一方与第三方技能）")
    .option("--yes", "非交互执行，需配合 --preset 使用")
    .option("--preset <name>", "非交互预设：off / recommended / third-party")
    .option("--channel <mode>", "采集通道：rule（默认，全局规则上报）/ hook（Agent Hook）")
    .option("--agent <names>", "非交互模式指定 Agent（逗号分隔，仅 hook 通道需要）")
    .action(async (options: { yes?: boolean; preset?: string; agent?: string; channel?: string }) => {
      await runInteractive(() => runUsageInitWizard(options))
    })

  // 卸载：停用采集、移除 Hook；默认保留数据
  setup
    .command("uninstall")
    .description("停用技能使用情况并卸载 Hook（默认保留本地事件）")
    .option("--yes", "非交互执行")
    .option("--agent <names>", "只处理指定 Agent（逗号分隔）")
    .option("--purge", "同时删除本地事件")
    .option("--dry-run", "只预览将停用的配置与将移除的 Hook，不写盘")
    .action(async (options: { yes?: boolean; agent?: string; purge?: boolean; dryRun?: boolean }) => {
      await runInteractive(() => runUsageUninstall(options))
    })

  // 交互向导：状态、统计、开关、Hook、上传、导出与清理
  setup
    .command("wizard")
    .description("交互向导：状态、统计、开关、Hook、上传、导出与清理")
    .action(async () => {
      await runInteractive(() => runUsageWizard())
    })

  // Hook 管理：安装 / 状态 / 卸载
  const hooks = setup.command("hooks").description("管理 Agent Hook（安装 / 状态 / 卸载）")

  hooks
    .command("install")
    .description("安装 Hook（只写配置，不开启采集）")
    .option("--agent <names>", "只处理指定 Agent（逗号分隔）")
    .option("--yes", "跳过确认（非交互环境必须显式给出）")
    .option("--dry-run", "只预览，不写文件")
    .action(async (options: { agent?: string; yes?: boolean; dryRun?: boolean }) => {
      await runInteractive(() => installUsageHooks(options))
    })

  hooks
    .command("status")
    .description("查看 Hook 安装状态与最近触发时间")
    .option("--agent <names>", "只查看指定 Agent（逗号分隔）")
    .option("--all", "包含本机未安装的 Agent（用于查看残留配置）")
    .option("--dir <path>", "本次使用的数据目录")
    .action((options: { agent?: string; all?: boolean; dir?: string }) => {
      printHooksStatus(options)
    })

  hooks
    .command("remove")
    .description("卸载 Hook（只移除本包命令，不影响其它 Hook）")
    .option("--agent <names>", "只处理指定 Agent（逗号分隔）")
    .option("--yes", "跳过确认（非交互环境必须显式给出）")
    .action(async (options: { agent?: string; yes?: boolean }) => {
      await runInteractive(() => removeUsageHooks(options))
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
}
