// 使用情况 CLI（upload）：自 commands.ts 按子命令组拆分，文案与顺序逐字未改
import type { Command } from "commander"
import { assertJsonFormat } from "../../json-output"
import { runUploadSetup, uploadOnce, uploadStatus } from "../upload"
import { printJson } from "./context"


export function registerUsageUploadCommands(usage: Command): void {
    // 可选上传：默认关闭；配置向导、状态与手工发送
    const upload = usage.command("upload").description("可选上传（默认关闭；需显式配置端点）")
    upload
      .command("setup")
      .description("上传配置向导：协议、端点、请求头与启用确认")
      .option("--yes", "非交互执行，需同时给出协议与端点")
      .option("--protocol <name>", "webhook / otlp-http / file")
      .option("--endpoint <value>", "上传端点或导出路径")
      .option("--headers <json>", "附加请求头 JSON")
      .action(async (options: { yes?: boolean; protocol?: string; endpoint?: string; headers?: string }) => {
        await runUploadSetup(options)
      })
    upload
      .command("status")
      .description("查看上传开关、端点与待上传数量")
      .option("--format <format>", "输出格式（json）")
      .action((options: { format?: string }) => {
        if (!assertJsonFormat(options.format)) return
        const report = uploadStatus()
        if (options.format === "json") printJson(report)
        else {
          console.log(`上传：${report.enabled ? "已开启" : "已关闭"}`)
          console.log(`协议：${report.protocol}｜端点：${report.endpoint || "未配置"}`)
          console.log(`已发送：${report.sent} 条｜待上传：${report.pending} 条`)
        }
      })
    upload
      .action(() => {
        const report = uploadStatus()
        console.log(`上传：${report.enabled ? "已开启" : "已关闭"}；待上传 ${report.pending} 条`)
        console.log("使用 upload send --dry-run 预览，upload send 发送，upload setup 配置")
      })
    upload
      .command("send")
      .description("发送一批事件（--dry-run 只预览）")
      .option("--dry-run", "只预览批次与载荷，不发送")
      .option("--limit <count>", "单批条数（默认取配置 batchSize）")
      .action(async (options: { dryRun?: boolean; limit?: string }) => {
        let limit: number | undefined
        if (options.limit !== undefined) {
          limit = Number(options.limit)
          if (!Number.isInteger(limit) || limit <= 0) {
            console.error("⚠️ --limit 须为正整数")
            process.exitCode = 1
            return
          }
        }
        try {
          const result = await uploadOnce({ dryRun: Boolean(options.dryRun), limit })
          if (result.dryRun) {
            console.log(`预演：待上传 ${result.pending} 条 → ${result.endpoint}`)
            const preview = result.preview as { events?: unknown[] }
            if (Array.isArray(preview.events) && preview.events[0]) console.log(JSON.stringify(preview.events[0], null, 2))
          } else {
            console.log(`已上传 ${result.sent} 条，剩余 ${result.pending} 条`)
          }
        } catch (error) {
          console.error(`⚠️ ${(error as Error).message}`)
          process.exitCode = 1
        }
      })
}
