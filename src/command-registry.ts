// 命令注册表：路径、参数、说明、引入阶段、别名与弃用目标的单一数据源
// help 分组（任务 3）、迁移对照表（v2 升级页）、旧路径 argv 重写与测试均从此取数，避免多处各写一份清单
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { cachePath } from "./cache"

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
  // 帮助分层：advanced 为低频命令，默认 hidden，仅在 help 的高级块中列出
  tier?: "common" | "advanced"
}

// 顶层对象与动作：按 v2 目标命令树登记，阶段字段标注每个任务落地时点
export const COMMAND_REGISTRY: readonly CommandEntry[] = [
  { path: "init", description: "初始化任务区、规范载体与技能入口层", stage: "current" },
  { path: "status", description: "聚合任务区 / 技能现场 / 配置层 / 文档站 / 版本与弃用项", stage: "current" },

  { path: "config", description: "配置唯一写入口与三层只读体检", stage: "current" },
  { path: "config list", params: "[--layer <layer>]", description: "列出可写配置键与来源层", stage: "current" },
  { path: "config get", params: "<key> [--explain]", description: "读取单个配置键", stage: "current" },
  { path: "config set", params: "<key> <value> [--layer <layer>]", description: "写入单个配置键", stage: "current" },
  { path: "config unset", params: "<key> [--layer <layer>]", description: "删除单个配置键", stage: "current" },
  { path: "config status", params: "[--cwd <path>]", description: "三层配置只读体检", stage: "current" },

  { path: "task", description: "任务管理（默认 list）", stage: "current" },
  { path: "task list", description: "任务看板（等价裸 task）", stage: "current", tier: "advanced" },
  { path: "task add", description: "新建任务", stage: "current" },
  { path: "task update", description: "更新任务字段与状态", stage: "current" },
  { path: "task check", description: "任务区体检", stage: "current" },
  { path: "task archive", description: "归档已完成任务", stage: "current" },
  { path: "task normalize", description: "归档块归一核验", stage: "current" },
  { path: "task stats", description: "任务统计", stage: "current" },
  { path: "task export", description: "导出任务", stage: "current" },
  { path: "task import", description: "导入任务", stage: "current" },
  { path: "tasks", description: "任务管理（旧名，重写到 task）", stage: "current", deprecatesTo: "task" },

  { path: "skill", description: "技能安装与分发", stage: "current" },
  { path: "skill install", description: "安装技能", stage: "current" },
  { path: "skill status", params: "[--path]", description: "技能现场状态（--path 输出包根）", stage: "current" },
  { path: "skill uninstall", description: "卸载技能", stage: "current" },
  { path: "skill plan", description: "安装前预演", stage: "current", tier: "advanced" },
  { path: "skill mount", description: "批量挂载到多个项目", stage: "current", tier: "advanced" },
  { path: "skill source", description: "管理外部来源（默认列表）", stage: "current" },
  { path: "skill source notify", description: "设置来源更新提示频率", stage: "current", tier: "advanced" },
  { path: "skill source refresh", description: "刷新来源缓存与版本", stage: "current" },
  { path: "skill source remove", description: "注销来源登记", stage: "current" },
  { path: "skill lint", description: "技能规范校验", stage: "current" },
  { path: "skill bump", description: "递增技能版本", stage: "current" },
  { path: "skills", description: "技能安装与分发（旧名，重写到 skill）", stage: "current", deprecatesTo: "skill" },
  // 旧路径：下沉到 status --path / config set 后仅保留重写，不再注册独立命令
  { path: "skills path", description: "输出包根路径（已下沉到 skill status --path）", stage: "current", deprecatesTo: "skill status --path" },
  { path: "skills gate", description: "查看或切换内容闸门（已下沉到 config）", stage: "current", deprecatesTo: "config get|set skillDelivery.default" },
  { path: "skills sources", description: "外部来源（已改名 skill source）", stage: "current", deprecatesTo: "skill source" },

  { path: "rule", description: "规则模块与组合器", stage: "current" },
  { path: "rule list", description: "列出规则模块", stage: "current" },
  { path: "rule compose", description: "组合规则全文", stage: "current" },
  { path: "rule reset", description: "重置规则快照", stage: "current" },
  { path: "rule check", description: "校验规则锚点与同源", stage: "current" },
  { path: "rules", description: "规则模块与组合器（旧名，重写到 rule）", stage: "current", deprecatesTo: "rule" },

  { path: "convention", description: "规范载体状态与升级", stage: "current" },
  { path: "convention status", description: "规范载体只读体检", stage: "current" },
  { path: "convention upgrade", description: "规范载体结构升级", stage: "current" },
  { path: "convention format", description: "表格与索引单元格归一", stage: "current" },
  { path: "conventions", description: "规范载体（旧名，重写到 convention）", stage: "current", deprecatesTo: "convention" },

  { path: "release", description: "多语言更新日志与发版（默认 status）", stage: "current" },
  { path: "release status", description: "待发布变更集概览（只读）", stage: "current" },
  { path: "release bump", description: "消费变更集并生成新版本块", stage: "current" },
  { path: "release changelog", description: "按语言与类型归类重排条目", stage: "current" },
  { path: "release mirror", description: "生成或校验文档站镜像页", stage: "current" },
  { path: "release publish", description: "发布已升版产物（透传给 changesets）", stage: "current", tier: "advanced" },
  { path: "release audit", description: "审计待发布变更集（只提示不改写）", stage: "current", tier: "advanced" },
  { path: "release changeset add", description: "新增变更集（透传给 changesets）", stage: "current" },
  { path: "release changeset list", description: "列出待发布变更集（只读）", stage: "current" },
  { path: "release changeset status", description: "查看待发布变更集状态（透传给 changesets）", stage: "current" },
  // 旧名：重写到新命令，不再注册独立命令
  { path: "changelog", description: "发版域（旧名，重写到 release）", stage: "current", deprecatesTo: "release" },
  { path: "changelog version", description: "消费变更集（已改名 release bump）", stage: "current", deprecatesTo: "release bump" },
  { path: "changelog format", description: "归类重排（已改名 release changelog）", stage: "current", deprecatesTo: "release changelog" },
  { path: "changelog doc", description: "文档镜像（已改名 release mirror）", stage: "current", deprecatesTo: "release mirror" },
  { path: "changelog add", description: "新增变更集（已归入 release changeset）", stage: "current", deprecatesTo: "release changeset add" },

  { path: "docs", description: "文档站校验", stage: "current" },
  { path: "docs check", description: "文档站全量校验（theme / nav / dist）", stage: "current" },

  { path: "usage", description: "技能使用情况统计", stage: "current" },
  { path: "usage show", description: "查看开关、数据目录与事件计数（默认）", stage: "current" },
  { path: "usage show stats", description: "技能使用统计", stage: "current" },
  { path: "usage data", description: "导出 / 导入 / 去重 / 清理 / 重建", stage: "current" },
  { path: "usage data export", description: "导出事件", stage: "current" },
  { path: "usage data import", description: "导入事件", stage: "current" },
  { path: "usage data dedupe", description: "事件去重", stage: "current" },
  { path: "usage data rebuild", description: "重建索引", stage: "current" },
  { path: "usage data purge", description: "按保留期清理事件", stage: "current" },
  { path: "usage data doctor", description: "采集链路体检", stage: "current" },
  { path: "usage config", description: "采集配置（通道 / 来源 / 范围 / 字段 / 存储 / 上传）", stage: "current" },
  { path: "usage config channel", description: "采集通道", stage: "current" },
  { path: "usage config origins", description: "来源开关", stage: "current" },
  { path: "usage config scope", description: "技能统计范围", stage: "current" },
  { path: "usage config capture", description: "采集字段", stage: "current" },
  { path: "usage config storage", description: "本地存储", stage: "current" },
  { path: "usage config upload", description: "可选上传", stage: "current", tier: "advanced" },
  { path: "usage setup", description: "初始化 / 停用 / Hook 与向导", stage: "current" },
  { path: "usage setup wizard", description: "交互向导", stage: "current" },
  { path: "usage setup init", description: "初始化并启用", stage: "current" },
  { path: "usage setup uninstall", description: "停用并卸载 Hook", stage: "current" },
  { path: "usage setup hooks", description: "Hook 安装 / 状态 / 卸载", stage: "current", tier: "advanced" },
  { path: "usage record", description: "上报一次技能调用", stage: "current" },
  { path: "usage log", description: "补录一次历史调用", stage: "current", tier: "advanced" },
  { path: "usage rule", description: "输出可复制的全局规则文案", stage: "current", deprecatesTo: "rule compose --module usage" },

  { path: "scope", description: "作用域判定与策略", stage: "current" },
  { path: "scope list", description: "目录名单（默认查看，增删改同组）", stage: "current" },
  { path: "scope list add", description: "把目录加入白名单", stage: "current" },
  { path: "scope list exclude", description: "把目录加入黑名单", stage: "current" },
  { path: "scope list remove", description: "移除名单条目", stage: "current" },
  { path: "scope list default", description: "默认生效值", stage: "current" },
  { path: "scope list reset", description: "清除限制", stage: "current" },
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
    hint: "toolkit usage rule 已移除，请改用 toolkit rule compose --module usage（输出与旧命令逐字一致）",
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

// 旧路径重写表：from 为旧路径分段，to 为新路径（函数形态用于需要改写入参的个别命令）
export interface DeprecatedRewrite {
  from: readonly string[]
  to: readonly string[] | ((rest: string[]) => string[])
  // 额外说明（映射规则无法自解释时给出，如 on/off → gated/full）
  note?: string
}

// 旧路径 → 新路径：只匹配命令起始处的连续分段，参数原样保留在后
export const DEPRECATED_REWRITES: readonly DeprecatedRewrite[] = [
  // usage 四组：show / data / config / setup
  { from: ["usage", "info"], to: ["usage", "show"] },
  { from: ["usage", "stats"], to: ["usage", "show", "stats"] },
  {
    from: ["usage", "enable"],
    to: ["config", "set", "usage.enabled", "true", "--yes"],
    note: "总开关改由 config set usage.enabled 写入",
  },
  {
    from: ["usage", "disable"],
    to: ["config", "set", "usage.enabled", "false", "--yes"],
    note: "总开关改由 config set usage.enabled 写入",
  },
  { from: ["usage", "export"], to: ["usage", "data", "export"] },
  { from: ["usage", "import"], to: ["usage", "data", "import"] },
  { from: ["usage", "dedupe"], to: ["usage", "data", "dedupe"] },
  { from: ["usage", "rebuild"], to: ["usage", "data", "rebuild"] },
  { from: ["usage", "purge"], to: ["usage", "data", "purge"] },
  { from: ["usage", "doctor"], to: ["usage", "data", "doctor"] },
  { from: ["usage", "channel"], to: ["usage", "config", "channel"] },
  { from: ["usage", "origins"], to: ["usage", "config", "origins"] },
  { from: ["usage", "scope"], to: ["usage", "config", "scope"] },
  { from: ["usage", "capture"], to: ["usage", "config", "capture"] },
  { from: ["usage", "storage"], to: ["usage", "config", "storage"] },
  { from: ["usage", "upload"], to: ["usage", "config", "upload"] },
  { from: ["usage", "wizard"], to: ["usage", "setup", "wizard"] },
  { from: ["usage", "init"], to: ["usage", "setup", "init"] },
  { from: ["usage", "uninstall"], to: ["usage", "setup", "uninstall"] },
  { from: ["usage", "hooks"], to: ["usage", "setup", "hooks"] },
  // scope 名单组
  { from: ["scope", "add"], to: ["scope", "list", "add"] },
  { from: ["scope", "exclude"], to: ["scope", "list", "exclude"] },
  { from: ["scope", "remove"], to: ["scope", "list", "remove"] },
  { from: ["scope", "default"], to: ["scope", "list", "default"] },
  { from: ["scope", "reset"], to: ["scope", "list", "reset"] },
  // 发版域子命令改名与分组（旧顶层名 changelog 在表末统一映射到 release）
  { from: ["changelog", "version"], to: ["release", "bump"] },
  { from: ["changelog", "format"], to: ["release", "changelog"] },
  { from: ["changelog", "doc"], to: ["release", "mirror"] },
  { from: ["changelog", "add"], to: ["release", "changeset", "add"] },
  { from: ["changelog", "pre"], to: ["release", "changeset", "pre"], note: "预发布模式暂未纳入分组，仍透传 changesets" },
  { from: ["changelog", "tag"], to: ["release", "changeset", "tag"], note: "打标签仍透传 changesets" },
  { from: ["changelog", "init"], to: ["release", "changeset", "init"], note: "初始化仍透传 changesets" },
  // skills 低频下沉与来源收敛
  { from: ["skills", "path"], to: ["skill", "status", "--path"] },
  { from: ["skills", "sources"], to: ["skill", "source"] },
  {
    from: ["skills", "gate"],
    to: (rest) => {
      // 首个位置参数为 on/off 时改写成 config set（on → gated、off → full），否则按查询处理
      const { positionals, options } = splitPositionals(rest, ["--format", "--cwd", "--layer"])
      const value = positionals[0]
      if (value === undefined) return ["config", "get", "skillDelivery.default", ...rest]
      const mapped = value === "on" ? "gated" : value === "off" ? "full" : value
      return ["config", "set", "skillDelivery.default", mapped, ...options, "--yes"]
    },
    note: "on → gated、off → full；查询改用 config get skillDelivery.default",
  },
  // 顶层对象改名：放在表末，确保上面的长路径（changelog version / skills path 等）先匹配
  { from: ["tasks"], to: ["task"] },
  { from: ["skills"], to: ["skill"] },
  { from: ["rules"], to: ["rule"] },
  { from: ["conventions"], to: ["convention"] },
  { from: ["changelog"], to: ["release"] },
]

// 分离位置参数与选项：值型选项连带的取值不当作位置参数（如 --format json 的 json）
function splitPositionals(argv: string[], valueOptions: readonly string[]): { positionals: string[]; options: string[] } {
  const positionals: string[] = []
  const options: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!
    if (token.startsWith("-")) {
      options.push(token)
      // 值型选项：紧随其后的非选项 token 一并归入选项段
      if (valueOptions.includes(token) && argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("-")) {
        options.push(argv[index + 1]!)
        index += 1
      }
      continue
    }
    positionals.push(token)
  }
  return { positionals, options }
}

