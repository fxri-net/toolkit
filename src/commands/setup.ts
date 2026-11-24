// setup 命令：本机接入向导的注册入口（不初始化任务区，任务区由技能调 task init）
import type { Command } from "commander"
import { EXIT } from "../exit-codes"
import { runSetupWizard, type SetupOptions } from "../setup"

// 注册 setup 命令：装配点只负责按序调用
export function registerSetupCommands(program: Command): void {
  program
    .command("setup")
    .description("本机接入向导：安装 AI 技能、配置全局规则、设置生效范围（不初始化任务区）")
    .option("--yes", "非交互：按默认值执行（设置生效范围与开启使用统计不执行）")
    .option("--dry-run", "只预览将执行的动作，不写盘")
    .option("--rules <preset>", "全局规则预设：minimal / recommended / full")
    .option("--skills <scope>", "技能分发范围：global / project / all")
    .option("--no-scope", "不设置生效范围")
    .option("--no-usage", "不开启使用统计")
    .action(async (options: SetupOptions) => {
      try {
        await runSetupWizard(options)
      } catch (e) {
        console.error(`⚠️ 接入配置失败：${(e as Error).message}`)
        process.exitCode = EXIT.FAIL
      }
    })
}
