// 配置键元数据：config list / get / set / unset 的唯一真源
// 每个键声明类型、默认写入层、可写层与校验口径，读取实现只按段取值，写入实现只按本表落盘，避免两处漂移
import type { ConfigLayerName } from "./config"

// 写入层标识：与 scope/config-file.ts 的三层命名一致
export type ConfigKeyLayer = "global" | "project" | "local"

// 键值类型：枚举与字符串数组在写入前各自归一
export type ConfigKeyType = "boolean" | "number" | "enum" | "string" | "stringList"

// 单条键元数据
export interface ConfigKeySpec {
  // 点分路径（段名 + 字段路径），如 usage.storage.dir
  key: string
  type: ConfigKeyType
  summary: string
  // 未指定 --layer 时的写入层
  defaultLayer: ConfigKeyLayer
  // 允许写入的层；其余层报错而非静默改名
  writableLayers: readonly ConfigKeyLayer[]
  // 枚举取值（type 为 enum 时必填）
  values?: readonly string[]
  // 正整数下限（type 为 number 时生效）
  min?: number
  // 敏感值：文本与 JSON 默认打码，--reveal 显式输出原文
  sensitive?: boolean
  // 默认值：仅用于 list / get 展示，读取真源仍在各域实现
  default?: boolean | number | string | string[]
}

// 三层全开：未做层级约束的键默认允许任意层写入
const ALL_LAYERS: readonly ConfigKeyLayer[] = ["global", "project", "local"]
// 仅全局层：个人跨项目偏好（usage / skillInstall 等）
const GLOBAL_ONLY: readonly ConfigKeyLayer[] = ["global"]
// 仅项目层：团队共享偏好（projectSkill）
const PROJECT_ONLY: readonly ConfigKeyLayer[] = ["project"]

