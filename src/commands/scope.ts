// scope 命令：作用域状态与规则清单（本任务只读，不写任何配置）
import type { Command } from "commander"
import { getHomeDir } from "../config"
import { resolveScope } from "../scope"

// 展示用路径：折叠 home 前缀，便于人读
function displayPath(path: string | null): string {
  if (!path) return "默认（未配置）"
  const home = getHomeDir()
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

// 文本清单：空数组显示「未配置」
function displayList(items: string[]): string {
  return items.length > 0 ? items.join("、") : "未配置"
}

// 注册 scope 命令：只读查询，判定逻辑见 src/scope
export function registerScopeCommands(program: Command): void {
  const scopeCmd = program.command("scope").description("作用域：按项目 / 目录判定技能与规则是否生效（默认全域生效）")
  scopeCmd.action(() => {
    scopeCmd.help()
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
        const { decision } = report
        if (options.format === "json") {
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
        console.log("作用域状态：")
        console.log(`  当前目录：${report.context.cwd}`)
        console.log(`  结果：${decision.active ? "生效" : "未生效"}`)
        console.log(`  模式：${decision.mode}`)
        console.log(`  命中规则：${decision.matchedRule ?? "未命中"}`)
        console.log(`  来源：${displayPath(decision.sourceFile)}`)
        console.log(`  原因：${decision.reason}`)
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
        const { activation } = report
        const payload = {
          configured: Boolean(activation),
          sourceFile: report.decision.sourceFile,
          mode: report.decision.mode,
          include: activation?.include ?? [],
          exclude: activation?.exclude ?? [],
          markers: activation?.markers ?? { include: [], exclude: [] },
          gitRemotes: activation?.gitRemotes ?? [],
        }
        if (options.format === "json") {
          console.log(JSON.stringify(payload, null, 2))
          return
        }
        console.log("作用域规则：")
        console.log(`  来源：${displayPath(payload.sourceFile)}${report.layer ? `（${report.layer}）` : ""}`)
        console.log(`  模式：${payload.mode}`)
        console.log(`  白名单：${displayList(payload.include)}`)
        console.log(`  黑名单：${displayList(payload.exclude)}`)
        console.log(`  启用标记：${displayList(payload.markers.include)}`)
        console.log(`  排除标记：${displayList(payload.markers.exclude)}`)
        console.log(`  git 远端：${displayList(payload.gitRemotes)}`)
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })
}
