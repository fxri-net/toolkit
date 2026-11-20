// scope 命令：状态与规则清单只读；向导、目录增删与批量挂载在 TTY 下交互
import { existsSync } from "node:fs"
import type { Command } from "commander"
import { resolveScope } from "../scope"
import { runGuard } from "../scope/guard"
import { formatList, formatStatus } from "../scope/print"
import { isInteractive, runInteractive } from "../prompts"
import { resolveComparablePath } from "../scope/paths"
import { runScopeMount, runScopeWizard } from "../scope/wizard"
import { line } from "../term-style"
import { assertJsonFormat } from "../json-output"
import { assertChoice, fail } from "../cli-ui"
import { modeLabel, planAdd, planDefault, planRemove, planReset, readScopeState, type ScopeList, type RemoveFrom } from "../scope/edit"
import { applyScopePlan } from "../scope/apply"

// 配置层取值
const LAYERS = ["global", "project", "local"] as const

// 解析 --layer：缺省全局，非法值统一报错
function resolveLayer(value?: string): (typeof LAYERS)[number] | null {
  const layer = (value ?? "global") as (typeof LAYERS)[number]
  return assertChoice(layer, LAYERS, "--layer") ? layer : null
}

// 加入白 / 黑名单
async function runListEdit(kind: ScopeList, dirs: string[], options: { layer?: string; dryRun?: boolean; yes?: boolean }): Promise<void> {
  const layer = resolveLayer(options.layer)
  if (!layer) return
  if (dirs.length === 0) {
    fail("请指定目录；交互设置请运行 toolkit scope wizard")
    return
  }
  await applyScopePlan(kind === "include" ? "作用域：加入白名单" : "作用域：加入黑名单", planAdd(readScopeState(layer), kind, dirs), options)
}

// 移除 / 互转
async function runRemove(dirs: string[], options: { layer?: string; dryRun?: boolean; yes?: boolean; from?: string; to?: string }): Promise<void> {
  const layer = resolveLayer(options.layer)
  if (!layer) return
  if (dirs.length === 0) {
    fail("请指定目录；交互管理请运行 toolkit scope wizard")
    return
  }
  const from = (options.from ?? "both") as RemoveFrom
  if (!assertChoice(from, ["include", "exclude", "both"], "--from")) return
  const to = options.to as ScopeList | undefined
  if (to !== undefined) {
    if (!assertChoice(to, ["include", "exclude"], "--to")) return
    if (from === "both") {
      fail("--from both 不能与 --to 同时使用")
      return
    }
    if (from === to) {
      fail("--to 须与 --from 不同")
      return
    }
  }
  await applyScopePlan("作用域：移除 / 互转", planRemove(readScopeState(layer), dirs, { from, to }), options)
}

// 查看或切换默认值
async function runDefault(value: string | undefined, options: { layer?: string; dryRun?: boolean; yes?: boolean }): Promise<void> {
  const layer = resolveLayer(options.layer)
  if (!layer) return
  const state = readScopeState(layer)
  if (value === undefined) {
    console.log(`默认：${modeLabel(state.mode)}（白名单 ${state.include.length} / 黑名单 ${state.exclude.length}）`)
    console.log(`配置：${state.target.file}`)
    return
  }
  if (value !== "on" && value !== "off") {
    fail("取值须为 on / off")
    return
  }
  await applyScopePlan(value === "on" ? "作用域：默认全部生效" : "作用域：默认仅名单内生效", planDefault(state, value === "on"), options)
}

// 清除限制
async function runReset(options: { layer?: string; dryRun?: boolean; yes?: boolean }): Promise<void> {
  const layer = resolveLayer(options.layer)
  if (!layer) return
  await applyScopePlan("作用域：清除限制", planReset(readScopeState(layer)), options)
}

