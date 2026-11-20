// 旧环境变量名提示：旧名不再读取，命中时只在 stderr 提示一次，避免升级后取值被静默丢弃（C-26 / C-45）
export interface LegacyEnvName {
  // 已废弃的旧名
  legacy: string
  // 当前使用的 FX_TOOLKIT_ 新名
  current: string
}

// 旧名 → 新名对照：名称统一前发布过的两代产品前缀
export const LEGACY_ENV_NAMES: readonly LegacyEnvName[] = [
  { legacy: "FX_REDACT", current: "FX_TOOLKIT_REDACT" },
  { legacy: "FX_CHECK_WARN", current: "FX_TOOLKIT_CHECK_WARN" },
  { legacy: "FX_NO_UPDATE_CHECK", current: "FX_TOOLKIT_NO_UPDATE_CHECK" },
  { legacy: "FX_DEBUG_UPDATE_CHECK", current: "FX_TOOLKIT_DEBUG_UPDATE_CHECK" },
  { legacy: "TOOLKIT_TELEMETRY_DIR", current: "FX_TOOLKIT_USAGE_DIR" },
  { legacy: "TOOLKIT_USAGE_DIR", current: "FX_TOOLKIT_USAGE_DIR" },
  { legacy: "TOOLKIT_USAGE_AGENT", current: "FX_TOOLKIT_USAGE_AGENT" },
  { legacy: "TOOLKIT_USAGE_NO_WORKER", current: "FX_TOOLKIT_USAGE_NO_WORKER" },
  { legacy: "TOOLKIT_USAGE_SESSION", current: "FX_TOOLKIT_USAGE_SESSION" },
]

// 已提示过的旧名：同进程内多条入口只提示一次，避免刷屏
const warned = new Set<string>()

// 旧名命中提示：仅在旧名有值且新名为空时告警——两者同时设置说明用户已迁移，不算降级
// 返回本次命中的旧名供测试断言；不读取旧值、不影响任何生效逻辑
export function warnLegacyEnvOnce(env: NodeJS.ProcessEnv = process.env): string[] {
  const hits: string[] = []
  for (const { legacy, current } of LEGACY_ENV_NAMES) {
    const legacyValue = env[legacy]
    if (legacyValue === undefined || legacyValue === "") continue
    const currentValue = env[current]
    if (currentValue !== undefined && currentValue !== "") continue
    if (!warned.has(legacy)) {
      warned.add(legacy)
      console.warn(`⚠️ 已忽略旧环境变量「${legacy}」：请改用「${current}」，旧名自本版本起不再读取`)
    }
    hits.push(legacy)
  }
  return hits
}

// 测试用：清空提示记录，避免用例之间互相影响
export function resetLegacyEnvWarnings(): void {
  warned.clear()
}
