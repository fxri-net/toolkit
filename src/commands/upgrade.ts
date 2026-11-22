// 升级迁移命令：检测 → 确认 → 应用 → 复检，支持只读检查、机器可读输出与备份恢复
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { Command } from "commander"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { INTERACTIVE_EXIT, isInteractive, loadPrompts, reportCancelled } from "../prompts"
import { printJson } from "./shared"
import { line, style } from "../term-style"
import { latestBackup, restoreBackup } from "../upgrade/backup"
import { buildUpgradePlan, checkVersionGate, runUpgrade } from "../upgrade"
import { ALL_LAYERS } from "../upgrade/detect"
import { planUpgradeDiffs } from "../upgrade/diff"
import type { UpgradeItem, UpgradeLayer } from "../upgrade/types"

// 命令选项：与文档中的参数表保持一致
interface UpgradeOptions {
  cwd?: string
  check?: boolean
  dryRun?: boolean
  diff?: boolean
  yes?: boolean
  format?: string
  layers?: string
  only?: string
  skip?: string
  allowOldDependency?: boolean
  restore?: string | boolean
  overwrite?: boolean
}

// 层参数：逗号分隔，非法值报错并由调用方中止
function parseLayers(value?: string): UpgradeLayer[] | null {
  if (value === undefined) return [...ALL_LAYERS]
  const layers = value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
  const invalid = layers.filter((layer) => !ALL_LAYERS.includes(layer as UpgradeLayer))
  if (invalid.length > 0) {
    console.error(`⚠️ --layers 只接受 global / project / local（非法：${invalid.join("、")}）`)
    process.exitCode = 1
    return null
  }
  return layers.length > 0 ? (layers as UpgradeLayer[]) : [...ALL_LAYERS]
}

// 多值 id 参数：逗号分隔
function parseIds(value?: string): string[] | undefined {
  const ids = value?.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
  return ids && ids.length > 0 ? ids : undefined
}

// 文本清单：按迁移面分组，标出状态与风险
function printPlan(items: UpgradeItem[]): void {
  if (items.length === 0) {
    console.log(line.ok("未检测到 v1 资产，无需迁移"))
    return
  }
  console.log("迁移计划：")
  for (const item of items) {
    const mark = item.status === "manual" ? "⚠️" : "·"
    console.log(`  ${mark} ${style.accent(item.id)}（${item.risk}）${item.action}`)
    for (const file of item.files) console.log(line.hint(`      ${file}`))
    if (item.manualHint) console.log(line.hint(`      人工：${item.manualHint}`))
  }
}

// 结果汇报：应用项、失败项、备份、残留与需人工项
function printResult(applied: string[], failed: string[], backups: string[], residue: UpgradeItem[], manual: UpgradeItem[]): void {
  console.log("")
  console.log(line.ok(`已迁移 ${applied.length} 项`))
  if (failed.length > 0) console.error(`⚠️ 失败 ${failed.length} 项：${failed.join("、")}`)
  for (const dir of backups) console.log(line.hint(`备份：${dir}`))
  if (residue.length > 0) {
    console.error(`⚠️ 仍有 ${residue.length} 项可自动处理：${residue.map((item) => item.id).join("、")}`)
  } else {
    console.log(line.ok("复检通过：未发现可自动处理的 v1 残留"))
  }
  if (manual.length > 0) {
    console.log(line.hint("需人工处理："))
    for (const item of manual) console.log(line.hint(`  ${item.id}：${item.manualHint ?? item.action}`))
  }
}

// 交互式选择：返回勾选的迁移项；手动项不进入选择集
async function selectItems(items: UpgradeItem[]): Promise<UpgradeItem[] | null> {
  const prompts = await loadPrompts()
  const choices = items
    .filter((item) => item.status === "planned")
    .map((item) => ({ name: `${item.id}｜${item.action}`, value: item.id, checked: item.risk !== "high" }))
  if (choices.length === 0) {
    console.log(line.hint("没有可自动迁移的项"))
    return []
  }
  const selected = await prompts.checkbox({ message: "选择要执行的迁移项（空格切换，回车确认）", choices })
  const picked = new Set(selected as string[])
  return items.filter((item) => picked.has(item.id))
}

