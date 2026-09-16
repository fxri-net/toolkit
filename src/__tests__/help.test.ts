// CLI 帮助口径统一（help.ts）：帮助文案中文化 + 父级清单条目与该命令自身 Usage 行同源
// 断言直接调用真实实现的渲染结果，不在测试内复刻 subcommandTerm 的拼接逻辑
import { describe, it, expect } from "vitest"
import { Command } from "commander"
import { setupHelp, shouldPrintChangelogHelp } from "../help"

// 构造与真实 CLI 同形的命令树：init（有自有选项）、skills（无自有选项但有子命令，即症状同款）、
// skills 下另挂一个无选项域用于验证递归生效；skills 带 action 以贴合真实 CLI（真实 skills 有 action，不会生成隐式 help 子命令）
function buildTree(): { root: Command; skills: Command; nested: Command; install: Command } {
  const root = new Command("toolkit")
  root.command("init").description("初始化项目任务区").option("--dir <path>", "任务目录")
  const skills = root.command("skills").description("AI 技能包分发").action(() => {})
  const install = skills.command("install").description("安装包内技能").option("--copy", "强制副本")
  const nested = skills.command("nested").description("无自有选项的嵌套域")
  nested.command("deep").description("更深一层的子命令")
  return { root, skills, nested, install }
}

describe("setupHelp：父级清单与子命令自身 Usage 对齐", () => {
  it("无自有选项但有子命令的域不再是光杆名字（条目 ≡ 名字 + 自身 Usage）", () => {
    const { root, skills } = buildTree()
    setupHelp(root)
    const rendered = root.helpInformation()
    // 期望值取自 commander 自身的 usage()，避免在测试内重写一份拼接规则
    expect(rendered).toContain(`${skills.name()} ${skills.usage()}`)
    expect(rendered).toContain("skills [options] [command]")
    // 有自有选项的域行为不变
    expect(rendered).toContain("init [options]")
  })

  it("递归到更深层：域自身的清单同样对齐（只在根上设置配置不会回溯）", () => {
    const { root, skills, nested } = buildTree()
    setupHelp(root)
    expect(skills.helpInformation()).toContain(`${nested.name()} ${nested.usage()}`)
  })
})

describe("setupHelp：帮助文案中文化", () => {
  it("根 / 域 / 子命令的帮助选项与隐式 help 条目均为中文", () => {
    const { root, skills, install } = buildTree()
    // 与 cli.ts 同序：先 setupHelp 再建 help 子命令（help 子命令自带 helpOption(false)）
    setupHelp(root)
    root.helpCommand("help [command]", "显示帮助")
    for (const cmd of [root, skills, install]) {
      const rendered = cmd.helpInformation()
      expect(rendered).toContain("-h, --help")
      expect(rendered).toContain("显示帮助")
      expect(rendered).not.toContain("display help for command")
    }
    // help 子命令无自有帮助选项，其定位行不得被撑成含 [options]
    expect(root.helpInformation()).toContain("help [command]")
    expect(root.helpInformation()).not.toContain("help [options]")
  })
})

describe("shouldPrintChangelogHelp", () => {
  it("自处理子命令带帮助标志时拦截（否则会被透传语义当作操作数丢弃、命令照跑）", () => {
    expect(shouldPrintChangelogHelp(["version", "--help"])).toBe(true)
    expect(shouldPrintChangelogHelp(["version", "-h"])).toBe(true)
    expect(shouldPrintChangelogHelp(["format", "--history", "--help"])).toBe(true)
  })

  it("无帮助标志时不拦截（真发版 / 真改写 CHANGELOG 路径不受影响）", () => {
    expect(shouldPrintChangelogHelp(["version"])).toBe(false)
    expect(shouldPrintChangelogHelp(["format"])).toBe(false)
    expect(shouldPrintChangelogHelp([])).toBe(false)
  })

  it("其余子命令与域自身的帮助标志不拦截（仍交由 commander / changesets 输出帮助）", () => {
    expect(shouldPrintChangelogHelp(["--help"])).toBe(false)
    expect(shouldPrintChangelogHelp(["add", "--help"])).toBe(false)
    expect(shouldPrintChangelogHelp(["status", "-h"])).toBe(false)
  })
})
