// 命令注册表：路径、参数、说明、引入阶段、别名与弃用目标的单一数据源
// help 分组（任务 3）、迁移对照表（v2 升级页）与测试均从此取数，避免三处各写一份清单
export interface CommandEntry {
  // 命令路径（空格分隔，如 "config set"）
  path: string
  // 参数形态（位置参数与关键选项），无参数时省略
  params?: string
  description: string
  // current：本版本已可用；planned：后续任务引入
  stage: "current" | "planned"
  // 生效中的别名：别名路径指向同一实现
  aliases?: string[]
  // 弃用目标：本路径将改为该路径（为空表示不迁移）
  deprecatesTo?: string
}

// 顶层对象与动作：按 v2 目标命令树登记，阶段字段标注每个任务落地时点
export const COMMAND_REGISTRY: readonly CommandEntry[] = [
  { path: "init", description: "初始化任务区、规范载体与技能入口层", stage: "current" },
  { path: "status", description: "聚合任务区 / 技能现场 / 配置层 / 文档站 / 版本与弃用项", stage: "planned" },

  { path: "config", description: "配置唯一写入口与三层只读体检", stage: "current" },
  { path: "config list", params: "[--layer <layer>]", description: "列出可写配置键与来源层", stage: "current" },
  { path: "config get", params: "<key> [--explain]", description: "读取单个配置键", stage: "current" },
  { path: "config set", params: "<key> <value> [--layer <layer>]", description: "写入单个配置键", stage: "current" },
  { path: "config unset", params: "<key> [--layer <layer>]", description: "删除单个配置键", stage: "current" },
  { path: "config status", params: "[--cwd <path>]", description: "三层配置只读体检", stage: "current" },

  { path: "tasks", description: "任务管理（默认 list）", stage: "current", deprecatesTo: "task" },
  { path: "task", description: "任务管理（默认 list）", stage: "planned", aliases: ["tasks"] },
  { path: "task add", description: "新建任务", stage: "planned" },
  { path: "task update", description: "更新任务字段与状态", stage: "planned" },
  { path: "task check", description: "任务区体检", stage: "planned" },
  { path: "task archive", description: "归档已完成任务", stage: "planned" },
  { path: "task normalize", description: "归档块归一核验", stage: "planned" },
  { path: "task stats", description: "任务统计", stage: "planned" },
  { path: "task export", description: "导出任务", stage: "planned" },
  { path: "task import", description: "导入任务", stage: "planned" },

  { path: "skills", description: "技能安装与分发", stage: "current", deprecatesTo: "skill" },
  { path: "skill", description: "技能安装与分发", stage: "planned", aliases: ["skills"] },
  { path: "skill install", description: "安装技能", stage: "planned" },
  { path: "skill status", description: "技能现场状态", stage: "planned" },
  { path: "skill uninstall", description: "卸载技能", stage: "planned" },
  { path: "skill plan", description: "安装前预演", stage: "planned" },
  { path: "skill mount", description: "挂载外部来源", stage: "planned" },
  { path: "skill source", description: "管理外部来源", stage: "planned" },
  { path: "skill lint", description: "技能规范校验", stage: "planned" },
  { path: "skill bump", description: "递增技能版本", stage: "planned" },

  { path: "rules", description: "规则模块与组合器", stage: "current", deprecatesTo: "rule" },
  { path: "rule", description: "规则模块与组合器", stage: "planned", aliases: ["rules"] },
  { path: "rule list", description: "列出规则模块", stage: "planned" },
  { path: "rule compose", description: "组合规则全文", stage: "planned" },
  { path: "rule reset", description: "重置规则快照", stage: "planned" },
  { path: "rule check", description: "校验规则锚点与同源", stage: "planned" },

  { path: "conventions", description: "规范载体状态与升级", stage: "current", deprecatesTo: "convention" },
  { path: "convention", description: "规范载体状态与升级", stage: "planned", aliases: ["conventions"] },

  { path: "changelog", description: "多语言更新日志与发版", stage: "current", deprecatesTo: "release" },
  { path: "release", description: "多语言更新日志与发版（默认 status）", stage: "planned", aliases: ["changelog"] },

  { path: "docs", description: "文档站校验", stage: "current" },
  { path: "docs check", description: "文档站全量校验（theme / nav / dist）", stage: "planned" },

  { path: "usage", description: "技能使用情况统计", stage: "current" },
  { path: "usage rule", description: "输出可复制的全局规则文案", stage: "current", deprecatesTo: "rule compose --module usage" },

  { path: "scope", description: "作用域判定与策略", stage: "current" },
]

// 迁移对照表行：只列带弃用目标或别名的条目，供升级说明与帮助附录渲染
export interface CommandMigrationRow {
  from: string
  to: string
  note: string
}

// 生成迁移对照表：别名与新路径成对呈现，避免升级页各写一份
export function commandMigrationRows(): CommandMigrationRow[] {
  return COMMAND_REGISTRY.filter((entry) => entry.deprecatesTo).map((entry) => ({
    from: entry.path,
    to: entry.deprecatesTo as string,
    note: entry.stage === "current" ? "本版本仍可用" : "目标形态",
  }))
}

// 按路径取条目：未登记返回 undefined
export function findCommandEntry(path: string): CommandEntry | undefined {
  return COMMAND_REGISTRY.find((entry) => entry.path === path)
}

// 已移除命令：参数前缀 → 替代写法；命中时直接给出替代提示，避免只回「未知命令」
export const REMOVED_COMMANDS: ReadonlyArray<{ path: readonly string[]; hint: string }> = [
  {
    path: ["usage", "rule"],
    hint: "toolkit usage rule 已移除，请改用 toolkit rules compose --module usage（输出与旧命令逐字一致）",
  },
]

// 命中已移除命令时返回提示文案：只比较前若干非选项参数，允许命令后带任意参数
export function removedCommandHint(argv: string[]): string | null {
  const words = argv.filter((arg) => !arg.startsWith("-"))
  for (const item of REMOVED_COMMANDS) {
    if (item.path.every((segment, index) => words[index] === segment)) return item.hint
  }
  return null
}
