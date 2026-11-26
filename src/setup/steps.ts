// 接入向导的步骤适配：复用现有命令注册执行，不复制各域内部逻辑
import { Command } from "commander"
import { hasGlobalSkillsInstalled } from "../skills"
import { readRulesSelection } from "../rules/cache"

export type StepId = "skills" | "rules" | "scope" | "usage"

export interface SetupStep {
  id: StepId
  label: string
  // 单行说明：写到哪里、会改什么，只作展示不参与判定
  summary: string
  // 已就绪：只作「检查环境」的状态展示，不参与默认勾选
  ready: boolean
  // 默认勾选：由上次确认的记忆覆盖，首次按代码默认值
  selected: boolean
  // 勾选后必进交互：交互与零交互两条路径各自的执行参数
  interactive: boolean
  // 是否在「检查环境」里展示就绪状态（只有能探测的步骤才有意义）
  readiness: boolean
  argv: string[]
  argvYes?: string[]
  retry: string
}

// 体检：只读探测已就绪项，供默认勾选与状态展示
export function inspectSetupSteps(preset: string, rulesPresetExplicit = false): SetupStep[] {
  const skillsReady = hasGlobalSkillsInstalled()
  const rulesReady = readRulesSelection() !== null
  return [
    {
      id: "skills",
      label: "安装 AI 技能",
      summary: "写到全局技能目录或项目内技能目录（按所处目录自动判定）",
      ready: skillsReady,
      // 技能安装是接入的第一步，已装也默认勾选，进交互可直接沿用上次选择
      selected: true,
      interactive: true,
      readiness: true,
      // 勾选后进入技能与目标选择；--yes 时用已保存选择，首次只装 core
      argv: ["skill", "install"],
      argvYes: ["skill", "install", "--yes"],
      retry: "toolkit skill install",
    },
    {
      id: "rules",
      label: "配置全局规则",
      summary: "生成规则文本并复制，由你粘贴到 Agent 的全局规则入口",
      ready: rulesReady,
      selected: !rulesReady,
      interactive: true,
      readiness: true,
      // 未显式指定预设时进入模块选择；指定了预设则直接按预设组合
      // 复制也写入组合缓存，与裸 compose 共用一份记忆；--yes 不读不写，避免替用户固定默认组合
      argv: rulesPresetExplicit
        ? ["rule", "compose", "--preset", preset, "--copy"]
        : ["rule", "compose", "--copy"],
      argvYes: ["rule", "compose", "--preset", preset, "--copy", "--no-cache"],
      retry: `toolkit rule compose --preset ${preset} --copy`,
    },
    {
      id: "scope",
      label: "设置生效范围",
      summary: "写到本机作用域配置，决定哪些项目生效",
      ready: false,
      // 范围决定影响哪些项目，不在默认路径替用户做选择
      selected: false,
      interactive: true,
      readiness: false,
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
      readiness: false,
      argv: ["usage", "setup"],
      retry: "toolkit usage setup",
    },
  ]
}

// 以子命令方式执行一步：用独立 program，避免污染顶层命令树
export async function runSetupStep(argv: string[]): Promise<void> {
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
