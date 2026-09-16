// CLI 帮助口径统一：帮助文案中文化 + 父级清单条目与子命令自身 Usage 行同源
// 独立成模块供 cli.ts 调用与单测直接覆盖（cli.ts 顶层即执行主流程，无法被测试导入）

import type { Command } from "commander"

// 帮助选项与隐式 help 子命令的描述文案（与 -v, --version 的「显示版本号」同口径）
const HELP_DESCRIPTION = "显示帮助"

// changelog 域中由本包自行处理的子命令，其余子命令连同参数透传给 changesets
const SELF_HANDLED_SUBCOMMANDS = ["version", "format"]

// 递归统一命令树的 help 呈现：逐命令换中文帮助文案，并把父级清单条目改为「名字 + 该命令自身 Usage 行」
// ⚠️ 必须递归：commander 每个命令各自 createHelp()，且 _helpConfiguration 只在 .command() 建子命令时按引用复制，命令声明完毕后再设置不会回溯
export function setupHelp(cmd: Command): void {
  cmd.helpOption("-h, --help", HELP_DESCRIPTION)
  cmd.configureHelp({
    // 默认实现只拼「名字 + 非 help 选项 + 声明的位置参数」，不认真子命令，
    // 有子命令却无自有选项的域（如 skills）在父级清单里会只剩光杆名字；此处复用其自身 Usage 行消除两套渲染规则
    subcommandTerm: (sub) => `${sub.name()} ${sub.usage()}`.replace(/\s+/g, " ").trim(),
  })
  for (const sub of cmd.commands) setupHelp(sub)
}

// 判断 changelog 的 -h / --help 是否应拦截并打印本域帮助
// version / format 后的帮助标志会被透传语义当作操作数丢弃，命令照跑（真发版 / 真改写 CHANGELOG），故须拦截；
// 其余子命令（add / status 等）的帮助标志仍透传给 changesets，由后者输出自己的帮助
export function shouldPrintChangelogHelp(operands: string[]): boolean {
  const [sub] = operands
  if (!sub || !SELF_HANDLED_SUBCOMMANDS.includes(sub)) return false
  return operands.slice(1).some((v) => v === "-h" || v === "--help")
}
