// depends_on 解析单一实现：validate 与 query 复用，避免双实现漂移
// 兼容：数组、JSON 双引号数组、手写单/双引号列表、无引号逗号分隔、裸标量、空值

// 列表元素清洗：去首尾空白与引号（裸列表与中括号列表共用）
function cleanSegment(s: string): string {
  return s.trim().replace(/^['"]|['"]$/g, "")
}

// 逗号（半角/全角）列表拆分并清洗（裸列表与中括号内共用）
// 顿号不作分隔符：与 scope「只提示不转换」口径一致，避免把含顿号的依赖名误拆
function splitList(text: string): string[] {
  return text.split(/[,，]/).map(cleanSegment).filter(Boolean)
}

export function parseDepends(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string")
  if (typeof value !== "string") return []
  const t = value.trim()
  if (!t || t === "[]") return []
  // JSON 形态：数组直通；字符串交下方引号分支兜底；对象/数字/布尔等非列表形态无法当作依赖列表，告警后判为空
  try {
    const parsed = JSON.parse(t)
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    if (typeof parsed !== "string") {
      console.warn(`⚠️ depends_on「${t}」不是列表形态，已忽略`)
      return []
    }
  } catch {
    // 非严格 JSON，继续走手写格式兜底
  }
  // 带引号列表（单/双引号均可）
  const quoted = [...t.matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map((m) => m[1] ?? m[2])
    .filter((x): x is string => Boolean(x))
  if (quoted.length > 0) return quoted
  // 中括号列表：正常形态取括号内内容；括号残缺（只出现单侧）告警后剥掉残留括号，避免静默丢弃依赖
  if (t.startsWith("[") || t.endsWith("]")) {
    const inner = t.match(/^\[(.*)\]$/)?.[1]
    if (inner == null) console.warn(`⚠️ depends_on「${t}」中括号不完整，已按裸列表解析`)
    return splitList((inner ?? t).replace(/^\[/, "").replace(/\]$/, ""))
  }
  // 裸标量（a）与裸逗号列表（a, b）：按列表解析，单值即单元素
  return splitList(t)
}
