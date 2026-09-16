// CLI 解析错误中文化单测：用真实 commander 解析取得原始错误，避免在测试内复刻其英文文案（文案漂移时用例直接失效可见）

import { describe, expect, it } from "vitest"
import { Command, CommanderError } from "commander"
import { formatCommanderError } from "../errors"

// 复刻真实 CLI 的命令形状（根命令 + 带 action 的子命令），解析给定参数并取出 commander 抛出的原始错误
function parseError(argv: string[]): CommanderError {
  const program = new Command()
  program.exitOverride()
  // 静默 commander 自行输出的帮助/错误正文，保持测试输出干净
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} })
  program.name("toolkit")
  program.command("skills").description("技能包分发").action(() => {})
  program.command("init").option("--dir <path>", "任务目录").action(() => {})
  try {
    program.parse(["node", "toolkit", ...argv])
  } catch (err) {
    if (err instanceof CommanderError) return err
    throw err
  }
  throw new Error(`未触发解析错误：${argv.join(" ")}`)
}

describe("formatCommanderError", () => {
  it("未知命令：转为中文并附帮助指引", () => {
    expect(formatCommanderError(parseError(["zzzz"]))).toBe("⚠️ 未知命令「zzzz」。\n运行 toolkit --help 查看可用命令")
  })

  it("未知命令：相似命令提示一并转中文", () => {
    expect(formatCommanderError(parseError(["skill"]))).toBe(
      "⚠️ 未知命令「skill」。（是否想输入 skills？）\n运行 toolkit --help 查看可用命令",
    )
  })

  it("多余参数：转为中文并附帮助指引", () => {
    expect(formatCommanderError(parseError(["skills", "bogus"]))).toBe(
      "⚠️ 命令「skills」期望 0 个参数，实际收到 1 个。\n运行 toolkit --help 查看可用命令",
    )
  })

  it("未知选项：转为中文并附帮助指引", () => {
    expect(formatCommanderError(parseError(["init", "--zzz"]))).toBe(
      "⚠️ 未知选项「--zzz」。\n运行 toolkit --help 查看可用命令",
    )
  })

  it("未知选项：相似选项提示一并转中文", () => {
    expect(formatCommanderError(parseError(["init", "--dirr", "x"]))).toBe(
      "⚠️ 未知选项「--dirr」。（是否想输入 --dir？）\n运行 toolkit --help 查看可用命令",
    )
  })

  it("帮助与其余 code：返回 null，交由调用方回退原始文案", () => {
    expect(formatCommanderError(parseError(["--help"]))).toBeNull()
    expect(formatCommanderError(new CommanderError(1, "commander.missingArgument", "error: missing required argument 'x'"))).toBeNull()
  })
})
