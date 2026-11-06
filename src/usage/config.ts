// 使用情况配置：usage 段只读全局层 ~/.toolkitrc.json；项目层 / 本地层误写只告警、不生效
// 默认全部关闭，配置读写都不触碰其它段，避免克隆仓库后被项目配置被动开启采集
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { getHomeDir, inspectConfigLayers, type ConfigLayerRecord } from "../config"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import type {
  UsageConfig,
  UsageRotation,
  UsageSkillMode,
  UsageUploadProtocol,
} from "./types"

// 默认配置：任何开关未显式写出时都按关闭处理
export const DEFAULT_USAGE_CONFIG: UsageConfig = {
  enabled: false,
  agents: {},
  sources: { firstParty: false, thirdParty: false, unmanaged: false },
  skills: { mode: "none", include: [], exclude: [] },
  capture: { triggerPrompt: false, skillArgs: false, outcome: false },
  storage: { dir: "", rotation: "monthly", retentionDays: 180, maxFileBytes: 8 * 1024 * 1024 },
  upload: { enabled: false, protocol: "webhook", endpoint: "", headers: {}, allowInsecure: false, batchSize: 100 },
}

// 误写层告警去重：同一进程内同一层只提示一次
const warnedMisplacedLayers = new Set<string>()

// 配置项非法告警去重：同一键只提示一次
const warnedInvalidKeys = new Set<string>()

// 旧值提示去重：同一进程内同一旧值只提示一次
const warnedLegacyValues = new Set<string>()

// 旧值提示：旧配置段 / 旧环境变量 / 旧目录改名后不再生效，明确告知而非静默忽略
function warnLegacyOnce(key: string, message: string): void {
  if (warnedLegacyValues.has(key)) return
  warnedLegacyValues.add(key)
  console.warn(message)
}

// 全局配置文件路径：使用情况配置的唯一合法落点
export function usageConfigPath(): string {
  return join(getHomeDir(), ".toolkitrc.json")
}

// 判普通对象：数组与 null 不算配置段
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 告警非法配置值：按未配置处理并回落到默认值，不静默吞掉
function warnInvalid(key: string, expected: string, actual: unknown): void {
  if (warnedInvalidKeys.has(key)) return
  warnedInvalidKeys.add(key)
  const type = actual === null ? "null" : Array.isArray(actual) ? "数组" : typeof actual
  console.warn(`⚠️ 忽略技能使用情况配置项「${key}」：须为${expected}（实际：${type}），已按默认值处理`)
}

// 读取布尔值：未写返回默认；类型不符告警并回落
function readBoolean(value: unknown, fallback: boolean, key: string): boolean {
  if (value === undefined || value === null) return fallback
  if (typeof value === "boolean") return value
  warnInvalid(key, "布尔值", value)
  return fallback
}

// 读取字符串：空串是合法值（表示未配置，走默认），仅类型不符时回落
function readString(value: unknown, fallback: string, key: string): string {
  if (value === undefined || value === null) return fallback
  if (typeof value === "string") return value
  warnInvalid(key, "字符串", value)
  return fallback
}

// 读取正整数：用于保留期、批量大小与文件大小上限
function readPositiveInt(value: unknown, fallback: number, key: string): number {
  if (value === undefined || value === null) return fallback
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  warnInvalid(key, "正整数", value)
  return fallback
}

// 读取字符串数组：非数组整体回落，数组内非字符串项剔除
function readStringArray(value: unknown, fallback: string[], key: string): string[] {
  if (value === undefined || value === null) return fallback
  if (!Array.isArray(value)) {
    warnInvalid(key, "字符串数组", value)
    return fallback
  }
  return value.filter((item): item is string => typeof item === "string" && item !== "")
}

// 读取字符串映射：用于上传请求头
function readStringMap(value: unknown, fallback: Record<string, string>, key: string): Record<string, string> {
  if (value === undefined || value === null) return fallback
  if (!isPlainObject(value)) {
    warnInvalid(key, "字符串映射", value)
    return fallback
  }
  const out: Record<string, string> = {}
  for (const [name, item] of Object.entries(value)) {
    if (typeof item === "string") out[name] = item
  }
  return out
}

// 校验旋转枚举：非法值回落 monthly
function readRotation(value: unknown, fallback: UsageRotation): UsageRotation {
  if (value === undefined || value === null) return fallback
  if (value === "monthly" || value === "size" || value === "none") return value
  warnInvalid("usage.storage.rotation", "monthly / size / none", value)
  return fallback
}