// 键表：段名与顶层对象一致（单数），字段路径与各域读取实现逐字对应
const CONFIG_KEY_DEFINITIONS: readonly ConfigKeySpec[] = [
  // 任务区
  { key: "task.dir", type: "string", summary: "任务区目录（相对路径基于运行目录解析）", defaultLayer: "project", writableLayers: ALL_LAYERS },
  // 脱敏
  { key: "redact.enabled", type: "boolean", summary: "启用内置脱敏", defaultLayer: "global", writableLayers: ALL_LAYERS },
  { key: "redact.disable", type: "stringList", summary: "按名禁用内置脱敏规则（逗号分隔）", defaultLayer: "global", writableLayers: ALL_LAYERS },
  // 校验
  { key: "check.warnings", type: "boolean", summary: "tasks check 输出软告警", defaultLayer: "global", writableLayers: ALL_LAYERS },
  // 升级检查
  { key: "updateCheck.enabled", type: "boolean", summary: "检查新版本并提示", defaultLayer: "global", writableLayers: ALL_LAYERS },
  // 技能链接自愈
  { key: "skills.autoLink", type: "boolean", summary: "命令启动时自愈悬空技能链接", defaultLayer: "global", writableLayers: ALL_LAYERS },
  {
    key: "skills.autoLinkReplaceForeign",
    type: "boolean",
    summary: "自愈时替换指向其它包的同名技能链接",
    defaultLayer: "global",
    writableLayers: ALL_LAYERS,
  },
  // 技能安装偏好（全局面）
  { key: "skillInstall.mode", type: "enum", values: ["skills", "package"], summary: "全局技能安装形态", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "skillInstall.targets", type: "stringList", summary: "全局技能安装目标目录（逗号分隔）", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  // 分发形态
  {
    key: "skillDelivery.default",
    type: "enum",
    values: ["full", "gated", "off"],
    summary: "技能分发默认形态（全文 / 入口壳 / 不安装）",
    defaultLayer: "global",
    writableLayers: ALL_LAYERS,
  },
  // 技能安装偏好（项目面）
  { key: "projectSkill.mode", type: "enum", values: ["skills", "package"], summary: "项目技能安装形态", defaultLayer: "project", writableLayers: PROJECT_ONLY },
  { key: "projectSkill.targets", type: "stringList", summary: "项目技能安装目录（逗号分隔）", defaultLayer: "project", writableLayers: PROJECT_ONLY },
  // 作用域
  {
    key: "activation.mode",
    type: "enum",
    values: ["all", "allowlist", "denylist"],
    summary: "旧激活段默认模式（新项目建议改用 policies）",
    defaultLayer: "global",
    writableLayers: ALL_LAYERS,
  },
  // 文档站导航
  { key: "docs.nav.dir", type: "string", summary: "文档目录", defaultLayer: "project", writableLayers: ALL_LAYERS },
  { key: "docs.nav.maxItems", type: "number", min: 1, summary: "导航条目数上限", defaultLayer: "project", writableLayers: ALL_LAYERS },
  { key: "docs.nav.maxGroupUnits", type: "number", min: 1, summary: "导航分组名长度上限", defaultLayer: "project", writableLayers: ALL_LAYERS },
  { key: "docs.nav.firstItem", type: "string", summary: "导航首项名", defaultLayer: "project", writableLayers: ALL_LAYERS },
  { key: "docs.nav.lastItem", type: "string", summary: "导航末项名", defaultLayer: "project", writableLayers: ALL_LAYERS },
  { key: "docs.nav.maxPageLines", type: "number", min: 1, summary: "单页行数上限", defaultLayer: "project", writableLayers: ALL_LAYERS },
  // 文档站产物
  { key: "docs.dist.dir", type: "string", summary: "产物目录（相对文档目录）", defaultLayer: "project", writableLayers: ALL_LAYERS },
  {
    key: "docs.dist.sitemap",
    type: "enum",
    values: ["error", "warn", "off"],
    summary: "sitemap 缺失时的处置",
    defaultLayer: "project",
    writableLayers: ALL_LAYERS,
  },
  {
    key: "docs.dist.searchProvider",
    type: "enum",
    values: ["local", "none"],
    summary: "搜索实现",
    defaultLayer: "project",
    writableLayers: ALL_LAYERS,
  },
  // 使用情况（仅全局层，避免克隆仓库被动开启采集）
  { key: "usage.enabled", type: "boolean", summary: "技能使用情况总开关", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.channel", type: "enum", values: ["rule", "hook"], summary: "采集通道", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.sources.firstParty", type: "boolean", summary: "统计一方技能", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.sources.thirdParty", type: "boolean", summary: "统计第三方技能", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.sources.unmanaged", type: "boolean", summary: "统计未托管技能", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  {
    key: "usage.skills.mode",
    type: "enum",
    values: ["none", "all", "include", "exclude"],
    summary: "技能统计范围模式",
    defaultLayer: "global",
    writableLayers: GLOBAL_ONLY,
  },
  { key: "usage.skills.include", type: "stringList", summary: "技能统计白名单（逗号分隔）", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.skills.exclude", type: "stringList", summary: "技能统计黑名单（逗号分隔）", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.capture.triggerPrompt", type: "boolean", summary: "采集触发词", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.capture.skillArgs", type: "boolean", summary: "采集技能参数", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.capture.outcome", type: "boolean", summary: "采集执行结果", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.storage.dir", type: "string", summary: "事件数据目录", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  {
    key: "usage.storage.rotation",
    type: "enum",
    values: ["monthly", "size", "none"],
    summary: "事件文件轮转方式",
    defaultLayer: "global",
    writableLayers: GLOBAL_ONLY,
  },
  { key: "usage.storage.retentionDays", type: "number", min: 1, summary: "事件保留天数", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.storage.maxFileBytes", type: "number", min: 1, summary: "单文件大小上限（字节）", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  { key: "usage.upload.enabled", type: "boolean", summary: "上传事件到远端", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
  {
    key: "usage.upload.protocol",
    type: "enum",
    values: ["webhook", "otlp-http", "file"],
    summary: "上传协议",
    defaultLayer: "global",
    writableLayers: GLOBAL_ONLY,
  },
  { key: "usage.upload.endpoint", type: "string", summary: "上传地址", defaultLayer: "global", writableLayers: GLOBAL_ONLY, sensitive: true },
  { key: "usage.upload.batchSize", type: "number", min: 1, summary: "单批上传条数", defaultLayer: "global", writableLayers: GLOBAL_ONLY },
]

// 默认值：与各域读取实现的缺省口径一致，只用于展示；未登记的键按「无默认值」处理
const CONFIG_KEY_DEFAULTS: Readonly<Record<string, ConfigKeySpec["default"]>> = {
  "task.dir": ".tasks",
  "redact.enabled": true,
  "redact.disable": [],
  "check.warnings": true,
  "updateCheck.enabled": true,
  "skills.autoLink": true,
  "skills.autoLinkReplaceForeign": true,
  "skillInstall.mode": "skills",
  "skillDelivery.default": "full",
  "projectSkill.mode": "skills",
  "activation.mode": "all",
  "docs.nav.dir": "docs",
  "docs.nav.maxItems": 5,
  "docs.nav.maxGroupUnits": 4,
  "docs.nav.firstItem": "快速开始",
  "docs.nav.lastItem": "帮助",
  "docs.nav.maxPageLines": 300,
  "docs.dist.dir": ".vitepress/dist",
  "docs.dist.sitemap": "error",
  "docs.dist.searchProvider": "local",
  "usage.enabled": false,
  "usage.channel": "hook",
  "usage.sources.firstParty": false,
  "usage.sources.thirdParty": false,
  "usage.sources.unmanaged": false,
  "usage.skills.mode": "none",
  "usage.skills.include": [],
  "usage.skills.exclude": [],
  "usage.capture.triggerPrompt": false,
  "usage.capture.skillArgs": false,
  "usage.capture.outcome": false,
  "usage.storage.dir": "~/.toolkit/usage",
  "usage.storage.rotation": "monthly",
  "usage.storage.retentionDays": 180,
  "usage.storage.maxFileBytes": 8 * 1024 * 1024,
  "usage.upload.enabled": false,
  "usage.upload.protocol": "webhook",
  "usage.upload.batchSize": 100,
}

// 对外键表：定义 + 默认值合并后的只读清单
export const CONFIG_KEYS: readonly ConfigKeySpec[] = CONFIG_KEY_DEFINITIONS.map((spec) => ({
  ...spec,
  default: CONFIG_KEY_DEFAULTS[spec.key],
}))

// 键索引：按完整路径取元数据
const KEY_INDEX = new Map(CONFIG_KEYS.map((spec) => [spec.key, spec]))

// 取键元数据：未登记返回 undefined
export function getConfigKey(key: string): ConfigKeySpec | undefined {
  return KEY_INDEX.get(key)
}

// 全部已登记键（保持表内顺序）：供 list 与建议函数复用
export function configKeyNames(): string[] {
  return CONFIG_KEYS.map((spec) => spec.key)
}

// 编辑距离：仅用于拼写建议，输入都很短，直接两行动规实现
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0] as number
    prev[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j] as number
      prev[j] = Math.min((prev[j] as number) + 1, (prev[j - 1] as number) + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = temp
    }
  }
  return prev[b.length] as number
}