// 渲染新路径供提示文案使用
function renderPath(path: readonly string[]): string {
  return `toolkit ${path.join(" ")}`
}

// 运行时弃用命中：旧命令被调用时记录来源、目标与时间
export interface DeprecationHit {
  from: string
  to: string
  at: string
}

// 重写结果：新 argv、提示文案与命中记录；未命中时原样返回
export interface DeprecatedRewriteResult {
  argv: string[]
  note: string | null
  hit: DeprecationHit | null
}

// 旧路径 argv 重写：只认命令起始处的连续分段，命中后参数原样保留
export function rewriteDeprecatedArgv(argv: string[]): DeprecatedRewriteResult {
  for (const item of DEPRECATED_REWRITES) {
    if (item.from.length > argv.length) continue
    const matched = item.from.every((segment, index) => argv[index] === segment)
    if (!matched) continue
    const rest = argv.slice(item.from.length)
    const next = typeof item.to === "function" ? item.to(rest) : [...item.to, ...rest]
    const from = `toolkit ${item.from.join(" ")}`
    const to = renderPath(next)
    const extra = item.note ? `（${item.note}）` : ""
    return {
      argv: next,
      note: `${from} 已弃用，已按 ${to} 执行${extra}；旧写法仍可用，后续版本将移除`,
      hit: { from, to, at: new Date().toISOString() },
    }
  }
  return { argv, note: null, hit: null }
}

// 弃用命中记录文件：落在用户缓存目录，可安全删除
function deprecationFile(): string {
  return cachePath("deprecations.json")
}

// 记录命中：读取已有数组追加，最多保留 200 条，写失败不影响命令本身
export function recordDeprecationHits(hits: DeprecationHit[]): void {
  if (hits.length === 0) return
  const file = deprecationFile()
  try {
    let previous: DeprecationHit[] = []
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown
        if (Array.isArray(parsed)) previous = parsed as DeprecationHit[]
      } catch {
        // 损坏的记录文件直接覆盖，不阻断命令
      }
    }
    const next = [...previous, ...hits].slice(-200)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8")
  } catch {
    // 缓存目录不可写时只丢失汇总信息，不影响当次命令
  }
}

// 读取并清空本机弃用命中记录：status 汇总时消费一次，避免重复计数
export function takeDeprecationHits(): DeprecationHit[] {
  const file = deprecationFile()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown
    rmSync(file, { force: true })
    return Array.isArray(parsed) ? (parsed as DeprecationHit[]) : []
  } catch {
    return []
  }
}
