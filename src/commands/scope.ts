// scope 命令：状态与规则清单只读；向导、目录增删与批量挂载在 TTY 下交互
import { existsSync } from "node:fs"
import type { Command } from "commander"
import { resolveScope } from "../scope"
import { runGuard } from "../scope/guard"
import { formatList, formatStatus } from "../scope/print"
import { requireInteractive, runInteractive } from "../prompts"
import { resolveComparablePath } from "../scope/paths"
import { runScopeAdd, runScopeMount, runScopeRemove, runScopeWizard } from "../scope/wizard"
import { line } from "../term-style"

// 注册 scope 命令：默认行为不变（无配置时全域生效）
export function registerScopeCommands(program: Command): void {
  const scopeCmd = program.command("scope").description("作用域：按项目 / 目录判定技能与规则是否生效（默认全域生效）")
  scopeCmd.action(async () => {
    if (!requireInteractive({ action: "作用域菜单", hint: "非交互场景请直接使用 toolkit scope status / list / add / remove" })) return
    await runInteractive(() => runScopeWizard())
  })

  scopeCmd
    .command("status")
    .description("查看当前目录的作用域判定与原因")
    .option("--format <format>", "输出格式（json）")
    .option("--skill <name>", "按指定技能判定（应用技能级规则）")
    .action((options: { format?: string; skill?: string }) => {
      try {
        if (options.format && options.format !== "json") console.error("⚠️ --format 仅支持 json，已回落文本输出")
        const report = resolveScope(undefined, options.skill)
        for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
        if (report.migrationHint) console.error(`⚠️ ${report.migrationHint}`)
        if (options.format === "json") {
          const { decision } = report
          console.log(
            JSON.stringify(
              {
                active: decision.active,
                mode: decision.mode,
                baseDir: decision.baseDir,
                skill: options.skill ?? null,
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
        for (const text of formatStatus(report)) console.log(text)
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
        const include = activation?.include ?? []
        const exclude = activation?.exclude ?? []
        const items = [
          ...include.map((path) => ({ path, list: "include", exists: existsSync(resolveComparablePath(path, report.decision.baseDir)) })),
          ...exclude.map((path) => ({ path, list: "exclude", exists: existsSync(resolveComparablePath(path, report.decision.baseDir)) })),
        ]
        if (options.format === "json") {
          console.log(
            JSON.stringify(
              {
                configured: Boolean(activation),
                sourceFile: report.decision.sourceFile,
                baseDir: report.decision.baseDir,
                mode: report.decision.mode,
                include,
                exclude,
                markers: activation?.markers ?? { include: [], exclude: [] },
                gitRemotes: activation?.gitRemotes ?? [],
                skills: activation?.skills ?? {},
                items,
              },
              null,
              2,
            ),
          )
          return
        }
        for (const text of formatList(report)) console.log(text)
        const missing = items.filter((item) => !item.exists)
        if (missing.length > 0) console.log(line.hint(`  条目异常：${missing.map((item) => item.path).join("、")}（路径不存在）`))
      } catch (error) {
        console.error(`⚠️ ${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  // 内容闸门：stdout 只放正文，未激活时退出码 3
  scopeCmd
    .command("guard <skill>")
    .description("按当前目录作用域输出技能正文（未激活时退出码 3，stdout 为空）")
    .action((skill: string) => {
      process.exitCode = runGuard(skill)
    })

  scopeCmd
    .command("add [dirs...]")
    .description("把目录加入白名单（无参进入扫描流程；带参可指定配置层）")
    .option("--layer <layer>", "配置层：global / project / local（缺省 global）")
    .action(async (dirs: string[] = [], options: { layer?: string } = {}) => {
      await runInteractive(() => runScopeAdd(dirs, options.layer as "global" | "project" | "local" | undefined))
    })

  scopeCmd
    .command("remove [dirs...]")
    .description("从白名单 / 黑名单移除或互转目录（可指定配置层）")
    .option("--layer <layer>", "配置层：global / project / local（缺省 global）")
    .action(async (dirs: string[] = [], options: { layer?: string } = {}) => {
      await runInteractive(() => runScopeRemove(dirs, options.layer as "global" | "project" | "local" | undefined))
    })

  scopeCmd
    .command("mount [dir]")
    .description("在指定父目录下的项目里安装技能（会向所选项目写文件）")
    .option("--dry-run", "只预览，不写入")
    .action(async (dir: string | undefined, options: { dryRun?: boolean }) => {
      await runInteractive(() => runScopeMount(dir, Boolean(options.dryRun)))
    })
}
