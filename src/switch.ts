// 开关解析：统一处理 CLI / 环境变量 / 配置文件三档，双向可开可关，默认值兜底
// 供隐私脱敏（redact）与软告警（warn）等布尔开关复用，避免各域重复实现

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
  const env = process.env[envKey]
  if (env !== undefined && env !== "") return parseBool(env, fallback)
  if (config !== undefined) return config
  return fallback
}
