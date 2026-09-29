// 配置文件读取：三层加载——全局层 ~/.toolkitrc.json（个人跨项目偏好）、项目层自 process.cwd() 向上查找最近的
// .toolkitrc.json（团队共享）、本地层自 process.cwd() 向上查找最近的 .toolkitrc.local.json（个人按项目、默认不入库）。
// 合并粒度分层：全局层 → 项目层为段级整体覆盖，项目层 → 本地层为段内字段级浅合并（数组整体替换、深度仅一层）。
// 覆盖链：CLI --flag > 环境变量 > 本地层 > 项目层 > 全局层 > 默认值。各能力域按需取自己的配置段。
// 结构示例：
// {
//   "tasks":        { "dir": ".tasks" },
//   "redact":       { "enabled": true, "disable": [], "rules": [] },
//   "updateCheck":  { "enabled": true },
//   "check":        { "warnings": true },
//   "skills":       { "autoLink": true, "autoLinkReplaceForeign": true }
// }
import { existsSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { homedir } from "node:os"
import { readTextFile } from "./read-text"
import { normalizePathForCompare } from "./git-ignore"

// 项目配置文件名：团队共享，随 git 分发
const CONFIG_PROJECT_FILE = ".toolkitrc.json"
// 本地配置文件名：个人私有，默认被 git 忽略
const CONFIG_LOCAL_FILE = ".toolkitrc.local.json"
// 展示键清单（钉死四项）与其期望类型：类型非法的键按未写处理；该清单 ⊇ 环境变量覆盖组目标键（不变式）
const DISPLAY_KEY_TYPES: ReadonlyArray<{ key: string; type: "string" | "boolean" }> = [
  { key: "tasks.dir", type: "string" },
  { key: "redact.enabled", type: "boolean" },
  { key: "updateCheck.enabled", type: "boolean" },
  { key: "check.warnings", type: "boolean" },
]

// 配置降级告警去重集合：同一进程内同一个「文件 + 键」只提示一次（getConfigSection 有多个落点调用，不去重会刷屏）
const warnedConfigFallbacks = new Set<string>()

// 三层名称：全局层 / 项目层 / 本地层
export type ConfigLayerName = "全局层" | "项目层" | "本地层"

// 降级记录：file 为来源文件绝对路径（空串表无来源文件，即整文件级降级），key 为配置键路径（空串表整文件级）
export interface ConfigFallback {
  file: string
  key: string
  detail: string
}

// 单层加载结果：file 为命中的配置文件绝对路径（未命中为 null），hit 表文件存在且解析成功，sections 为该层写出的段名
export interface ConfigLayerRecord {
  layer: ConfigLayerName
  file: string | null
  hit: boolean
  sections: string[]
  config: Record<string, unknown> | null
}

// 三层加载结果：merged 为最终合并结果（供各能力域取段），fallbacks 为结构化降级记录（供 CLI 打印与 config status 取数）
export interface ConfigLayers {
  global: ConfigLayerRecord
  project: ConfigLayerRecord
  local: ConfigLayerRecord
  merged: Record<string, unknown> | null
  fallbacks: ConfigFallback[]
}

// config status 展示键清单：从类型表派生，保证两者不会漂移
export const CONFIG_DISPLAY_KEYS: readonly string[] = DISPLAY_KEY_TYPES.map((item) => item.key)

// 环境变量覆盖组：环境变量名 → 目标配置键；优先级高于三层文件，作 config status 与文档的共同真源
export const CONFIG_ENV_OVERRIDES: ReadonlyArray<{ env: string; key: string }> = [
  { env: "FX_REDACT", key: "redact.enabled" },
  { env: "FX_NO_UPDATE_CHECK", key: "updateCheck.enabled" },
  { env: "FX_CHECK_WARN", key: "check.warnings" },
]

// 能力旁路组：非配置键覆盖（CI 下跳过 skills.autoLink 自愈），须与覆盖组分开呈现，避免被当作配置覆盖排查
export const CONFIG_ENV_BYPASS: ReadonlyArray<{ env: string; key: string }> = [{ env: "CI", key: "skills.autoLink" }]

// 缓存：undefined=尚未加载；命中后为三层加载结果，无参 loadToolkitConfig 与 getConfigSection 共用
let cached: ConfigLayers | undefined

// 全局配置目录注入点（仅测试用）：生产保持 os.homedir()，测试指向临时目录避免读到真实用户配置
let homeOverride: string | undefined

// 取带缓存的三层加载结果：首次加载后打印降级告警；查找起点恒为 process.cwd()
function cachedLayers(): ConfigLayers {
  if (!cached) {
    cached = computeLayers(resolve(process.cwd()))
    printFallbacks(cached.fallbacks)
  }
  return cached
}

// 现算三层加载结果：按 startDir 逐层定位与读取、校验段级与展示键类型、按分层粒度合并，全程不写缓存
function computeLayers(startDir: string): ConfigLayers {
  const fallbacks: ConfigFallback[] = []
  const globalRecord = readLayer("全局层", join(getHomeDir(), ".toolkitrc.json"), fallbacks)
  // 项目层维持「一路查到文件系统根」的原语义，不收窄到 home，避免 home 之下的仓库命中不到项目配置
  const projectRecord = readLayer("项目层", findUpward(CONFIG_PROJECT_FILE, startDir, { stopAtHome: false }), fallbacks)
  const localRecord = readLayer("本地层", findUpward(CONFIG_LOCAL_FILE, startDir, { stopAtHome: true }), fallbacks)
  const base = mergeSectioned(globalRecord.config, projectRecord.config)
  const merged = mergeLocalOverlay(base, localRecord.config)
  return { global: globalRecord, project: projectRecord, local: localRecord, merged, fallbacks }
}

// 值类型描述：null 与数组单列，其余用 typeof（告警文案用，避免落成无信息的 object）
function describeType(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "数组"
  return typeof value
}

// 向上逐级查找最近的指定文件名：返回绝对路径，未找到返回 null
// stopAtHome 为真时遇 home 目录即截断（本意是挡 ~/.toolkitrc.local.json 被当本地层命中）；
// home 不在父链上时该边界不触发，退化为查到盘根为止
function findUpward(fileName: string, startDir: string, options: { stopAtHome: boolean }): string | null {
  const home = normalizePathForCompare(getHomeDir())
  let dir = resolve(startDir)
  for (;;) {
    if (options.stopAtHome && normalizePathForCompare(dir) === home) return null
    const candidate = join(dir, fileName)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

// 取某个能力域的配置段（对象）：不存在返回 undefined
// 段值非对象已在 readLayer 的统一校验中告警并剔除，此处只需取对象段，不再重复告警
export function getConfigSection(name: string): Record<string, unknown> | undefined {
  const section = cachedLayers().merged?.[name]
  return isPlainObject(section) ? section : undefined
}

// 当前生效的用户 home：测试注入优先，生产为 os.homedir()；供配置读取与 skills 分发等需要 home 的能力统一复用
export function getHomeDir(): string {
  return homeOverride ?? homedir()
}

// 某段是否显式写出有效叶子值：段为对象且该字段非 null / undefined；与合并逻辑共用同一叶子有效性判定
function hasUsableLeaf(config: Record<string, unknown> | null, sectionName: string, fieldName: string): boolean {
  const section = config?.[sectionName]
  return isPlainObject(section) && isUsableLeaf(section[fieldName])
}

// 现算三层加载结果且不打印降级告警：供 config status 取结构化降级记录自行渲染
// 不走进程级缓存（缓存起点固定 process.cwd()，--cwd 指定他目录时会取到陈旧结果），也不经告警去重集（否则取不到明细）
export function inspectConfigLayers(startDir?: string): ConfigLayers {
  return computeLayers(resolve(startDir ?? process.cwd()))
}

// 判是否普通对象：null 与数组均不算配置段 / 字段对象
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 判是否可采纳的叶子值：null 与 undefined 均视为未写（合并与来源判定共用同一判定，避免两处口径漂移）
function isUsableLeaf(value: unknown): boolean {
  return value !== undefined && value !== null
}

// 加载配置：无参走进程级缓存（起点 process.cwd()）；传 startDir 时按该起点现算且不写缓存
// 三层段级合并后再叠本地层字段级覆盖；三层均无配置返回 null
export function loadToolkitConfig(startDir?: string): Record<string, unknown> | null {
  if (startDir === undefined) return cachedLayers().merged
  const layers = computeLayers(resolve(startDir))
  printFallbacks(layers.fallbacks)
  return layers.merged
}

// 本地层段内字段级浅合并：只覆盖本地层显式写出的子字段，未写的保留团队值；合并深度严格一层（字段值为对象时整体替换、不递归）
// 边界：字段值为 null 与未写等价（本层不支持删除 / 清空团队键）；段值非对象已在 readLayer 的统一校验中告警剔除，此处只接对象段
function mergeLocalOverlay(
  base: Record<string, unknown> | null,
  overlay: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!overlay) return base
  const merged: Record<string, unknown> = base ? { ...base } : {}
  for (const [name, value] of Object.entries(overlay)) {
    if (!isPlainObject(value)) continue
    const baseSection = isPlainObject(merged[name]) ? (merged[name] as Record<string, unknown>) : {}
    const section = { ...baseSection }
    for (const [field, fieldValue] of Object.entries(value)) {
      if (!isUsableLeaf(fieldValue)) continue
      section[field] = fieldValue
    }
    merged[name] = section
  }
  // overlay 无有效段时回落 base（含 null），与「三层均无配置返回 null」一致
  return Object.keys(merged).length > 0 ? merged : null
}

// 段级合并：项目配置出现的段整体覆盖全局同名段（非字段级深合并），项目未配的段落到全局
function mergeSectioned(
  globalCfg: Record<string, unknown> | null,
  projectCfg: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!globalCfg) return projectCfg
  if (!projectCfg) return globalCfg
  const merged = { ...globalCfg }
  for (const [key, value] of Object.entries(projectCfg)) merged[key] = value
  return merged
}

// 打印降级告警：结构化记录逐个过 warnConfigFallback（含进程级去重），CLI 场景统一从此出口走 stderr
function printFallbacks(fallbacks: ConfigFallback[]): void {
  for (const item of fallbacks) warnConfigFallback(item.file, item.key, item.detail)
}

// 读取并解析单个配置文件：文件不存在返回 null（不告警）；读盘异常与 JSON 非法分别归因，顶层非对象同样降级
// 只推入结构化降级记录、不打印，使 config status 能取到明细且不被进程级去重集吞掉
function readConfigFile(filePath: string, fallbacks: ConfigFallback[]): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null
  let raw: string
  try {
    // 读盘即剥离 BOM，否则配置会被静默跳过
    raw = readTextFile(filePath)
  } catch (err) {
    fallbacks.push({ file: filePath, key: "", detail: `文件读取失败：${err instanceof Error ? err.message : String(err)}` })
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    fallbacks.push({ file: filePath, key: "", detail: "JSON 解析失败" })
    return null
  }
  if (!isPlainObject(parsed)) {
    fallbacks.push({ file: filePath, key: "", detail: `顶层须为对象（实际：${describeType(parsed)}）` })
    return null
  }
  return parsed
}