// 校验技能模式枚举：非法值回落 none
function readSkillMode(value: unknown, fallback: UsageSkillMode): UsageSkillMode {
  if (value === undefined || value === null) return fallback
  if (value === "none" || value === "all" || value === "include" || value === "exclude") return value
  warnInvalid("usage.skills.mode", "none / all / include / exclude", value)
  return fallback
}

// 校验上传协议枚举：非法值回落 webhook
function readUploadProtocol(value: unknown, fallback: UsageUploadProtocol): UsageUploadProtocol {
  if (value === undefined || value === null) return fallback
  if (value === "webhook" || value === "otlp-http" || value === "file") return value
  warnInvalid("usage.upload.protocol", "webhook / otlp-http / file", value)
  return fallback
}

// 段读取：非对象告警后按空对象处理，避免后续逐字段重复报错
function readSection(section: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = section[name]
  if (value === undefined || value === null) return {}
  if (isPlainObject(value)) return value
  warnInvalid(`usage.${name}`, "对象", value)
  return {}
}

// 归一化 usage 段：所有非法值回落默认，合法值原样采纳
export function normalizeUsageConfig(raw: unknown): UsageConfig {
  const defaults = DEFAULT_USAGE_CONFIG
  if (raw === undefined || raw === null) return defaults
  if (!isPlainObject(raw)) {
    warnInvalid("usage", "对象", raw)
    return defaults
  }
  const agentsRaw = readSection(raw, "agents")
  const agents: Record<string, boolean> = {}
  for (const [name, value] of Object.entries(agentsRaw)) {
    if (typeof value === "boolean") agents[name] = value
  }
  const sourcesRaw = readSection(raw, "sources")
  const skillsRaw = readSection(raw, "skills")
  const captureRaw = readSection(raw, "capture")
  const storageRaw = readSection(raw, "storage")
  const uploadRaw = readSection(raw, "upload")
  return {
    enabled: readBoolean(raw.enabled, defaults.enabled, "usage.enabled"),
    agents,
    sources: {
      firstParty: readBoolean(sourcesRaw.firstParty, defaults.sources.firstParty, "usage.sources.firstParty"),
      thirdParty: readBoolean(sourcesRaw.thirdParty, defaults.sources.thirdParty, "usage.sources.thirdParty"),
      unmanaged: readBoolean(sourcesRaw.unmanaged, defaults.sources.unmanaged, "usage.sources.unmanaged"),
    },
    skills: {
      mode: readSkillMode(skillsRaw.mode, defaults.skills.mode),
      include: readStringArray(skillsRaw.include, defaults.skills.include, "usage.skills.include"),
      exclude: readStringArray(skillsRaw.exclude, defaults.skills.exclude, "usage.skills.exclude"),
    },
    capture: {
      triggerPrompt: readBoolean(captureRaw.triggerPrompt, defaults.capture.triggerPrompt, "usage.capture.triggerPrompt"),
      skillArgs: readBoolean(captureRaw.skillArgs, defaults.capture.skillArgs, "usage.capture.skillArgs"),
      outcome: readBoolean(captureRaw.outcome, defaults.capture.outcome, "usage.capture.outcome"),
    },
    storage: {
      dir: readString(storageRaw.dir, defaults.storage.dir, "usage.storage.dir"),
      rotation: readRotation(storageRaw.rotation, defaults.storage.rotation),
      retentionDays: readPositiveInt(storageRaw.retentionDays, defaults.storage.retentionDays, "usage.storage.retentionDays"),
      maxFileBytes: readPositiveInt(storageRaw.maxFileBytes, defaults.storage.maxFileBytes, "usage.storage.maxFileBytes"),
    },
    upload: {
      enabled: readBoolean(uploadRaw.enabled, defaults.upload.enabled, "usage.upload.enabled"),
      protocol: readUploadProtocol(uploadRaw.protocol, defaults.upload.protocol),
      endpoint: readString(uploadRaw.endpoint, defaults.upload.endpoint, "usage.upload.endpoint"),
      headers: readStringMap(uploadRaw.headers, defaults.upload.headers, "usage.upload.headers"),
      allowInsecure: readBoolean(uploadRaw.allowInsecure, defaults.upload.allowInsecure, "usage.upload.allowInsecure"),
      batchSize: readPositiveInt(uploadRaw.batchSize, defaults.upload.batchSize, "usage.upload.batchSize"),
    },
  }
}

