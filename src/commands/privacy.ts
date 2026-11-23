// 隐私体检命令：按项目档位扫描本机绝对路径，可选自动归一任务区
import type { Command } from "commander"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { registerHelpCommand } from "../help"
import { printJson } from "./shared"
import { line } from "../term-style"
import { fixPrivacyPaths, scanPrivacy, type PrivacyScanReport } from "../privacy/scan"

// 文本报告：逐条 file:line + 类型；结尾给处置建议
function printScan(report: PrivacyScanReport): void {
  if (report.skipped) {
    console.log(line.hint("隐私扫描：privacy.localPaths 为 off（未启用），跳过"))
    return
  }
  console.log(`隐私扫描（档位 ${report.level}，扫描 ${report.scannedFiles} 个文件）：`)
  if (report.hits.length === 0) {
    console.log("  未发现本机绝对路径")
    return
  }
  for (const hit of report.hits) {
    const kind = hit.kind === "windows" ? "盘符" : "家目录"
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
    .description("扫描任务区 / 变更集 / 文档 / 技能里的本机绝对路径；档位 off 时跳过")
    .option("--fix", "自动归一任务区与规范载体里的路径（文档与技能只报告）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { fix?: boolean; format?: string }) => {
      if (!assertJsonFormat(options.format)) return
      const fix = Boolean(options.fix)
      const fixed = fix ? fixPrivacyPaths() : null
      const report = scanPrivacy()
      if (options.format === "json") {
        printJson(jsonEnvelope({ command: "privacy scan", data: { fix, fixed, report } }))
      } else {
        if (fixed) {
          if (fixed.files.length === 0) console.log(line.hint("自动归一：无改动"))
          else console.log(line.ok(`自动归一 ${fixed.normalized} 处，涉及 ${fixed.files.length} 个文件：${fixed.files.join("、")}`))
        }
        printScan(report)
      }
      if (report.level === "error" && report.errors > 0) process.exitCode = 1
    })
}
