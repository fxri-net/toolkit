// 使用情况 CLI：按 show / data / config / setup 四组装配；上报与补录保留在顶层
import type { Command } from "commander"
import { isInteractive, runInteractive } from "../prompts"
import { runUsageWizard } from "./wizard"
import { printUsageInfo } from "./cli/context"
import { flushQueue } from "./flush"
import { registerUsageSetupCommands, registerUsageShowCommands } from "./cli/lifecycle"
import { registerUsageConfigCommands } from "./cli/config"
import { registerUsageUploadCommands } from "./cli/upload-cmd"
import { registerUsageDataCommands, registerUsageStatsCommands } from "./cli/data"
import { line } from "../term-style"

// 注册 usage 命令域：所有子命令默认只读或显式写全局配置
export function registerUsageCommands(program: Command): void {
  const usage = program
    .command("usage")
    .description("技能使用情况：本机统计、开关与导出（默认关闭，数据只留在本机）")

  // 裸命令：非 TTY 输出状态摘要并成功退出；交互入口显式交给 usage setup wizard
  usage.action(async () => {
    if (!isInteractive()) {
      printUsageInfo()
      console.log(line.hint("交互向导请运行 toolkit usage setup wizard；单项操作见 toolkit usage --help"))
      return
    }
    await runInteractive(() => runUsageWizard())
  })

  // 四组：show 看现场与统计、data 管事件、config 改采集配置、setup 管生命周期
  const show = usage.command("show").description("查看使用情况现场：开关、数据目录与事件计数（默认）")
  const data = usage.command("data").description("事件数据：导出 / 导入 / 去重 / 清理 / 重建索引")
  const config = usage.command("config").description("采集配置：通道 / 来源 / 范围 / 字段 / 存储 / 上传")
  const setup = usage.command("setup").description("生命周期：初始化 / 停用 / Hook 与交互向导")

  registerUsageShowCommands(show)
  // 统计为 show 的二级视图（usage show stats）
  registerUsageStatsCommands(show)
  registerUsageDataCommands(data, usage)
  registerUsageConfigCommands(config)
  registerUsageUploadCommands(config)
  registerUsageSetupCommands(setup, usage)

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
}
