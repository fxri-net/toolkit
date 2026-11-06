// 遥测配置：telemetry 段只读全局层 ~/.toolkitrc.json；项目层 / 本地层误写只告警、不生效
// 默认全部关闭，配置读写都不触碰其它段，避免克隆仓库后被项目配置被动开启采集
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { getHomeDir, inspectConfigLayers, type ConfigLayerRecord } from "../config"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import type {
  TelemetryConfig,
  TelemetryRotation,
  TelemetrySkillMode,
  TelemetryUploadProtocol,
} from "./types"

// 默认配置：任何开关未显式写出时都按关闭处理
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
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

// 全局配置文件路径：遥测配置的唯一合法落点
export function telemetryConfigPath(): string {
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
  console.warn(`⚠️ 忽略遥测配置项「${key}」：须为${expected}（实际：${type}），已按默认值处理`)
}

// 读取布尔值：未写返回默认；类型不符告警并回落
function readBoolean(value: unknown, fallback: boolean, key: string): boolean {
  if (value === undefined || value === null) return fallback
  if (typeof value === "boolean") return value
  warnInvalid(key, "布尔值", value)
  return fallback
}

// 读取非空字符串：空串与类型不符都回落
function readString(value: unknown, fallback: string, key: string): string {
  if (value === undefined || value === null) return fallback
  if (typeof value === "string" && value !== "") return value
  warnInvalid(key, "非空字符串", value)
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
function readRotation(value: unknown, fallback: TelemetryRotation): TelemetryRotation {
  if (value === undefined || value === null) return fallback
  if (value === "monthly" || value === "size" || value === "none") return value
  warnInvalid("telemetry.storage.rotation", "monthly / size / none", value)
  return fallback
}

// 校验技能模式枚举：非法值回落 none
function readSkillMode(value: unknown, fallback: TelemetrySkillMode): TelemetrySkillMode {
  if (value === undefined || value === null) return fallback
  if (value === "none" || value === "all" || value === "include" || value === "exclude") return value
  warnInvalid("telemetry.skills.mode", "none / all / include / exclude", value)
  return fallback
}

// 校验上传协议枚举：非法值回落 webhook
function readUploadProtocol(value: unknown, fallback: TelemetryUploadProtocol): TelemetryUploadProtocol {
  if (value === undefined || value === null) return fallback
  if (value === "webhook" || value === "otlp-http" || value === "file") return value
  warnInvalid("telemetry.upload.protocol", "webhook / otlp-http / file", value)
  return fallback
}

// 段读取：非对象告警后按空对象处理，避免后续逐字段重复报错
function readSection(section: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = section[name]
  if (value === undefined || value === null) return {}
  if (isPlainObject(value)) return value
  warnInvalid(`telemetry.${name}`, "对象", value)
  return {}
}

// 归一化 telemetry 段：所有非法值回落默认，合法值原样采纳
export function normalizeTelemetryConfig(raw: unknown): TelemetryConfig {
  const defaults = DEFAULT_TELEMETRY_CONFIG
  if (raw === undefined || raw === null) return defaults
  if (!isPlainObject(raw)) {
    warnInvalid("telemetry", "对象", raw)
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
    enabled: readBoolean(raw.enabled, defaults.enabled, "telemetry.enabled"),
    agents,
    sources: {
      firstParty: readBoolean(sourcesRaw.firstParty, defaults.sources.firstParty, "telemetry.sources.firstParty"),
      thirdParty: readBoolean(sourcesRaw.thirdParty, defaults.sources.thirdParty, "telemetry.sources.thirdParty"),
      unmanaged: readBoolean(sourcesRaw.unmanaged, defaults.sources.unmanaged, "telemetry.sources.unmanaged"),
    },
    skills: {
      mode: readSkillMode(skillsRaw.mode, defaults.skills.mode),
      include: readStringArray(skillsRaw.include, defaults.skills.include, "telemetry.skills.include"),
      exclude: readStringArray(skillsRaw.exclude, defaults.skills.exclude, "telemetry.skills.exclude"),
    },
    capture: {
      triggerPrompt: readBoolean(captureRaw.triggerPrompt, defaults.capture.triggerPrompt, "telemetry.capture.triggerPrompt"),
      skillArgs: readBoolean(captureRaw.skillArgs, defaults.capture.skillArgs, "telemetry.capture.skillArgs"),
      outcome: readBoolean(captureRaw.outcome, defaults.capture.outcome, "telemetry.capture.outcome"),
    },
    storage: {
      dir: readString(storageRaw.dir, defaults.storage.dir, "telemetry.storage.dir"),
      rotation: readRotation(storageRaw.rotation, defaults.storage.rotation),
      retentionDays: readPositiveInt(storageRaw.retentionDays, defaults.storage.retentionDays, "telemetry.storage.retentionDays"),
      maxFileBytes: readPositiveInt(storageRaw.maxFileBytes, defaults.storage.maxFileBytes, "telemetry.storage.maxFileBytes"),
    },
    upload: {
      enabled: readBoolean(uploadRaw.enabled, defaults.upload.enabled, "telemetry.upload.enabled"),
      protocol: readUploadProtocol(uploadRaw.protocol, defaults.upload.protocol),
      endpoint: readString(uploadRaw.endpoint, defaults.upload.endpoint, "telemetry.upload.endpoint"),
      headers: readStringMap(uploadRaw.headers, defaults.upload.headers, "telemetry.upload.headers"),
      allowInsecure: readBoolean(uploadRaw.allowInsecure, defaults.upload.allowInsecure, "telemetry.upload.allowInsecure"),
      batchSize: readPositiveInt(uploadRaw.batchSize, defaults.upload.batchSize, "telemetry.upload.batchSize"),
    },
  }
}

// 误写层告警：项目层 / 本地层的 telemetry 段不会生效，必须让写者看见
function warnMisplacedLayer(record: ConfigLayerRecord, label: string): void {
  if (!record.config || !("telemetry" in record.config)) return
  const key = `${label}:${record.file ?? ""}`
  if (warnedMisplacedLayers.has(key)) return
  warnedMisplacedLayers.add(key)
  console.warn(`⚠️ 遥测配置仅支持全局层 ~/.toolkitrc.json，已忽略${label}「${record.file ?? "未知路径"}」中的 telemetry 段`)
}

// 加载遥测配置：只取全局层；项目层 / 本地层出现 telemetry 段时告警
export function loadTelemetryConfig(): TelemetryConfig {
  const layers = inspectConfigLayers(process.cwd())
  warnMisplacedLayer(layers.project, "项目层")
  warnMisplacedLayer(layers.local, "本地层")
  return normalizeTelemetryConfig(layers.global.config?.telemetry)
}

// 展开家目录简写：仅处理 ~ 与 ~/ 前缀
function expandHome(path: string): string {
  if (path === "~") return getHomeDir()
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(getHomeDir(), path.slice(2))
  return path
}

// 解析数据目录：CLI > 环境变量 > 配置 > 默认 ~/.toolkit/telemetry
export function resolveTelemetryDir(cliDir?: string, config?: TelemetryConfig): string {
  const cfg = config ?? loadTelemetryConfig()
  const raw = cliDir || process.env.TOOLKIT_TELEMETRY_DIR || cfg.storage.dir || join(getHomeDir(), ".toolkit", "telemetry")
  return resolve(expandHome(raw))
}

// 读取全局配置原文：文件不存在返回空对象；解析失败直接报错，避免覆盖用户配置
function readGlobalRaw(): Record<string, unknown> {
  const file = telemetryConfigPath()
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

// 更新全局 telemetry 段：只合并传入字段，保留其它段与未知字段
export function updateTelemetryConfig(patch: Record<string, unknown>): void {
  const raw = readGlobalRaw()
  const current = isPlainObject(raw.telemetry) ? { ...raw.telemetry } : {}
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(current[key])) {
      current[key] = { ...(current[key] as Record<string, unknown>), ...value }
    } else {
      current[key] = value
    }
  }
  raw.telemetry = current
  writeFileAtomic(telemetryConfigPath(), `${JSON.stringify(raw, null, 2)}\n`)
}

// 测试用：清空告警去重集合，使重新加载后的配置问题仍能提示
export function resetTelemetryConfigWarnings(): void {
  warnedMisplacedLayers.clear()
  warnedInvalidKeys.clear()
}
