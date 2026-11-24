// 核心模型页图示的节点数据：组件与单检共用同一份，保证图、表与跳转目标一处维护
export interface DiagramLink {
  id: string
  label: string
  to: string
  note: string
}

export interface DiagramLayer {
  title: string
  caption: string
  nodes: DiagramLink[]
}

// 三层结构：仓库资产 ← 随包分发的能力 ← 一次性接入动作
export const PIPELINE_LAYERS: DiagramLayer[] = [
  {
    title: "你的仓库（随 git 走）",
    caption: "日常使用产出的资产，队友 clone 即得",
    nodes: [
      { id: "active", label: "进行中任务", to: "/cli/task", note: ".tasks/active/" },
      { id: "archive", label: "归档", to: "/cli/task", note: ".tasks/archive/" },
      { id: "conventions", label: "规范载体", to: "/cli/convention", note: ".tasks/conventions/" },
      { id: "config", label: "项目配置", to: "/config", note: ".toolkitrc.json" },
      { id: "shell", label: "项目面技能薄壳", to: "/config/skill", note: ".agents/skills/" },
    ],
  },
  {
    title: "随包分发（装一次）",
    caption: "与 CLI 同一发布批次，升级后重新组合即同步",
    nodes: [
      { id: "cli", label: "CLI 命令", to: "/cli", note: "toolkit <域>" },
      { id: "skills", label: "AI 技能", to: "/cli/skill", note: "零依赖 Markdown" },
      { id: "rules", label: "全局规则模板", to: "/cli/rule", note: "模块可组合" },
    ],
  },
  {
    title: "一次性接入",
    caption: "装完就不用再管，范围与统计按需调整",
    nodes: [
      { id: "setup", label: "toolkit setup", to: "/cli/setup", note: "技能 + 规则 + 范围" },
      { id: "install", label: "skill install", to: "/cli/skill", note: "全局 / 项目面" },
      { id: "scope", label: "scope", to: "/cli/scope", note: "哪些项目生效" },
      { id: "usage", label: "usage", to: "/cli/usage", note: "默认关闭" },
    ],
  },
]

// 一条任务的一生：从对话到沉淀
export const JOURNEY_LINKS: DiagramLink[] = [
  { id: "ask", label: "说需求", to: "/handbook", note: "操作手册 · 日常开发" },
  { id: "plan", label: "出方案", to: "/handbook", note: "先方案后执行" },
  { id: "create", label: "建档", to: "/cli/task", note: "toolkit task add" },
  { id: "run", label: "执行", to: "/handbook", note: "按方案落地" },
  { id: "check", label: "校验", to: "/cli/task", note: "toolkit task check" },
  { id: "archive", label: "归档", to: "/cli/task", note: "toolkit task archive" },
  { id: "distill", label: "规范沉淀", to: "/cli/convention", note: "能力终点" },
]

// 五件套：写下什么 → 提炼什么 → 怎么让 AI 照做 → 在哪生效
export const MODEL_LINKS: DiagramLink[] = [
  { id: "task", label: "任务文件", to: "/cli/task", note: "写下决策与交付" },
  { id: "conventions", label: "规范载体", to: "/cli/convention", note: "从任务提炼规范" },
  { id: "delivery", label: "技能与规则", to: "/cli/skill", note: "让 AI 照做" },
  { id: "scope", label: "配置与作用域", to: "/cli/scope", note: "决定在哪生效" },
]
