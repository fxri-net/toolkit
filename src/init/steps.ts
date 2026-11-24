// 接入向导的步骤适配：复用现有命令注册执行，不复制各域内部逻辑
import { Command } from "commander"
import { hasGlobalSkillsInstalled } from "../skills"
import { readRulesSelection } from "../rules/cache"

export type StepId = "skills" | "rules" | "scope" | "usage"

export interface WizardStep {
  id: StepId
  label: string
  // 单行说明：写到哪里、会改什么，只作展示不参与判定
  summary: string
  // 已就绪：无选择的步骤据此决定默认勾选
  ready: boolean
  selected: boolean
  // 有交互的步骤：勾选后必进交互，不因已就绪跳过
  interactive: boolean
  argv: string[]
  retry: string
}

// 体检：只读探测已就绪项，供默认勾选与状态展示
export function inspectWizardSteps(preset: string): WizardStep[] {
  const skillsReady = hasGlobalSkillsInstalled()
  const rulesReady = readRulesSelection() !== null
  return [
    {
      id: "skills",
      label: "安装 AI 技能",
      summary: "写到本机全局技能目录，各项目直接可用",
      ready: skillsReady,
      selected: !skillsReady,
      interactive: false,
      argv: ["skill", "install", "--yes"],
      retry: "toolkit skill install",
    },
    {
      id: "rules",
      label: "配置全局规则",
      summary: "生成规则文本并复制，由你粘贴到 Agent 的全局规则入口",
      ready: rulesReady,
      selected: !rulesReady,
      interactive: false,
      argv: ["rule", "compose", "--preset", preset, "--copy", "--no-cache"],
      retry: `toolkit rule compose --preset ${preset} --copy`,
    },
    {
      id: "scope",
      label: "设置生效范围",
      summary: "写到本机作用域配置，决定哪些项目生效",
      ready: false,
      selected: true,
      interactive: true,
      argv: ["scope"],
      retry: "toolkit scope",
    },
    {
      id: "usage",
      label: "开启使用统计",
      summary: "写到本机统计配置，事件只留本机、不上传",
      ready: false,
      selected: false,
      interactive: true,
      argv: ["usage", "setup"],
      retry: "toolkit usage setup",
    },
  ]
}

// 以子命令方式执行一步：用独立 program，避免污染顶层命令树
export async function runWizardStep(argv: string[]): Promise<void> {
  const program = new Command().name("toolkit").exitOverride()
  const domain = argv[0]
  if (domain === "skill") {
    const { registerSkillsCommands } = await import("../commands/skill")
    registerSkillsCommands(program)
  } else if (domain === "rule") {
    const { registerRulesCommands } = await import("../commands/rule")
    registerRulesCommands(program)
  } else if (domain === "scope") {
    const { registerScopeCommands } = await import("../commands/scope")
    registerScopeCommands(program)
  } else if (domain === "usage") {
    const { registerUsageCommands } = await import("../usage/commands")
    registerUsageCommands(program)
  }
  await program.parseAsync(["node", "toolkit", ...argv])
}
