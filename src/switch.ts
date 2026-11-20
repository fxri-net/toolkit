// 开关解析：统一处理 CLI / 环境变量 / 配置文件三档，双向可开可关，默认值兜底
// 供隐私脱敏（redact）与软告警（warn）等布尔开关复用，避免各域重复实现

// 环境变量旧名 → 新名：兼容读取至下个 major，旧名生效时告警一次
export const LEGACY_ENV_ALIASES: Readonly<Record<string, readonly string[]>> = {
  FX_TOOLKIT_REDACT: ["FX_REDACT"],
  FX_TOOLKIT_NO_UPDATE_CHECK: ["FX_NO_UPDATE_CHECK"],
  FX_TOOLKIT_CHECK_WARN: ["FX_CHECK_WARN"],
  FX_TOOLKIT_DEBUG_UPDATE_CHECK: ["FX_DEBUG_UPDATE_CHECK"],
  FX_TOOLKIT_USAGE_DIR: ["TOOLKIT_USAGE_DIR"],
  FX_TOOLKIT_USAGE_AGENT: ["TOOLKIT_USAGE_AGENT"],
  FX_TOOLKIT_USAGE_NO_WORKER: ["TOOLKIT_USAGE_NO_WORKER"],
  FX_TOOLKIT_USAGE_SESSION: ["TOOLKIT_USAGE_SESSION"],
}

// 已告警过的旧名：同一进程内每个旧名只提示一次
const warnedLegacyEnv = new Set<string>()

// 读取环境变量：新名优先；新名未设置且旧名非空时用旧值并告警一次
export function readEnvWithLegacy(current: string, legacy: readonly string[] = LEGACY_ENV_ALIASES[current] ?? []): string | undefined {
  const value = process.env[current]
  if (value !== undefined && value !== "") return value
  for (const name of legacy) {
    const legacyValue = process.env[name]
    if (legacyValue === undefined || legacyValue === "") continue
    if (!warnedLegacyEnv.has(name)) {
      warnedLegacyEnv.add(name)
      console.error(`⚠️ 环境变量 ${name} 已更名为 ${current}，旧名将在下个 major 移除`)
    }
    return legacyValue
  }
  return undefined
}

// 宽松布尔解析：接受 1/true/on/yes → true，0/false/off/no → false，其余按默认值兜底
export function parseBool(value: string, fallback: boolean): boolean {
  const v = value.trim().toLowerCase()
  if (["1", "true", "on", "yes"].includes(v)) return true
  if (["0", "false", "off", "no"].includes(v)) return false
  return fallback
}

// 三档开关解析，优先级从高到低：CLI 显式值 > 环境变量 > 配置文件 > 默认值
// cli 传 undefined 表示本次命令未显式指定该开关（区别于显式 true/false）
export function resolveEnabled(
  cli: boolean | undefined,
  envKey: string,
  config: boolean | undefined,
  fallback: boolean,
): boolean {
  if (cli !== undefined) return cli
  const env = readEnvWithLegacy(envKey)
  if (env !== undefined) return parseBool(env, fallback)
  if (config !== undefined) return config
  return fallback
}