// 读取单层：定位到的文件不存在按未命中；解析成功后先校段级、再校展示键类型，最后归档段名与配置
function readLayer(layer: ConfigLayerName, filePath: string | null, fallbacks: ConfigFallback[]): ConfigLayerRecord {
  if (!filePath || !existsSync(filePath)) return { layer, file: null, hit: false, sections: [], config: null }
  const config = readConfigFile(filePath, fallbacks)
  if (!config) return { layer, file: filePath, hit: false, sections: [], config: null }
  validateSections(filePath, config, fallbacks)
  validateDisplayKeys(filePath, config, fallbacks)
  return { layer, file: filePath, hit: true, sections: Object.keys(config), config }
}

// 失效配置缓存：库形态长驻进程 / 测试中修改配置文件后调用，使下次读取重新加载
export function resetToolkitConfigCache(): void {
  cached = undefined
  // 告警去重集合同步清空，使重新加载后的降级问题仍能提示
  warnedConfigFallbacks.clear()
}

// 叶子键来源层：按分层覆盖语义判定——本地层段内字段级覆盖、项目层段级整体覆盖全局
// 本地层写了该段：该字段以本地层有效值命中，否则落团队值（项目层或全局层）
// 项目层写了该段：整段独占，段内未写的字段不再落全局，返回 null
export function resolveLeafSource(layers: ConfigLayers, key: string): ConfigLayerName | null {
  const dot = key.indexOf(".")
  const sectionName = key.slice(0, dot)
  const fieldName = key.slice(dot + 1)
  if (hasUsableLeaf(layers.local.config, sectionName, fieldName)) return "本地层"
  if (isPlainObject(layers.project.config?.[sectionName])) {
    return hasUsableLeaf(layers.project.config, sectionName, fieldName) ? "项目层" : null
  }
  return hasUsableLeaf(layers.global.config, sectionName, fieldName) ? "全局层" : null
}

