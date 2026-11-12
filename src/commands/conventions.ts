// conventions 命令：规范载体升级、表格归一与只读体检的注册入口与打印
import type { Command } from "commander"
import { upgradeConventions, type UpgradeReport } from "../conventions/upgrade"
import { formatConventions, type FormatReport } from "../conventions/compact"
import { conventionsStatus, resolveCarrierRoot, type ConventionsStatusReport } from "../conventions/status"
import { resolveTasksDir } from "../config"
import { foldHomeInText } from "../config-status"
import { assertJsonFormat } from "../json-output"
import { printJson } from "./shared"

// 注册 conventions 命令：装配点只负责按序调用
export function registerConventionsCommands(program: Command): void {
  // 打印升级报告：ID 映射（不落盘）+ 逐项结构动作 + 内部引用改写清单，风格与 skills install 预演一致
  function printUpgradeReport(report: UpgradeReport, dryRun: boolean): void {
    const tag = dryRun ? "[预演] " : ""
    console.log(`${tag}任务区：${report.tasksDir}`)
    console.log(`${tag}载体：${report.dir}（形态 ${report.form}）`)
    if (report.status === "already-v3") {
      console.log(`${tag}已是 v3 形态，无需升级`)
      return
    }
    console.log("")
    if (report.idMap.length > 0) {
      console.log(`${tag}ID 映射（序号 → 稳定 ID，仅随报告输出，不落盘）：`)
      for (const row of report.idMap) console.log(`  ${row.seq} → ${row.id}  ${row.name}`)
      console.log("")
    }
    console.log(`${tag}结构动作：`)
    for (const c of report.changes) console.log(`  ${c.target}：${c.detail}`)
    if (report.refs.length > 0) {
      console.log("")
      console.log(`${tag}内部引用改写：`)
      for (const r of report.refs) console.log(`  ${r.file}：${r.from} → ${r.to}`)
    }
    if (report.reviews.length > 0) {
      console.log("")
      console.log(`${tag}待人工复核（只报不改）：`)
      for (const msg of report.reviews) console.log(`  ⚠️ ${msg}`)
    }
    console.log("")
    if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
    else console.log("已写入；升级前原件可由本次迁移提交的父提交复现")
  }

  // 打印体检报告：先给一句话结论，再列载体 / 入口壳现场与逐项待处理项（warn 带 ⚠️，info 带 ·）
  function printConventionsStatus(report: ConventionsStatusReport): void {
    console.log(report.summary)
    if (!report.initialized) return
    const marker = report.carrierVersion === null ? "无" : `v${report.carrierVersion}`
    console.log(`任务区：${report.tasksDir}`)
    console.log(`载体：${report.dir}（形态 ${report.form}，形态标记 ${marker}，条目 ${report.entries}）`)
    console.log(
      `入口壳：${
        report.shells.length > 0
          ? report.shells.map((s) => `${s.file}（标记 ${s.version === null ? "无" : `v${s.version}`}${s.ignored ? "，被 gitignore 覆盖" : ""}）`).join("、")
          : "无"
      }`,
    )
    console.log("")
    if (report.items.length === 0) {
      console.log("无待处理项")
      return
    }
    for (const item of report.items) console.log(`${item.level === "warn" ? "⚠️" : "·"} [${item.scope}] ${foldHomeInText(item.message)}`)
  }

  // 打印归一报告：先给一句话结论，再列发生改动的文件与行号（风格与 upgrade 预演一致）
  function printConventionsFormat(report: FormatReport, dryRun: boolean): void {
    const tag = dryRun ? "[预演] " : ""
    console.log(`${tag}任务区：${report.tasksDir}（扫描 ${report.files} 个 .md）`)
    if (report.status === "already-compact") {
      console.log(`${tag}表格已全部为紧凑形态，无需归一`)
      return
    }
    console.log("")
    console.log(`${tag}归一改动：${report.changedFiles} 个文件 / ${report.changedLines} 行`)
    for (const c of report.changes) {
      const shown = c.lines.slice(0, 6).join("、")
      console.log(`  ${c.file}：${c.lines.length} 行（${shown}${c.lines.length > 6 ? " …" : ""}）`)
    }
    console.log("")
    if (dryRun) console.log("[预演] 未写入任何文件；确认无误后去掉 --dry-run 执行")
    else console.log("已写入；紧凑形态即规范形态，重复执行不改动")
  }

  // conventions 域：规范载体的结构升级、表格形态归一与只读体检（载体细则见 skills/fxri-plan-to-task/references/conventions-spec.md）
  const conventionsCmd = program
    .command("conventions")
    .description("项目协作规范载体：结构升级（v1 / v2 → v3）、表格形态归一（紧凑形态）与只读体检（形态 / 索引 / 入口层）")

  // 升级：纯机械结构升级，先判后写；形态异常或未初始化时拒绝执行并给非 0 退出码（异常态不写任何文件）
  conventionsCmd
    .command("upgrade")
    .description("把 v1 / v2 规范载体升级为 v3（v2：删「状态」「确立来源任务」两列、退休条目迁入 retired.md 并删分册小节；v1 链式升级；幂等，先判后写）")
    .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
    .option("--dry-run", "预演（只预览将要执行的动作，不写文件）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { dir?: string; dryRun?: boolean; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        const report = upgradeConventions(resolveTasksDir(options.dir), { dryRun: options.dryRun })
        if (options.format === "json") printJson({ dryRun: Boolean(options.dryRun), ...report })
        else printUpgradeReport(report, Boolean(options.dryRun))
      } catch (e) {
        console.error(`⚠️ 升级失败：${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  // 归一：把格式化器填充出的表格收敛回紧凑形态（只动空白层与分隔行横线长度、不改语义；幂等，跳过代码块，先判后写）
  conventionsCmd
    .command("format")
    .description("归一表格形态为紧凑形态（只动单元格间距、分隔行横线长度与列对齐填充；幂等、跳过 fenced code block，先报后写）")
    .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）")
    .option("--dry-run", "预演（只预览将要归一的行，不写文件）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { dir?: string; dryRun?: boolean; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        const report = formatConventions(resolveTasksDir(options.dir), { dryRun: options.dryRun })
        if (options.format === "json") printJson(report)
        else printConventionsFormat(report, Boolean(options.dryRun))
      } catch (e) {
        console.error(`⚠️ 归一失败：${(e as Error).message}`)
        process.exitCode = 1
      }
    })

  // 状态：只读体检，只报不改（不给 --fix）；体检本身不阻断、退出码恒 0，仅 --format 传非法值时按参数错误报错退出
  conventionsCmd
    .command("status")
    .alias("check")
    .description("规范载体只读体检：形态 / 索引 / 入口层三块（只报不改，体检不阻断、退出码恒 0；仅 --format 传非法值时按参数错误报错退出）")
    .option("--dir <path>", "任务目录（优先级：CLI 参数 > 配置 tasks.dir > 默认 .tasks）；入口壳与检测入口按该目录所属仓库扫描")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { dir?: string; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        const tasksDir = resolveTasksDir(options.dir)
        const report = conventionsStatus(tasksDir, resolveCarrierRoot(tasksDir))
        if (options.format === "json") printJson(report)
        else printConventionsStatus(report)
      } catch (e) {
        console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
      }
    })

  // 裸 `toolkit conventions`：打印本域帮助，列出 3 个子命令
  conventionsCmd.action(() => {
    conventionsCmd.help()
  })
}
