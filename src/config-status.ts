// config status 实现：只读查看三层配置的生效情况与来源（只读、退出码恒 0、报告走 stdout）
// 独立成模块的原因：src/cli.ts 顶层即执行主流程、无法被测试直接导入（与 src/conventions/status.ts 同例）
// 取数全部走 src/config.ts 与 src/git-ignore.ts 的既有实现，不在本模块另写一份加载或忽略判定
import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import {
  CONFIG_DISPLAY_KEYS,
  CONFIG_ENV_BYPASS,
  CONFIG_ENV_OVERRIDES,
  CONFIG_LOCAL_FILE,
  getHomeDir,
  inspectConfigLayers,
  resolveLeafSource,
  type ConfigFallback,
  type ConfigLayerName,
} from "./config"
import { inspectLocalConfigIgnore, normalizePathForCompare, probeRepo, toPosix, type LocalConfigIgnore } from "./git-ignore"

// 单层现场：file 为命中的配置文件绝对路径（未命中为 null）
// present 表是否定位到配置文件（存在即 true，解析失败时仍为 true 并在 items 报降级）——与 src/config.ts 的 ConfigLayerRecord.hit（存在且解析成功）语义不同，故不沿用同名
// ignored 仅本地层非 null（其余层无忽略语义）；sections 为该层写出的全部段名，otherSections 为未被展示键覆盖的其余已配置段名
export interface ConfigStatusLevel {
  layer: ConfigLayerName
  file: string | null
  present: boolean
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

// 环境变量命中：只列键名不列值；命中 = 已设置且非空，不代表「开启」——FX_REDACT=0 / FX_CHECK_WARN=0 会被列出但实际关闭该能力，FX_NO_UPDATE_CHECK 设真值反而关闭更新检查
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

// 报告契约：仅 summary / items / warnings 为稳定公共字段（只增不减），与 conventions status 同形
// 其余字段（cwd / levels / displayKeys / env / bypass）属实现细节，可能随版本变更
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

// 已知段名清单：与 docs/config.md 的字段总览同源，用于把「本版本未读取的段名」与「有效但非展示键的段」区分开
const KNOWN_SECTIONS = new Set(["redact", "check", "tasks", "changelog", "updateCheck", "skills"])

// 环境变量命中判据：已设置且非空即命中——注意这不等于「开启」能力，是否开启由各生效点的取值解析决定（见 ConfigStatusEnvHit 注释）
function isEnvHit(env: string): boolean {
  const value = process.env[env]
  return value !== undefined && value !== ""
}

// 文本模式路径显示：把 home 前缀折叠为 ~，避免共享日志 / 截图泄露本机目录结构（JSON 模式保留绝对路径供脚本定位）
// 前缀比较走 normalizePathForCompare（大小写不敏感 + 分隔符归一），否则 Windows 盘符 / 分隔符差异会让折叠失效
export function foldHome(p: string): string {
  const posix = toPosix(p)
  const home = toPosix(getHomeDir())
  const key = normalizePathForCompare(p)
  const homeKey = normalizePathForCompare(getHomeDir())
  if (key === homeKey) return "~"
  if (!key.startsWith(`${homeKey}/`)) return posix
  return `~/${posix.slice(home.length).replace(/^\/+/, "")}`
}

// 文本模式文案折叠：体检项 message 内可能内嵌 home 路径（降级项的配置文件路径、忽略提示的文件名），逐处折叠为 ~
// 以「后接分隔符或串尾」为界，避免同前缀目录（如 ~ 为 /Users/tqy 时 /Users/tqy2）被误折
export function foldHomeInText(text: string): string {
  const posix = toPosix(text)
  const posixLower = posix.toLowerCase()
  const homeKey = normalizePathForCompare(getHomeDir())
  let out = ""
  let cursor = 0
  for (let at = posixLower.indexOf(homeKey); at !== -1; at = posixLower.indexOf(homeKey, at + 1)) {
    const end = at + homeKey.length
    if (end !== posix.length && posix[end] !== "/") continue
    out += `${posix.slice(cursor, at)}~`
    cursor = end
  }
  return out + posix.slice(cursor)
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
// 段值非对象已在配置加载时降级剔除（不进 sections），此处对非对象仅作类型收窄、不再列出
function otherSections(config: Record<string, unknown> | null, sections: string[]): string[] {
  if (!config) return []
  return sections.filter((name) => {
    const section = config[name]
    if (typeof section !== "object" || section === null || Array.isArray(section)) return false
    return Object.keys(section).some((field) => !DISPLAY_KEY_SET.has(`${name}.${field}`))
  })
}

// home 边界提示：~/.toolkitrc.local.json 按设计不参与本地层向上查找（findUpward stopAtHome），存在时给 info 提示，避免用户误以为「按项目放了却不生效」是缺陷
function homeBoundaryItem(): ConfigStatusItem[] {
  if (!existsSync(join(getHomeDir(), CONFIG_LOCAL_FILE))) return []
  return [
    {
      level: "info",
      scope: "本地层",
      message: `检测到 home 目录下的 ${CONFIG_LOCAL_FILE}：该文件按设计不参与本地层向上查找（止于 home），如需按项目生效请放到项目目录下`,
    },
  ]
}

// 未知段名提示：otherSections 中未收录于已知段名清单的段名逐一给 info 提示（段名拼错时用户可从输出察觉）
// 用 info 而非 warn，保留文档承诺的「未知字段忽略、读取向后兼容」语义，且不计入 warnings、不影响 CI 拦错
function unknownSectionItems(levels: ConfigStatusLevel[]): ConfigStatusItem[] {
  const items: ConfigStatusItem[] = []
  for (const level of levels) {
    for (const name of level.otherSections) {
      if (KNOWN_SECTIONS.has(name)) continue
      items.push({
        level: "info",
        scope: "配置",
        message: `${level.layer}存在未知配置段「${name}」：本版本未读取，疑似拼写错误`,
      })
    }
  }
  return items
}

// 一句话结论：层数 0 时给正结论；git 旁注不替换主句（非 git 仓库时忽略判定不适用，须让用户知道该列为何为空）
function summarize(presentLayers: ConfigLayerName[], gitNote: boolean): string {
  const head =
    presentLayers.length === 0 ? "三层均无配置文件，全部取默认值" : `共命中 ${presentLayers.length} 层：${presentLayers.join("、")}`
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
    present: record.file !== null,
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
  items.push(...homeBoundaryItem(), ...unknownSectionItems(levels))

  return {
    summary: summarize(
      levels.filter((level) => level.present).map((level) => level.layer),
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
