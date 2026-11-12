// 使用情况 CLI：配置开关、统计查询、导出导入、初始化向导与 Hook 管理
import type { Command } from "commander"
import { runUsageMenu } from "./wizard"
import { flushQueue } from "./flush"
import { registerUsageLifecycleCommands } from "./cli/lifecycle"
import { registerUsageConfigCommands } from "./cli/config"
import { registerUsageUploadCommands } from "./cli/upload-cmd"
import { registerUsageDataCommands } from "./cli/data"

// 注册 usage 命令域：所有子命令默认只读或显式写全局配置
export function registerUsageCommands(program: Command): void {
  const usage = program
    .command("usage")
    .description("技能使用情况：本机统计、开关与导出（默认关闭，数据只留在本机）")

  // 无参数：进入交互菜单；非 TTY 打印帮助并以退出码 2 结束
  usage.action(async () => {
    await runUsageMenu()
  })

  // 惰性兜底：除上报与消费自身外，任何 usage 子命令启动时先消费积压队列；失败不影响当前命令
  usage.hook("preAction", (_thisCommand, actionCommand) => {
    const name = actionCommand.name()
    if (name === "record" || name === "flush" || name === "ingest") return
    try {
      flushQueue({ maxBatches: 3 })
    } catch {
      // 队列消费失败不影响命令本身
    }
  })
  registerUsageLifecycleCommands(usage)
  registerUsageConfigCommands(usage)
  registerUsageUploadCommands(usage)
  registerUsageDataCommands(usage)
}
