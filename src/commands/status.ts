// status 命令：整体状态的只读聚合入口与打印
import type { Command } from "commander"
import { collectStatus, type StatusReport, type StatusSection } from "../status"
import { foldHome, foldHomeInText } from "../config-status"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { line } from "../term-style"
import { printJson } from "./shared"

export interface StatusOptions {
  format?: string
  check?: boolean
}

// 区块行首标记：error 红、warn 黄、健康绿，由统一输出出口按符号着色
function sectionMark(section: StatusSection): string {
  if (section.counts.error > 0) return "✖"
  if (section.counts.warn > 0) return "⚠️"
  return "✔"
}

// 问题行首标记：与 config status 同口径（warn 记 ⚠️、info 记 ·）
function issueMark(level: StatusReport["issues"][number]["level"]): string {
  if (level === "error") return "✖"
  if (level === "warn") return "⚠️"
  return "·"
}

// 结论：区分 error 与软告警，并说明 --check 的退出语义
function conclusion(report: StatusReport): string {
  if (report.errorCount > 0) return `结论：存在 ${report.errorCount} 项错误（--check 时退出 1）`
  if (report.warnCount > 0) return `结论：整体可用，${report.warnCount} 项警告待清理（不影响退出码）`
  return "结论：整体健康，未发现问题"
}

// 文本报告：一句话结论 + 逐区块摘要 + 待处理项；路径折叠 home 前缀避免泄露本机目录结构
function printStatusText(report: StatusReport): void {
  if (!report.initialized) {
    console.log(`当前目录未初始化：未找到任务区 ${report.tasksDir}`)
    console.log(line.hint("下一步：运行 toolkit init 创建任务区、规范载体与技能入口层"))
    return
  }
  console.log(`toolkit status ${report.version}`)
  console.log(`起点：${foldHome(report.cwd)}`)
  console.log("")
  report.sections.forEach((section) => {
    console.log(`${sectionMark(section)} ${section.label}：${section.summary}`)
    for (const detail of section.details) console.log(`  ${detail}`)
  })
  if (report.issues.length > 0) {
    console.log("")
    console.log("待处理项：")
    for (const issue of report.issues) {
      console.log(`  ${issueMark(issue.level)} [${issue.scope}] ${foldHomeInText(issue.message)}`)
    }
  }
  console.log("")
  console.log(conclusion(report))
}

// 执行一次状态聚合：JSON 走统一信封，--check 仅按 error 级问题置退出码
export function runStatus(options: StatusOptions, version: string): void {
  if (!assertJsonFormat(options.format)) return
  const report = collectStatus(version)
  if (options.format === "json") {
    printJson(
      jsonEnvelope({
        command: "status",
        code: report.ok ? 200 : 422,
        data: {
          version: report.version,
          initialized: report.initialized,
          cwd: report.cwd,
          tasksDir: report.tasksDir,
          sections: report.sections,
          deprecated: report.deprecated,
          runtimeHits: report.runtimeHits,
        },
        issues: report.issues,
        // 报告结论与退出码分离：不带 --check 时即使有 error 也不阻断
        exitCode: options.check && !report.ok ? 1 : 0,
      }),
    )
  } else {
    printStatusText(report)
  }
  if (options.check && !report.ok) process.exitCode = 1
}

// 注册 status 命令：装配点只负责按序调用
export function registerStatusCommands(program: Command, version: string): void {
  program
    .command("status")
    .description("整体状态：聚合任务区 / 技能现场 / 配置层 / 文档站 / 版本与弃用项（只读）")
    .option("--check", "存在 error 级问题时退出 1")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: StatusOptions) => {
      runStatus(options, version)
    })
}