// 误写层告警：项目层 / 本地层的 usage 段不会生效，必须让写者看见
function warnMisplacedLayer(record: ConfigLayerRecord, label: string): void {
  if (!record.config || !("usage" in record.config)) return
  const key = `${label}:${record.file ?? ""}`
  if (warnedMisplacedLayers.has(key)) return
  warnedMisplacedLayers.add(key)
  console.warn(`⚠️ 技能使用情况配置仅支持全局层 ~/.toolkitrc.json，已忽略${label}「${record.file ?? "未知路径"}」中的 usage 段`)
}

// 旧版 telemetry 段提示：改名后不再读取，避免用户误以为配置仍生效
function warnLegacySection(record: ConfigLayerRecord, label: string): void {
  if (!record.config || !("telemetry" in record.config)) return
  warnLegacyOnce(
    `section:${label}:${record.file ?? ""}`,
    `⚠️ 已忽略${label}「${record.file ?? "未知路径"}」中的 telemetry 段：该段已更名为 usage，需手动迁移`,
  )
}

// 加载使用情况配置：只取全局层；项目层 / 本地层出现 usage 段时告警
export function loadUsageConfig(): UsageConfig {
  const layers = inspectConfigLayers(process.cwd())
  warnMisplacedLayer(layers.project, "项目层")
  warnMisplacedLayer(layers.local, "本地层")
  warnLegacySection(layers.global, "全局层")
  warnLegacySection(layers.project, "项目层")
  warnLegacySection(layers.local, "本地层")
  return normalizeUsageConfig(layers.global.config?.usage)
}

// 展开家目录简写：仅处理 ~ 与 ~/ 前缀
function expandHome(path: string): string {
  if (path === "~") return getHomeDir()
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(getHomeDir(), path.slice(2))
  return path
}

// 解析数据目录：CLI > 环境变量 > 配置 > 默认 ~/.toolkit/usage
export function resolveUsageDir(cliDir?: string, config?: UsageConfig): string {
  const cfg = config ?? loadUsageConfig()
  if (process.env.TOOLKIT_TELEMETRY_DIR) {
    warnLegacyOnce("env", "⚠️ 已忽略环境变量 TOOLKIT_TELEMETRY_DIR：已更名为 TOOLKIT_USAGE_DIR")
  }
  const legacyDir = join(getHomeDir(), ".toolkit", "telemetry")
  if (!cliDir && !process.env.TOOLKIT_USAGE_DIR && !cfg.storage.dir && existsSync(legacyDir)) {
    warnLegacyOnce("dir", `⚠️ 检测到旧数据目录 ${legacyDir}：已停用且不再读取，如需沿用请用 --dir 或 storage.dir 指定`)
  }
  const raw = cliDir || process.env.TOOLKIT_USAGE_DIR || cfg.storage.dir || join(getHomeDir(), ".toolkit", "usage")
  return resolve(expandHome(raw))
}

// 读取全局配置原文：文件不存在返回空对象；解析失败直接报错，避免覆盖用户配置
function readGlobalRaw(): Record<string, unknown> {
  const file = usageConfigPath()
  if (!existsSync(file)) return {}
  const text = readTextFile(file)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`全局配置 JSON 解析失败，未写入：${file}`)
  }
  if (!isPlainObject(parsed)) throw new Error(`全局配置顶层须为对象，未写入：${file}`)
  return parsed
}

// 更新全局 usage 段：只合并传入字段，保留其它段与未知字段
export function updateUsageConfig(patch: Record<string, unknown>): void {
  const raw = readGlobalRaw()
  const current = isPlainObject(raw.usage) ? { ...raw.usage } : {}
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(current[key])) {
      current[key] = { ...(current[key] as Record<string, unknown>), ...value }
    } else {
      current[key] = value
    }
  }
  raw.usage = current
  writeFileAtomic(usageConfigPath(), `${JSON.stringify(raw, null, 2)}\n`)
}

// 测试用：清空告警去重集合，使重新加载后的配置问题仍能提示
export function resetUsageConfigWarnings(): void {
  warnedMisplacedLayers.clear()
  warnedInvalidKeys.clear()
  warnedLegacyValues.clear()
}
