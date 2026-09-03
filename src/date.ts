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

// 任意常见日期串 → YYYYMMDD（用于任务文件名/归档日期；解析失败原样去分隔符，兼容历史 toYmdRaw 语义）
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
