// 使用情况 CLI（config）：自 commands.ts 按子命令组拆分，文案与顺序逐字未改
import { resolve } from "node:path"
import type { Command } from "commander"
import { assertJsonFormat } from "../../json-output"
import { line } from "../../term-style"
import { loadUsageConfig, updateUsageConfig } from "../config"
import { printSegment, splitNames } from "./context"


export function registerUsageConfigCommands(usage: Command): void {
    // 采集通道：rule 与 hook 二选一，两侧写入各自守门
    usage
      .command("channel [mode]")
      .description("查看或切换采集通道：rule（全局规则上报）/ hook（Agent Hook）")
      .option("--format <format>", "输出格式（json，输出到 stdout）")
      .action((mode: string | undefined, options: { format?: string }) => {
        if (!assertJsonFormat(options.format)) return
        const config = loadUsageConfig()
        if (mode === undefined) {
          printSegment(config, "channel", options.format)
          return
        }
        if (mode !== "rule" && mode !== "hook") {
          console.error("⚠️ 通道取值须为 rule / hook")
          process.exitCode = 1
          return
        }
        updateUsageConfig({ channel: mode })
        if (options.format === "json") {
          printSegment(loadUsageConfig(), "channel", options.format)
          return
        }
        console.log(line.ok(`采集通道已切换为 ${mode}`))
        if (mode === "rule") {
          console.log(line.hint("规则通道不依赖 Hook：把 toolkit rule compose --module usage 的输出复制进 Agent 全局规则"))
          console.log(line.hint("已安装的 Hook 需自行清理：toolkit usage setup hooks remove"))
        } else {
          console.log(line.hint("Hook 通道需安装 Hook 并配置 Agent：toolkit usage setup hooks install"))
          console.log(line.hint("已复制的规则段需自行删除，避免同一调用被记两次"))
        }
      })

    // 来源开关：一方 / 第三方 / 未托管分别独立
    usage
      .command("origins")
      .description("查看或设置来源开关（first-party / third-party / unmanaged）")
      .option("--first-party", "开启一方技能")
      .option("--no-first-party", "关闭一方技能")
      .option("--third-party", "开启第三方技能")
      .option("--no-third-party", "关闭第三方技能")
      .option("--unmanaged", "开启未托管技能")
      .option("--no-unmanaged", "关闭未托管技能")
      .option("--format <format>", "输出格式（json，输出到 stdout）")
      .action((options: { firstParty?: boolean; thirdParty?: boolean; unmanaged?: boolean; format?: string }) => {
        if (!assertJsonFormat(options.format)) return
        const patch: Record<string, unknown> = {}
        if (options.firstParty !== undefined) patch.firstParty = options.firstParty
        if (options.thirdParty !== undefined) patch.thirdParty = options.thirdParty
        if (options.unmanaged !== undefined) patch.unmanaged = options.unmanaged
        if (Object.keys(patch).length > 0) updateUsageConfig({ sources: patch })
        printSegment(loadUsageConfig(), "sources", options.format)
      })

    // 技能范围：none / all / include / exclude
    usage
      .command("scope")
      .description("查看或设置技能统计范围（none / all / include / exclude）")
      .option("--mode <mode>", "统计模式：none / all / include / exclude")
      .option("--add <names>", "加入 include / exclude 名单（逗号分隔）")
      .option("--remove <names>", "从 include / exclude 名单移除（逗号分隔）")
      .option("--format <format>", "输出格式（json，输出到 stdout）")
      .action((options: { mode?: string; add?: string; remove?: string; format?: string }) => {
        if (!assertJsonFormat(options.format)) return
        const config = loadUsageConfig()
        const mode = options.mode ?? config.skills.mode
        if (!["none", "all", "include", "exclude"].includes(mode)) {
          console.error("⚠️ --mode 取值须为 none / all / include / exclude")
          process.exitCode = 1
          return
        }
        const add = splitNames(options.add)
        const remove = new Set(splitNames(options.remove))
        const base = mode === "exclude" ? config.skills.exclude : config.skills.include
        const list = [...new Set([...base.filter((name) => !remove.has(name)), ...add])].sort()
        if (options.mode !== undefined || options.add !== undefined || options.remove !== undefined) {
          updateUsageConfig({ skills: mode === "exclude" ? { mode, exclude: list } : { mode, include: list } })
        }
        printSegment(loadUsageConfig(), "skills", options.format)
      })

    // 字段开关：触发词 / 参数 / 结果默认全部关闭
    usage
      .command("capture")
      .description("查看或设置采集字段（trigger / args / outcome）")
      .option("--trigger", "采集触发词")
      .option("--no-trigger", "不采集触发词")
      .option("--args", "采集技能参数")
      .option("--no-args", "不采集技能参数")
      .option("--outcome", "采集执行结果")
      .option("--no-outcome", "不采集执行结果")
      .option("--format <format>", "输出格式（json，输出到 stdout）")
      .action((options: { trigger?: boolean; args?: boolean; outcome?: boolean; format?: string }) => {
        if (!assertJsonFormat(options.format)) return
        const patch: Record<string, unknown> = {}
        if (options.trigger !== undefined) patch.triggerPrompt = options.trigger
        if (options.args !== undefined) patch.skillArgs = options.args
        if (options.outcome !== undefined) patch.outcome = options.outcome
        if (Object.keys(patch).length > 0) updateUsageConfig({ capture: patch })
        printSegment(loadUsageConfig(), "capture", options.format)
      })

    // 存储：目录 / 轮转 / 保留期 / 单文件上限
    usage
      .command("storage")
      .description("查看或设置本地存储（目录 / 轮转 / 保留期 / 单文件上限）")
      .option("--dir <path>", "数据目录（默认 ~/.toolkit/usage）")
      .option("--rotation <mode>", "轮转：monthly / size / none")
      .option("--retention <days>", "保留天数")
      .option("--max-size <bytes>", "单文件大小上限（字节）")
      .option("--format <format>", "输出格式（json，输出到 stdout）")
      .action((options: { dir?: string; rotation?: string; retention?: string; maxSize?: string; format?: string }) => {
        if (!assertJsonFormat(options.format)) return
        const patch: Record<string, unknown> = {}
        if (options.dir !== undefined) patch.dir = resolve(options.dir)
        if (options.rotation !== undefined) {
          if (!["monthly", "size", "none"].includes(options.rotation)) {
            console.error("⚠️ --rotation 取值须为 monthly / size / none")
            process.exitCode = 1
            return
          }
          patch.rotation = options.rotation
        }
        if (options.retention !== undefined) {
          const days = Number(options.retention)
          if (!Number.isInteger(days) || days <= 0) {
            console.error("⚠️ --retention 须为正整数")
            process.exitCode = 1
            return
          }
          patch.retentionDays = days
        }
        if (options.maxSize !== undefined) {
          const bytes = Number(options.maxSize)
          if (!Number.isInteger(bytes) || bytes <= 0) {
            console.error("⚠️ --max-size 须为正整数")
            process.exitCode = 1
            return
          }
          patch.maxFileBytes = bytes
        }
        if (Object.keys(patch).length > 0) updateUsageConfig({ storage: patch })
        printSegment(loadUsageConfig(), "storage", options.format)
      })
}
