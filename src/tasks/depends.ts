// depends_on 解析单一实现：validate 与 query 复用，避免双实现漂移
// 兼容：数组、JSON 双引号数组、手写单/双引号列表、无引号逗号分隔、空值

export function parseDepends(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string")
  if (typeof value !== "string") return []
  const t = value.trim()
  if (!t || t === "[]") return []
  // JSON 双引号数组（含空数组已在上方处理）
  try {
    const parsed = JSON.parse(t)
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
  } catch {
    // 非严格 JSON，继续走手写格式兜底
  }
  // 带引号列表（单/双引号均可）
  const quoted = [...t.matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map((m) => m[1] ?? m[2])
    .filter((x): x is string => Boolean(x))
  if (quoted.length > 0) return quoted
  // 无引号中括号列表（[a, b]）
  const inner = t.match(/^\[(.*)\]$/)?.[1]
  if (inner != null) {
    return inner
      .split(/[,，]/)
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean)
  }
  return []
}
