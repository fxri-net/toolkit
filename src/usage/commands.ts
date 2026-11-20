// 使用情况 CLI：配置开关、统计查询、导出导入、初始化向导与 Hook 管理
import type { Command } from "commander"
import { isInteractive, runInteractive } from "../prompts"
import { runUsageWizard } from "./wizard"
import { printUsageInfo } from "./cli/context"
import { flushQueue } from "./flush"
import { registerUsageLifecycleCommands } from "./cli/lifecycle"
import { registerUsageConfigCommands } from "./cli/config"
import { registerUsageUploadCommands } from "./cli/upload-cmd"
import { registerUsageDataCommands } from "./cli/data"
import { line } from "../term-style"

// 注册 usage 命令域：所有子命令默认只读或显式写全局配置
export function registerUsageCommands(program: Command): void {
  const usage = program
    .command("usage")
    .description("技能使用情况：本机统计、开关与导出（默认关闭，数据只留在本机）")

  // 裸命令：非 TTY 输出状态摘要并成功退出；交互入口显式交给 usage wizard
  usage.action(async () => {
    if (!isInteractive()) {
      printUsageInfo()
      console.log(line.hint("交互向导请运行 toolkit usage wizard；单项操作见 toolkit usage --help"))
      return
    }
    await runInteractive(() => runUsageWizard())
  })

  usage
    .command("wizard")
    .description("交互向导：状态、统计、开关、Hook、上传、导出与清理")
    .action(async () => {
      await runInteractive(() => runUsageWizard())
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