// 本地配置文件定位：自 startDir 向上查找（止于 home），供 tasks check 与 config status 共用同一来源
// 定位与忽略判定同源——两处都从此函数取路径，避免各自向上查找导致「定位到的文件」与「判定的文件」漂移
export function resolveLocalConfigPath(startDir: string = process.cwd()): string | null {
  return findUpward(CONFIG_LOCAL_FILE, resolve(startDir), { stopAtHome: true })
}

// 解析任务目录三档：CLI --dir 显式传参 > 配置 tasks.dir > 默认 .tasks
// 支持 .tasks 放项目外（绝对路径或 ../ 相对路径），配合独立文档仓库管理任务
// ⚠️ tasks.dir 原样透传，相对路径的解析基准为 process.cwd()（非配置文件所在目录）；类型非法与空串的告警在加载时的类型校验统一给出
export function resolveTasksDir(cliValue?: string): string {
  if (cliValue) return cliValue
  // 类型不符与空串均已在展示键校验中降级剔除，此处只会取到有效非空字符串或 undefined
  const dir = getConfigSection("tasks")?.dir
  return typeof dir === "string" ? dir : ".tasks"
}

// 全局配置目录注入（仅测试用）：生产保持 os.homedir()
export function setHomeDirForTest(dir: string | undefined): void {
  homeOverride = dir
}

