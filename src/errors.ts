// CLI 解析错误文案中文化：commander 默认输出英文提示，此处在 CLI 边界统一转中文并附帮助指引
// 独立成模块供 cli.ts 调用与单测直接覆盖（cli.ts 顶层即执行主流程，无法被测试导入）

import type { CommanderError } from "commander"

// 统一附加的帮助指引行
const HELP_HINT = "运行 toolkit --help 查看可用命令"

// commander 的相似项提示为英文（如 "(Did you mean tasks?)"），此处转中文；无相似项时返回空串
function translateSuggestion(message: string): string {
  const matched = /\n\(Did you mean (one of )?([^)]*?)\?\)$/.exec(message)
  if (!matched) return ""
  const names = matched[2].split(", ").join("、")
  return matched[1] ? `（是否想输入 ${names} 之一？）` : `（是否想输入 ${names}？）`
}

// 解析错误 → 中文提示；未收录的 code 与取不到动态值的消息返回 null，由调用方回退 commander 原文案
export function formatCommanderError(err: CommanderError): string | null {
  switch (err.code) {
    case "commander.unknownCommand": {
      const name = /unknown command '([^']*)'/.exec(err.message)?.[1]
      if (!name) return null
      return `⚠️ 未知命令「${name}」。${translateSuggestion(err.message)}\n${HELP_HINT}`
    }
    case "commander.unknownOption": {
      const flag = /unknown option '([^']*)'/.exec(err.message)?.[1]
      if (!flag) return null
      return `⚠️ 未知选项「${flag}」。${translateSuggestion(err.message)}\n${HELP_HINT}`
    }
    case "commander.excessArguments": {
      const matched = /too many arguments(?: for '([^']*)')?\. Expected (\d+) arguments? but got (\d+)\./.exec(err.message)
      if (!matched) return null
      const subject = matched[1] ? `命令「${matched[1]}」` : "命令"
      return `⚠️ ${subject}期望 ${matched[2]} 个参数，实际收到 ${matched[3]} 个。\n${HELP_HINT}`
    }
    default:
      return null
  }
}