// 最接近的键建议：同段前缀优先，其次编辑距离不超过 3；无候选返回空数组
export function suggestConfigKeys(input: string): string[] {
  const lowered = input.trim().toLowerCase()
  if (!lowered) return []
  const section = lowered.split(".")[0]
  const scored = CONFIG_KEYS.map((spec) => {
    const distance = editDistance(lowered, spec.key.toLowerCase())
    const sameSection = spec.key.toLowerCase().startsWith(`${section}.`) ? 0 : 1
    return { key: spec.key, distance, sameSection }
  })
    .filter((item) => item.distance <= 3)
    .sort((a, b) => a.sameSection - b.sameSection || a.distance - b.distance || a.key.localeCompare(b.key))
  return scored.slice(0, 3).map((item) => item.key)
}

// 类型文案：报错与帮助共用
export function configKeyTypeLabel(spec: ConfigKeySpec): string {
  switch (spec.type) {
    case "boolean":
      return "布尔值（true / false）"
    case "number":
      return spec.min === undefined ? "正整数" : `不小于 ${spec.min} 的整数`
    case "enum":
      return `枚举（${(spec.values ?? []).join(" / ")}）`
    case "stringList":
      return "字符串数组（逗号分隔）"
    default:
      return "非空字符串"
  }
}

// 解析命令行取值：类型不符返回错误文案，合法返回归一后的值
export function parseConfigValue(spec: ConfigKeySpec, raw: string): { value?: unknown; error?: string } {
  const text = raw.trim()
  switch (spec.type) {
    case "boolean": {
      const lowered = text.toLowerCase()
      if (["true", "1", "yes", "on"].includes(lowered)) return { value: true }
      if (["false", "0", "no", "off"].includes(lowered)) return { value: false }
      return { error: `须为${configKeyTypeLabel(spec)}` }
    }
    case "number": {
      // 只认十进制整数：Number() 会把 0x10、1e3 当成合法值，与「正整数」文案不符
      if (!/^-?\d+$/.test(text)) return { error: `须为${configKeyTypeLabel(spec)}` }
      const value = Number(text)
      if (!Number.isInteger(value)) return { error: `须为${configKeyTypeLabel(spec)}` }
      if (spec.min !== undefined && value < spec.min) return { error: `须为${configKeyTypeLabel(spec)}` }
      return { value }
    }
    case "enum": {
      if (!(spec.values ?? []).includes(text)) return { error: `须为${configKeyTypeLabel(spec)}` }
      return { value: text }
    }
    case "stringList": {
      const items = text === "" ? [] : text.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
      return { value: [...new Set(items)] }
    }
    default:
      if (text === "") return { error: "须为非空字符串" }
      return { value: text }
  }
}

// 层名映射：命令参数取值与打印文案共用
export const CONFIG_LAYER_LABELS: Record<ConfigKeyLayer, ConfigLayerName> = {
  global: "全局层",
  project: "项目层",
  local: "本地层",
}

// 层参数判定：供命令层区分「未指定」与「非法取值」
export function isConfigLayer(value: string | undefined): value is ConfigKeyLayer {
  return value === "global" || value === "project" || value === "local"
}
