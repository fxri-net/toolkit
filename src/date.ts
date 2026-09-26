// 本地日期与常见日期串解析：统一日期口径，避免各域重复实现产生格式漂移
// 口径说明：均按运行环境本地时区取当天，避免 UTC 边界跨日；解析支持非补零月日写法

const pad2 = (n: number) => String(n).padStart(2, "0")

// 解析常见日期写法（YYYYMMDD / YYYY-MM-DD / YYYY-M-D / 斜杠分隔，允许后带时间），返回补零后的年月日
function parseYmd(value: string): { y: string; m: string; d: string } | null {
  const m = value.trim().match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})/)
  if (!m) return null
  const [, y, mo, d] = m
  if (!y || !mo || !d) return null
  return { y, m: pad2(+mo), d: pad2(+d) }
}

// 任意常见日期串 → YYYY-MM-DD（解析失败返回空串，供展示/比较）
export function toYmd(value: string): string {
  const p = parseYmd(value)
  return p ? `${p.y}-${p.m}-${p.d}` : ""
}

// 任意常见日期串 → YYYYMMDD（用于任务文件名/归档日期；解析失败原样去分隔符）
export function toYmdCompact(value: string): string {
  const p = parseYmd(value)
  return p ? `${p.y}${p.m}${p.d}` : value.trim().replace(/[-/]/g, "")
}

// 本地当天日期 YYYY-MM-DD
export function todayDash(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

// 本地当天日期 YYYYMMDD
export function todayCompact(): string {
  const now = new Date()
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
}

// 未来时间检测的跨时区容差：取全球最大正偏移 UTC+14
// 墙上时间串不含时区，按运行环境时区解析后与当前时刻比对会随环境漂移：本地（UTC+8）写入的时间在 UTC 运行环境下被整体前移 8 小时而落进「未来」，产生误报
// 留 14 小时容差后 UTC 环境不再误报，错填日期（超前 14 小时以上）仍被捕获
// 本源仓库门禁已在数据原地时区（Asia/Shanghai）判定真实任务数据（详见 scripts/verify.mjs），本容差只作使用方业务侧的兜底补充
export const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000

// 容差的小时数（= MAX_UTC_OFFSET_MS / 3600000），供告警文案引用，避免该阈值以魔数形式散落各处
export const MAX_UTC_OFFSET_HOURS = MAX_UTC_OFFSET_MS / 3_600_000

// 完成时间是否超出跨时区容差的未来（值须为 YYYY-MM-DD HH:mm 墙上时间；now 可注入便于测试与边界校验）
// 隐式契约：value 不可解析时 getTime() 得 NaN，而 `NaN > x` 恒为 false，即静默判为「非未来」——
// 调用方须先做格式校验（completed 格式 / 归一化可识别）再调用，否则垃圾串会静默漏过
export function isBeyondTzFuture(value: string, now: number = Date.now()): boolean {
  return new Date(value.replace(" ", "T")).getTime() > now + MAX_UTC_OFFSET_MS
}
