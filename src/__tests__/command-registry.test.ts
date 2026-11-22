// 命令注册表覆盖校验：注册表是机器可读的结构真源，必须与真实命令树逐路径一致（含隐藏命令，不含 help）
import { Command } from "commander"
import { describe, expect, it } from "vitest"
import { COMMAND_REGISTRY } from "../command-registry"
import { registerStatusCommands } from "../commands/status"
import { registerInitCommands } from "../commands/init"
import { registerSkillsCommands } from "../commands/skill"
import { registerTasksCommands } from "../commands/task"
import { registerChangelogCommands } from "../commands/release"
import { registerConventionsCommands } from "../commands/convention"
import { registerConfigCommands } from "../commands/config"
import { registerDocsCommands } from "../commands/docs"
import { registerRulesCommands } from "../commands/rule"
import { registerScopeCommands } from "../commands/scope"
import { registerUsageCommands } from "../usage/commands"

// 与 cli-main 相同的注册顺序；只建命令树，不解析 argv
function buildProgram(): Command {
  const program = new Command().name("toolkit")
  registerStatusCommands(program, "0.0.0")
  registerInitCommands(program)
  registerSkillsCommands(program)
  registerConventionsCommands(program)
  registerConfigCommands(program)
  registerDocsCommands(program)
  registerTasksCommands(program)
  registerChangelogCommands(program)
  registerRulesCommands(program)
  registerScopeCommands(program)
  registerUsageCommands(program)
  return program
}

// 递归收集命令路径：根命令名与各域自动挂载的 help 子命令不计入
function collectPaths(cmd: Command, prefix = ""): string[] {
  const paths: string[] = []
  for (const sub of cmd.commands) {
    const path = prefix ? `${prefix} ${sub.name()}` : sub.name()
    if (sub.name() !== "help") paths.push(path)
    paths.push(...collectPaths(sub, path))
  }
  return paths
}

describe("命令注册表覆盖", () => {
  it("注册表当前路径与真实命令树完全一致", () => {
    const actual = collectPaths(buildProgram()).sort()
    const registered = COMMAND_REGISTRY.filter((entry) => entry.stage === "current" && !entry.deprecatesTo)
      .map((entry) => entry.path)
      .sort()
    // 差集用于定位：多注册的路径要补注册表，注册表多出的要删或标 stage
    expect(actual.filter((path) => !registered.includes(path)), "命令树中存在未登记的路径").toEqual([])
    expect(registered.filter((path) => !actual.includes(path)), "注册表登记了不存在的路径").toEqual([])
  })
})
