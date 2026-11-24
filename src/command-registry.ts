// 命令注册表：路径、参数形态、引入阶段、别名与弃用目标的单一数据源
// 命令说明不在此处重复：文案贴近各自选项与参数的定义处，注册表只承载可机读的结构事实
// 迁移对照表（v2 升级页）、旧路径 argv 重写、命令域清单与测试均从此取数
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { cachePath } from "./cache"

export interface CommandEntry {
  // 命令路径（空格分隔，如 "config set"）
  path: string
  // 参数形态（位置参数与关键选项），无参数时省略
  params?: string
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
  { path: "init", stage: "current" },
  { path: "status", stage: "current" },
  { path: "upgrade", stage: "current" },

  { path: "config", stage: "current" },
  { path: "config list", params: "[--layer <layer>]", stage: "current" },
  { path: "config get", params: "<key> [--explain]", stage: "current" },
  { path: "config set", params: "<key> <value> [--layer <layer>]", stage: "current" },
  { path: "config unset", params: "<key> [--layer <layer>]", stage: "current" },
  { path: "config status", params: "[--cwd <path>]", stage: "current" },

  { path: "privacy", stage: "current" },
  { path: "privacy scan", stage: "current" },

  { path: "task", stage: "current" },
  { path: "task init", stage: "current" },
  { path: "task list", stage: "current", tier: "advanced" },
  { path: "task add", stage: "current" },
  { path: "task update", stage: "current" },
  { path: "task check", stage: "current" },
  { path: "task archive", stage: "current" },
  { path: "task normalize", stage: "current" },
  { path: "task stats", stage: "current" },
  { path: "task export", stage: "current" },
  { path: "task import", stage: "current" },
  { path: "tasks", stage: "current", deprecatesTo: "task" },

  { path: "skill", stage: "current" },
  { path: "skill install", stage: "current" },
  { path: "skill list", stage: "current" },
  { path: "skill status", params: "[--path]", stage: "current" },
  { path: "skill uninstall", stage: "current" },
  { path: "skill reconcile", stage: "current" },
  { path: "skill mount", stage: "current", tier: "advanced" },
  { path: "skill source", stage: "current" },
  { path: "skill source notify", stage: "current", tier: "advanced" },
  { path: "skill source refresh", stage: "current" },
  { path: "skill source remove", stage: "current" },
  { path: "skill lint", stage: "current" },
  { path: "skill bump", stage: "current" },
  { path: "skills", stage: "current", deprecatesTo: "skill" },
  // 旧路径：下沉到 status --path / config set 后仅保留重写，不再注册独立命令
  { path: "skills path", stage: "current", deprecatesTo: "skill status --path" },
  { path: "skills gate", stage: "current", deprecatesTo: "config get|set skillDelivery.default" },
  { path: "skills sources", stage: "current", deprecatesTo: "skill source" },

  { path: "rule", stage: "current" },
  { path: "rule list", stage: "current" },
  { path: "rule compose", stage: "current" },
  { path: "rule reset", stage: "current" },
  { path: "rule check", stage: "current" },
  { path: "rule sync", stage: "current" },
  { path: "rules", stage: "current", deprecatesTo: "rule" },

  { path: "convention", stage: "current" },
  { path: "convention status", stage: "current" },
  { path: "convention upgrade", stage: "current" },
  { path: "convention format", stage: "current" },
  { path: "conventions", stage: "current", deprecatesTo: "convention" },

