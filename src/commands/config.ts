// config 命令：三层配置只读体检的注册入口与报告打印
import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"
import type { Command } from "commander"
import { configStatus, foldHome, type ConfigStatusReport } from "../config-status"
import type { LocalConfigIgnoreState } from "../git-ignore"
import { assertJsonFormat } from "../json-output"
import { printJson } from "./shared"

// 注册 config 命令：装配点只负责按序调用
export function registerConfigCommands(program: Command): void {
  // 本地配置文件忽略状态的文本态文案（键集合与 src/git-ignore.ts 的 LocalConfigIgnoreState 对齐）
  const CONFIG_IGNORE_LABEL: Record<LocalConfigIgnoreState, string> = {
    ignored: "已忽略",
    tracked: "已跟踪（需 git rm --cached）",
    "not-ignored": "未忽略",
    "not-a-repo": "不适用（非 git 仓库）",
    "outside-repo": "不适用（位于仓库工作树之外）",
    unavailable: "忽略判定不可用",
  }

  // 打印配置分层报告：先给一句话结论，再列三层现场 / 展示键来源 / 环境变量层 / 能力旁路 / 其余已配置段 / 待处理项
  // 一律不打印配置值（redact 段含个人脱敏规则、skills 段含本机路径，落到终端 / CI 日志即外泄）
  // 路径一律走 foldHome / foldHomeInText 折叠为 ~（层级路径与待处理项文案内嵌的路径同等处理），避免共享日志泄露本机目录结构
  function printConfigStatus(report: ConfigStatusReport): void {
    console.log(report.summary)
    console.log(`查找起点：${foldHome(report.cwd)}`)
    console.log("")
    console.log("层级：")
    for (const level of report.levels) {
      const file = level.file === null ? "无" : foldHome(level.file)
      const ignore = level.ignored === null ? "" : `，${CONFIG_IGNORE_LABEL[level.ignored.state]}`
      console.log(`  ${level.layer}：${file}${ignore}`)
    }
    console.log("")
    console.log("展示键来源：")
    for (const item of report.displayKeys) console.log(`  ${item.key}：${item.source ?? "默认值"}`)
    console.log("")
    const pairs = (hits: Array<{ env: string; key: string }>) => (hits.length > 0 ? hits.map((h) => `${h.env} → ${h.key}`).join("、") : "无")
    console.log(`环境变量层：${pairs(report.env)}`)
    console.log(`能力旁路：${pairs(report.bypass)}`)
    console.log("")
    const groups = report.levels.filter((level) => level.otherSections.length > 0)
    if (groups.length === 0) {
      console.log("其余已配置段：无")
    } else {
      console.log("其余已配置段：")
      for (const level of groups) console.log(`  ${level.layer}：${level.otherSections.join("、")}`)
    }
    console.log("")
    if (report.items.length === 0) {
      console.log("无待处理项")
      return
    }
    for (const item of report.items) console.log(`${item.level === "warn" ? "⚠️" : "·"} [${item.scope}] ${item.message}`)
  }

  // config 域：三层配置文件的只读体检（层级 / 来源 / 忽略状态；载体细则见 docs/config.md）
  const configCmd = program
    .command("config")
    .description("配置分层：只读查看三层配置文件（全局层 / 项目层 / 本地层）的生效情况与来源")

  // 状态：只读体检，只报不改（不给 --fix）；体检本身不阻断、退出码恒 0，仅 --format 非法与 --cwd 非法时按参数错误报错退出
  configCmd
    .command("status")
    .description("配置分层只读体检：三层命中 / 来源层 / 环境变量层（只读、退出码恒 0；无 --dir，可用 --cwd 指定查找起点）")
    .option("--cwd <path>", "向上查找的起始目录（缺省当前工作目录）")
    .option("--format <format>", "输出格式（json，输出到 stdout）")
    .action((options: { cwd?: string; format?: string }) => {
      try {
        if (!assertJsonFormat(options.format)) return
        const cwd = options.cwd === undefined ? process.cwd() : resolve(options.cwd)
        // 降级不静默：--cwd 非法时不回落 process.cwd()（回落会给出起点错误的报告，比报错更危险）
        if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
          console.error(`⚠️ --cwd 指向的路径不存在或非目录：${options.cwd}`)
          process.exitCode = 1
          return
        }
        const report = configStatus(cwd)
        if (options.format === "json") printJson(report)
        else printConfigStatus(report)
      } catch (e) {
        // 体检失败不置退出码：与 conventions status 对齐，「只读体检不阻断」是本命令的设计意图
        console.error(`⚠️ 读取状态失败：${(e as Error).message}`)
      }
    })

  // 裸 `toolkit config`：打印本域帮助，列出 1 个子命令
  configCmd.action(() => {
    configCmd.help()
  })
}
