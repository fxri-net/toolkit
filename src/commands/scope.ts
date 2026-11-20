// scope 命令：状态与规则清单只读；向导、目录增删与批量挂载在 TTY 下交互
import type { Command } from "commander"
import { resolveScope } from "../scope"
import { formatList, formatStatus } from "../scope/print"
import { runScopeAdd, runScopeMount, runScopeRemove, runScopeWizard } from "../scope/wizard"

// 注册 scope 命令：默认行为不变（无配置时全域生效）
export function registerScopeCommands(program: Command): void {
  const scopeCmd = program.command("scope").description("作用域：按项目 / 目录判定技能与规则是否生效（默认全域生效）")
  scopeCmd.action(async () => {
    if (!(process.stdin.isTTY && process.stdout.isTTY)) {
      scopeCmd.help()
      return
    }
    try {
      await runScopeWizard()
    } catch (error) {
      console.error(`⚠️ ${(error as Error).message}`)
      process.exitCode = 1
    }
  })

  scopeCmd
    .command("status")
    .description("查看当前目录的作用域判定与原因")
    .option("--format <format>", "输出格式（json）")
    .action((options: { format?: string }) => {
      try {
        if (options.format && options.format !== "json") console.error("⚠️ --format 仅支持 json，已回落文本输出")
        const report = resolveScope()
        for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
        if (options.format === "json") {
          const { decision } = report
          console.log(
            JSON.stringify(
              {
                active: decision.active,
                mode: decision.mode,
                sourceFile: decision.sourceFile,
                matchedRule: decision.matchedRule,
                reason: decision.reason,
              },
              null,
              2,
            ),
          )
          return
        }
        for (const line of formatStatus(report)) console.log(line)
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  scopeCmd
    .command("list")
    .description("列出作用域规则、来源与优先级")
    .option("--format <format>", "输出格式（json）")
    .action((options: { format?: string }) => {
      try {
        if (options.format && options.format !== "json") console.error("⚠️ --format 仅支持 json，已回落文本输出")
        const report = resolveScope()
        for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
        const activation = report.activation
        if (options.format === "json") {
          console.log(
            JSON.stringify(
              {
                configured: Boolean(activation),
                sourceFile: report.decision.sourceFile,
                mode: report.decision.mode,
                include: activation?.include ?? [],
                exclude: activation?.exclude ?? [],
                markers: activation?.markers ?? { include: [], exclude: [] },
                gitRemotes: activation?.gitRemotes ?? [],
              },
              null,
              2,
            ),
          )
          return
        }
        for (const line of formatList(report)) console.log(line)
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  scopeCmd
    .command("add [dir]")
    .description("把目录加入白名单（只写全局配置）")
    .action(async (dir?: string) => {
      try {
        await runScopeAdd(dir)
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  scopeCmd
    .command("remove [dir]")
    .description("从白名单 / 黑名单移除目录（只写全局配置）")
    .action(async (dir?: string) => {
      try {
        await runScopeRemove(dir)
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  scopeCmd
    .command("mount [dir]")
    .description("在指定父目录下的项目里安装技能（会向所选项目写文件）")
    .option("--dry-run", "只预览，不写入")
    .action(async (dir: string | undefined, options: { dryRun?: boolean }) => {
      try {
        await runScopeMount(dir, Boolean(options.dryRun))
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })
}