// 执行命令：只读检查、预演、交互应用与非交互应用共用
async function runUpgradeCommand(options: UpgradeOptions): Promise<void> {
  if (!assertJsonFormat(options.format)) return
  const cwd = resolve(options.cwd ?? process.cwd())
  const layers = parseLayers(options.layers)
  if (!layers) return

  // 恢复分支：不参与检测，直接从备份还原
  if (options.restore !== undefined) {
    const dir = options.restore === true || options.restore === "latest" ? latestBackup(cwd) : resolve(cwd, String(options.restore))
    if (!dir || !existsSync(dir)) {
      console.error("⚠️ 未找到可恢复的备份")
      process.exitCode = 1
      return
    }
    const result = restoreBackup(dir, { overwrite: Boolean(options.overwrite) })
    if (options.format === "json") {
      printJson(jsonEnvelope({ command: "upgrade", data: { restore: result } }))
      return
    }
    console.log(line.ok(`已从 ${dir} 恢复`))
    for (const file of result.restored) console.log(`  还原 ${file}`)
    for (const file of result.removed) console.log(`  删除 ${file}`)
    if (result.skipped.length > 0) console.error(`⚠️ 跳过 ${result.skipped.length} 个迁移后被修改的文件（加 --overwrite 覆盖）`)
    return
  }

  const plan = buildUpgradePlan(cwd, { layers, only: parseIds(options.only), skip: parseIds(options.skip) })
  if (options.check) {
    if (options.format === "json") {
      printJson(jsonEnvelope({ command: "upgrade", data: { check: true, plan: plan.items, residue: plan.autoResidue, manual: plan.manual } }))
    } else {
      printPlan(plan.items)
      console.log("")
      console.log(plan.autoResidue > 0 ? line.hint(`存在 ${plan.autoResidue} 项可自动处理的 v1 残留`) : line.ok("未发现可自动处理的 v1 残留"))
    }
    if (plan.autoResidue > 0) process.exitCode = 1
    return
  }

  if (options.dryRun || options.diff) {
    // --diff 在清单之后追加行级差异；--dry-run 仍只出清单，两者都不写盘
    const diffs = options.diff ? planUpgradeDiffs(plan.items) : []
    if (options.format === "json") {
      const data = options.diff ? { dryRun: true, plan: plan.items, residue: plan.autoResidue, diffs } : { dryRun: true, plan: plan.items, residue: plan.autoResidue }
      printJson(jsonEnvelope({ command: "upgrade", data }))
      return
    }
    printPlan(plan.items)
    if (options.diff) {
      if (diffs.length === 0) console.log(line.ok("没有会被改写的文件内容"))
      for (const entry of diffs) console.log(entry.patch)
    }
    return
  }

  if (plan.items.length === 0) {
    if (options.format === "json") printJson(jsonEnvelope({ command: "upgrade", data: { plan: [], residue: 0 } }))
    else console.log(line.ok("未检测到 v1 资产，无需迁移"))
    return
  }

  const gate = checkVersionGate(cwd)
  if (!gate.ok && !options.allowOldDependency) {
    console.error(`⚠️ ${gate.detail}；确需继续加 --allow-old-dependency`)
    process.exitCode = 1
    return
  }
  if (!gate.ok) console.error(`⚠️ ${gate.detail}（已按 --allow-old-dependency 继续）`)

  let targets: UpgradeItem[]
  if (isInteractive()) {
    printPlan(plan.items)
    const picked = await selectItems(plan.items)
    if (!picked) {
      reportCancelled()
      return
    }
    targets = picked
  } else {
    if (!options.yes) {
      console.error("⚠️ 非交互环境须显式加 --yes 才能执行迁移；可先用 --dry-run / --check 查看计划")
      process.exitCode = INTERACTIVE_EXIT
      return
    }
    targets = plan.items.filter((item) => item.status === "planned")
  }

  const result = runUpgrade(cwd, targets, { layers })
  if (options.format === "json") {
    printJson(
      jsonEnvelope({
        command: "upgrade",
        data: { plan: plan.items, applied: result.applied, failed: result.failed, backups: result.backups, residue: result.residue },
        exitCode: result.failed.length > 0 || result.residue.length > 0 ? 1 : 0,
      }),
    )
  } else {
    printResult(result.applied, result.failed, result.backups, result.residue, plan.items.filter((item) => item.status === "manual"))
  }
  if (result.failed.length > 0 || result.residue.length > 0) process.exitCode = 1
}

// 注册 upgrade 命令：动作型，裸命令在 TTY 进向导、非 TTY 要求 --yes
export function registerUpgradeCommands(program: Command): void {
  program
    .command("upgrade")
    .description("迁移 v1 项目到当前版本：配置段名 / 工程脚本 / 技能旧名 / 规范载体，支持预览、复检与恢复")
    .option("--cwd <path>", "项目根目录（缺省当前工作目录）")
    .option("--check", "只读检查；存在可自动处理的残留时退出 1")
    .option("--dry-run", "只输出迁移计划，不写盘")
    .option("--diff", "输出迁移计划与行级差异（不写盘）")
    .option("--yes", "非交互执行，跳过确认")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .option("--layers <layers>", "迁移层：global / project / local（逗号分隔，缺省全部）")
    .option("--only <ids>", "只执行指定迁移项（逗号分隔）")
    .option("--skip <ids>", "跳过指定迁移项（逗号分隔）")
    .option("--allow-old-dependency", "项目依赖仍低于当前 major 时仍继续迁移")
    .option("--restore [path]", "从备份恢复；省略或 latest 取最近一次")
    .option("--overwrite", "恢复时覆盖迁移后被修改的文件")
    .action(async (options: UpgradeOptions) => {
      try {
        await runUpgradeCommand(options)
      } catch (error) {
        // 交互取消按既有约定结束，其余错误统一提示并置 1
        const { exitOnPromptCancel } = await import("../prompts")
        if (exitOnPromptCancel(error)) return
        console.error(`⚠️ 迁移失败：${(error as Error).message}`)
        process.exitCode = 1
      }
    })
}