// 注册 scope 命令：默认行为不变（无配置时全域生效）
export function registerScopeCommands(program: Command): void {
  const scopeCmd = program.command("scope").description("作用域：按项目 / 目录判定技能与规则是否生效（默认全域生效）")
  scopeCmd.action(async () => {
    // 裸命令：非 TTY 输出状态摘要并成功退出，交互入口显式交给 scope wizard
    if (!isInteractive()) {
      const report = resolveScope()
      for (const warning of report.warnings) console.error(`⚠️ ${warning}`)
      for (const text of formatStatus(report)) console.log(text)
      console.log(line.hint("非交互环境已输出状态摘要；交互向导请运行 toolkit scope wizard"))
      return
    }
    await runInteractive(() => runScopeWizard())
  })

  scopeCmd
    .command("wizard")
    .description("交互向导：状态、名单、默认值、高级规则")
    .action(async () => {
      await runInteractive(() => runScopeWizard())
    })

  scopeCmd
    .command("status")
    .description("查看当前目录的作用域判定与原因")
    .option("--format <format>", "输出格式（json）")
    .option("--skill <name>", "按指定技能判定（应用技能级规则）")
    .action((options: { format?: string; skill?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
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
        if (!assertJsonFormat(options.format)) return
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
    .description("把目录加入白名单（需显式指定目录；交互设置请运行 toolkit scope）")
    .option("--layer <layer>", "配置层：global（默认）/ project / local")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过确认")
    .action(async (dirs: string[] = [], options: { layer?: string; dryRun?: boolean; yes?: boolean } = {}) => {
      await runInteractive(() => runListEdit("include", dirs, options))
    })

  scopeCmd
    .command("exclude [dirs...]")
    .description("把目录加入黑名单（默认值保持不变；需显式指定目录）")
    .option("--layer <layer>", "配置层：global（默认）/ project / local")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过确认")
    .action(async (dirs: string[] = [], options: { layer?: string; dryRun?: boolean; yes?: boolean } = {}) => {
      await runInteractive(() => runListEdit("exclude", dirs, options))
    })

  scopeCmd
    .command("remove [dirs...]")
    .description("移除条目，可指定来源侧与转入侧")
    .option("--layer <layer>", "配置层：global（默认）/ project / local")
    .option("--from <list>", "从哪侧移除：include / exclude / both（默认 both）")
    .option("--to <list>", "移除后转入另一侧：include / exclude")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过确认")
    .action(
      async (dirs: string[] = [], options: { layer?: string; from?: string; to?: string; dryRun?: boolean; yes?: boolean } = {}) => {
        await runInteractive(() => runRemove(dirs, options))
      },
    )

  scopeCmd
    .command("default [value]")
    .description("查看或切换默认值：on（全部生效）/ off（仅名单内生效）")
    .option("--layer <layer>", "配置层：global（默认）/ project / local")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过确认")
    .action(async (value: string | undefined, options: { layer?: string; dryRun?: boolean; yes?: boolean } = {}) => {
      await runInteractive(() => runDefault(value, options))
    })

  scopeCmd
    .command("reset")
    .description("清除限制（全部生效并清空两名单）")
    .option("--layer <layer>", "配置层：global（默认）/ project / local")
    .option("--dry-run", "只预览，不写配置")
    .option("--yes", "跳过确认")
    .action(async (options: { layer?: string; dryRun?: boolean; yes?: boolean } = {}) => {
      await runInteractive(() => runReset(options))
    })

  scopeCmd
    .command("mount [dir]")
    .description("已迁移：请改用 toolkit skills mount（本命令保留为别名，下一版本移除）")
    .option("--dry-run", "只预览，不写入")
    .action(async (dir: string | undefined, options: { dryRun?: boolean }) => {
      console.warn("⚠️ scope mount 已迁至 skills 域：请改用 toolkit skills mount（本命令保留为别名，下一版本移除）")
      await runInteractive(() => runScopeMount(dir, Boolean(options.dryRun)))
    })
}