  { path: "release", stage: "current" },
  { path: "release status", stage: "current" },
  { path: "release bump", stage: "current" },
  { path: "release changelog", stage: "current" },
  { path: "release mirror", stage: "current" },
  { path: "release publish", stage: "current", tier: "advanced" },
  { path: "release audit", stage: "current", tier: "advanced" },
  { path: "release changeset", stage: "current" },
  { path: "release changeset add", stage: "current" },
  { path: "release changeset list", stage: "current" },
  { path: "release changeset status", stage: "current" },
  { path: "release changeset init", stage: "current", tier: "advanced" },
  { path: "release changeset pre", stage: "current", tier: "advanced" },
  { path: "release changeset tag", stage: "current", tier: "advanced" },
  // 旧名：重写到新命令，不再注册独立命令
  { path: "changelog", stage: "current", deprecatesTo: "release" },
  { path: "changelog version", stage: "current", deprecatesTo: "release bump" },
  { path: "changelog format", stage: "current", deprecatesTo: "release changelog" },
  { path: "changelog doc", stage: "current", deprecatesTo: "release mirror" },
  { path: "changelog add", stage: "current", deprecatesTo: "release changeset add" },

  { path: "docs", stage: "current" },
  { path: "docs check", stage: "current" },
  { path: "docs theme", stage: "current" },
  { path: "docs theme check", stage: "current" },
  { path: "docs theme write", stage: "current" },
  { path: "docs nav", stage: "current" },
  { path: "docs nav check", stage: "current" },
  { path: "docs nav init", stage: "current" },
  { path: "docs dist", stage: "current" },
  { path: "docs dist check", stage: "current" },

  { path: "usage", stage: "current" },
  { path: "usage show", stage: "current" },
  { path: "usage show stats", stage: "current" },
  { path: "usage data", stage: "current" },
  { path: "usage data export", stage: "current" },
  { path: "usage data import", stage: "current" },
  { path: "usage data dedupe", stage: "current" },
  { path: "usage data rebuild", stage: "current" },
  { path: "usage data purge", stage: "current" },
  { path: "usage data doctor", stage: "current" },
  { path: "usage config", stage: "current" },
  { path: "usage config channel", stage: "current" },
  { path: "usage config origins", stage: "current" },
  { path: "usage config scope", stage: "current" },
  { path: "usage config capture", stage: "current" },
  { path: "usage config storage", stage: "current" },
  { path: "usage config upload", stage: "current", tier: "advanced" },
  { path: "usage config upload setup", stage: "current", tier: "advanced" },
  { path: "usage config upload status", stage: "current", tier: "advanced" },
  { path: "usage config upload send", stage: "current", tier: "advanced" },
  { path: "usage setup", params: "[--interactive]", stage: "current" },
  { path: "usage setup init", stage: "current" },
  { path: "usage setup uninstall", stage: "current" },
  { path: "usage setup hooks", stage: "current", tier: "advanced" },
  { path: "usage setup hooks install", stage: "current", tier: "advanced" },
  { path: "usage setup hooks remove", stage: "current", tier: "advanced" },
  { path: "usage setup hooks status", stage: "current", tier: "advanced" },
  { path: "usage flush", stage: "current", tier: "advanced" },
  { path: "usage ingest", stage: "current", tier: "advanced" },
  { path: "usage record", stage: "current" },
  { path: "usage log", stage: "current", tier: "advanced" },
  { path: "usage rule", stage: "current", deprecatesTo: "rule compose --module usage" },

  { path: "scope", params: "[--interactive]", stage: "current" },
  { path: "scope status", stage: "current" },
  { path: "scope guard", stage: "current", tier: "advanced" },
  { path: "scope list", stage: "current" },
  { path: "scope list add", stage: "current" },
  { path: "scope list exclude", stage: "current" },
  { path: "scope list remove", stage: "current" },
  { path: "scope list default", stage: "current" },
  { path: "scope list reset", stage: "current" },
  { path: "scope skills", stage: "current" },
  { path: "scope skills list", stage: "current" },
  { path: "scope skills allow", stage: "current" },
  { path: "scope skills deny", stage: "current" },
  { path: "scope skills profile", stage: "current" },
  { path: "scope skills reset", stage: "current" },
  { path: "scope policy", stage: "current" },
  { path: "scope policy list", stage: "current" },
  { path: "scope policy add", stage: "current" },
  { path: "scope policy remove", stage: "current" },
  { path: "scope policy reset", stage: "current" },
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
  { from: ["usage", "wizard"], to: ["usage", "setup"] },
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
