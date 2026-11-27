// 隐私体检命令：按项目档位扫描本机绝对路径，可选自动归一任务区
import type { Command } from "commander"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { registerHelpCommand } from "../help"
import { printJson } from "./shared"
import { line } from "../term-style"
import { fixPrivacyPaths, scanPrivacy, type PrivacyScanReport } from "../privacy/scan"

// 档位中文：文本层只写中文，原值只进 JSON
const LEVEL_LABELS = { off: "关闭", warn: "告警", error: "阻断" } as const

// 文本报告：逐条 file:line + 类型；结尾给处置建议
function printScan(report: PrivacyScanReport): void {
  if (report.skipped) {
    console.log(line.hint("隐私扫描：privacy.localPaths 为关闭（off），跳过"))
    return
  }
  console.log(`隐私扫描（只读，档位 ${LEVEL_LABELS[report.level]}，扫描 ${report.scannedFiles} 个文件）：`)
  if (report.hits.length === 0) {
    console.log("  未发现本机绝对路径")
    return
  }
  for (const hit of report.hits) {
    const kind = hit.kind === "windows" ? "盘符" : "用户主目录"
    const tag = hit.level === "error" ? "阻断" : "提示"
    console.log(`  ${hit.file}:${hit.line}  ${kind} / ${tag}  ${hit.text}`)
  }
  console.log(line.hint(`合计 ${report.errors} 处阻断 / ${report.warnings} 处提示；任务区可加 --fix 归一，文档与技能请改为相对路径或占位符`))
}

export function registerPrivacyCommands(program: Command): void {
  const privacyCmd = program.command("privacy").description("隐私体检：本机绝对路径扫描与归一（按 privacy.localPaths 档位）")
  registerHelpCommand(privacyCmd)
  // 裸命令只打印本域帮助，退出 0（查询型域口径，见 docs/cli.md）
  privacyCmd.action(() => {
    privacyCmd.outputHelp()
  })

  privacyCmd
    .command("scan")
    .description("扫描任务区 / 变更集 / 文档 / 技能里的本机绝对路径；档位为关闭（off）时跳过")
    .option("--fix", "自动归一任务区与规范载体里的路径（文档与技能只报告）")
    .option("--dry-run", "配合 --fix 只列出将改写的文件与处数，不写盘")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { fix?: boolean; dryRun?: boolean; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const fix = Boolean(options.fix)
      const dryRun = fix && Boolean(options.dryRun)
      if (options.dryRun && !fix) console.error(line.hint("--dry-run 仅作用于 --fix；扫描本身不写盘"))
      const fixed = fix ? fixPrivacyPaths(process.cwd(), { dryRun }) : null
      const report = scanPrivacy()
      if (options.format === "json") {
        printJson(jsonEnvelope({ command: "privacy scan", data: { fix, dryRun, fixed, report } }))
      } else {
        if (fixed) {
          // 动作前一行写清作用层与是否落盘，动作后汇总处数
          if (fixed.files.length === 0) console.log(line.hint(`自动归一（任务区）：${dryRun ? "预演无改动" : "无改动"}`))
          else if (dryRun) console.log(`[预演] 将归一 ${fixed.normalized} 处，涉及 ${fixed.files.length} 个文件（任务区）：${fixed.files.join("、")}`)
          else console.log(line.ok(`自动归一 ${fixed.normalized} 处，涉及 ${fixed.files.length} 个文件：${fixed.files.join("、")}`))
        }
        printScan(report)
      }
      if (report.level === "error" && report.errors > 0) process.exitCode = 1
    })
}
