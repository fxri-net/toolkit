// config status 实现：只读查看三层配置的生效情况与来源（只读、退出码恒 0、报告走 stdout）
// 独立成模块的原因：src/cli.ts 顶层即执行主流程、无法被测试直接导入（与 src/conventions/status.ts 同例）
// 取数全部走 src/config.ts 与 src/git-ignore.ts 的既有实现，不在本模块另写一份加载或忽略判定
import { basename } from "node:path"
import {
  CONFIG_DISPLAY_KEYS,
  CONFIG_ENV_BYPASS,
  CONFIG_ENV_OVERRIDES,
  inspectConfigLayers,
  resolveLeafSource,
  type ConfigFallback,
  type ConfigLayerName,
} from "./config"
import { inspectLocalConfigIgnore, probeRepo, type LocalConfigIgnore } from "./git-ignore"

// 单层现场：file 为命中的配置文件绝对路径（未命中为 null），hit 表是否命中配置文件（存在即命中，解析失败时仍为 true 并在 items 报降级）
// ignored 仅本地层非 null（其余层无忽略语义）；sections 为该层写出的全部段名，otherSections 为未被展示键覆盖的其余已配置段名
export interface ConfigStatusLevel {
  layer: ConfigLayerName
  file: string | null
  hit: boolean
  ignored: LocalConfigIgnore | null
  sections: string[]
  otherSections: string[]
}

// 展示键来源：source 为合并结果中该叶子键的来源层（三层均未显式写出该键时为 null，即取默认值）
// 下沉到叶子键粒度——段内字段级浅合并下同一段的子键可能来源混合，按段标注会失真
export interface ConfigStatusKeySource {
  key: string
  source: ConfigLayerName | null
}

// 环境变量命中：只列键名不列值
export interface ConfigStatusEnvHit {
  env: string
  key: string
}

// 体检项：level 只分「待处理（warn）」与「提示（info）」，info 不计入问题数
export interface ConfigStatusItem {
  level: "warn" | "info"
  scope: string
  message: string
}

// 报告契约：summary / levels / items / warnings 为稳定公共字段（只增不减），与 conventions status 同形
export interface ConfigStatusReport {
  summary: string
  cwd: string
  levels: ConfigStatusLevel[]
  displayKeys: ConfigStatusKeySource[]
  env: ConfigStatusEnvHit[]
  bypass: ConfigStatusEnvHit[]
  items: ConfigStatusItem[]
  warnings: number
}

// 展示键集合（叶子键全名）：用于判定某段是否仍有展示键之外的字段
const DISPLAY_KEY_SET = new Set(CONFIG_DISPLAY_KEYS)

// 环境变量命中判据：非空即命中（与 src/switch.ts 的 resolveEnabled 同口径），未设置或空串按未命中
function isEnvHit(env: string): boolean {
  const value = process.env[env]
  return value !== undefined && value !== ""
}

// 降级项：从 readConfigFile 的结构化记录取数（不依赖进程级去重集），文案与 CLI 打印口径一致
function fallbackItems(fallbacks: ConfigFallback[]): ConfigStatusItem[] {
  return fallbacks.map((item) => ({
    level: "warn" as const,
    scope: "配置",
    message:
      item.key === ""
        ? `忽略配置文件「${item.file}」：${item.detail}，已按未配置处理`
        : `忽略配置项「${item.key}」（${item.file}）：${item.detail}，已按未配置处理`,
  }))
}

// 本地配置文件忽略状态提示：ignored 为 info（正结论），其余均需处理或说明，不计入 warnings 的只有两态「不适用」
// 该提示除 --format 非法外恒输出、不受任何配置开关影响，是不被本地层 check.warnings:false 静音的第二条自查通道
function ignoreItem(ignore: LocalConfigIgnore, file: string): ConfigStatusItem {
  switch (ignore.state) {
    case "ignored":
      return { level: "info", scope: "本地层", message: `本地配置文件已纳入 git 忽略：${file}` }
    case "not-ignored":
      return {
        level: "warn",
        scope: "本地层",
        message: "本地配置文件未纳入 git 忽略，可能随 git 提交泄露个人配置：重跑 toolkit init 可自动补写忽略行",
      }
    case "tracked":
      return {
        level: "warn",
        scope: "本地层",
        message: `本地配置文件已被忽略规则覆盖但仍被 git 跟踪（疑似历史 git add -f）：执行 git rm --cached ${basename(file)} 后才会真正不入库`,
      }
    case "unavailable":
      return {
        level: "warn",
        scope: "本地层",
        message: `本地配置文件忽略判定不可用（${ignore.detail ?? "未知原因"}），请核实 git 环境`,
      }
    case "outside-repo":
      return { level: "info", scope: "本地层", message: "本地配置文件位于当前仓库工作树之外，忽略判定不适用" }
    default:
      return { level: "info", scope: "本地层", message: "未检测到 git 仓库，本地配置文件的忽略判定不适用" }
  }
}

// 其余已配置段：仅当该段仍有「展示键之外」的字段时列出（只列段名不列值），否则该段已在展示键来源里可见、不重复
// 段值为非对象时无法逐字段比对，一律列出（见 src/config.ts 的段级降级口径）
function otherSections(config: Record<string, unknown> | null, sections: string[]): string[] {
  if (!config) return []
  return sections.filter((name) => {
    const section = config[name]
    if (typeof section !== "object" || section === null || Array.isArray(section)) return true
    return Object.keys(section).some((field) => !DISPLAY_KEY_SET.has(`${name}.${field}`))
  })
}

// 一句话结论：层数 0 时给正结论；git 旁注不替换主句（非 git 仓库时忽略判定不适用，须让用户知道该列为何为空）
function summarize(hitLayers: ConfigLayerName[], gitNote: boolean): string {
  const head =
    hitLayers.length === 0 ? "三层均无配置文件，全部取默认值" : `共命中 ${hitLayers.length} 层：${hitLayers.join("、")}`
  return gitNote ? `${head}；未检测到 git 仓库，忽略判定不适用` : head
}

// 体检入口：按 cwd 现算三层（不写全局缓存，避免 --cwd 指定他目录时取到 process.cwd() 的陈旧结果）
export function configStatus(cwd: string = process.cwd()): ConfigStatusReport {
  const layers = inspectConfigLayers(cwd)
  const localFile = layers.local.file
  const ignore = localFile === null ? null : inspectLocalConfigIgnore(localFile, cwd)

  const levels: ConfigStatusLevel[] = [layers.global, layers.project, layers.local].map((record) => ({
    layer: record.layer,
    file: record.file,
    hit: record.file !== null,
    ignored: record.layer === "本地层" ? ignore : null,
    sections: record.sections,
    otherSections: otherSections(record.config, record.sections),
  }))

  const displayKeys: ConfigStatusKeySource[] = CONFIG_DISPLAY_KEYS.map((key) => ({
    key,
    source: resolveLeafSource(layers, key),
  }))
  const env = CONFIG_ENV_OVERRIDES.filter((item) => isEnvHit(item.env))
  const bypass = CONFIG_ENV_BYPASS.filter((item) => isEnvHit(item.env))

  const items: ConfigStatusItem[] = [...fallbackItems(layers.fallbacks)]
  if (ignore !== null && localFile !== null) items.push(ignoreItem(ignore, localFile))

  return {
    summary: summarize(
      levels.filter((level) => level.hit).map((level) => level.layer),
      probeRepo(cwd).kind === "not-a-repo",
    ),
    cwd,
    levels,
    displayKeys,
    env,
    bypass,
    items,
    warnings: items.filter((item) => item.level === "warn").length,
  }
}