// 展示键类型校验：段非对象则跳过（段级降级已在 validateSections 处理）、字段为 null / undefined 视为未写
// 类型不符推入结构化降级记录并删除该字段（按未写降级）；字符串类型另将空串一并视为不可采纳，与「须为非空字符串」文案一致
function validateDisplayKeys(filePath: string, config: Record<string, unknown>, fallbacks: ConfigFallback[]): void {
  for (const { key, type } of DISPLAY_KEY_TYPES) {
    const dot = key.indexOf(".")
    const sectionName = key.slice(0, dot)
    const fieldName = key.slice(dot + 1)
    const section = config[sectionName]
    if (!isPlainObject(section)) continue
    const value = section[fieldName]
    if (!isUsableLeaf(value)) continue
    if (typeof value === type && !(type === "string" && value === "")) continue
    const expected = type === "string" ? "须为非空字符串" : "须为布尔值"
    const actual = value === "" ? "空字符串" : describeType(value)
    fallbacks.push({ file: filePath, key, detail: `${expected}（实际：${actual}）` })
    delete section[fieldName]
  }
}

// 段级校验：配置段须为普通对象，非对象（含 null / 数组 / 标量）一律告警并按未写处理，从配置中剔除该段
// 前移到读取路径使三层（全局 / 项目 / 本地）降级口径统一——否则全局 / 项目层的段级问题只在运行时惰性告警，
// 走 inspectConfigLayers 的 config status 取不到，同一现场两种口径
function validateSections(filePath: string, config: Record<string, unknown>, fallbacks: ConfigFallback[]): void {
  for (const [name, value] of Object.entries(config)) {
    if (isPlainObject(value)) continue
    fallbacks.push({ file: filePath, key: name, detail: `配置段须为对象（实际：${describeType(value)}）` })
    delete config[name]
  }
}

// 配置降级告警：显式配置却无法采纳时提示（走 stderr，stdout 留给机器可读输出）
// 去重键含来源文件，使同一键在两个文件各写错一次能各报一次、且文案可定位到具体文件
function warnConfigFallback(file: string, key: string, detail: string): void {
  const dedupKey = `${file}\u0000${key}`
  if (warnedConfigFallbacks.has(dedupKey)) return
  warnedConfigFallbacks.add(dedupKey)
  const head = key === "" ? `⚠️ 忽略配置文件「${file}」` : `⚠️ 忽略配置项「${key}」${file ? `（${file}）` : ""}`
  console.warn(`${head}：${detail}，已按未配置处理`)
}
