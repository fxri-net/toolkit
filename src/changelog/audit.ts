// 变更集净变更审计：找出同一对象上同时出现新增与修改 / 修复 / 优化的条目，只提示不自动改
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// 参与净变更合并的类型：文档、清理、依赖与重大变更不参与
const NET_TYPES = ["新增", "修改", "修复", "优化"] as const

// 英文前缀归一为中文类型
const TYPE_ALIASES: Record<string, string> = {
  Added: "新增",
  Changed: "修改",
  Fixed: "修复",
  Improved: "优化",
  Docs: "文档",
  Removed: "清理",
  Breaking: "重大",
}

// 单条变更集条目
export interface AuditEntry {
  file: string
  type: string
  text: string
}

// 同一对象的候选条目
export interface AuditCandidate {
  object: string
  entries: AuditEntry[]
}

// 渲染审计输出：CLI 与单测共用同一份格式，避免输出文案漂移
export function formatAuditReport(candidates: AuditCandidate[]): string {
  if (candidates.length === 0) return "未发现需要合并的候选"
  const lines = [`发现 ${candidates.length} 组候选（只提示，不自动改写）：`]
  for (const candidate of candidates) {
    lines.push(`- ${candidate.object}`)
    for (const entry of candidate.entries) {
      lines.push(`  ${entry.file}｜${entry.type}：${entry.text}`)
    }
  }
  return lines.join("\n")
}

// 自然语言片段的最低长度：低于该长度的常见词不作为对象，避免「配置」「问题」类误报
const NATURAL_MIN_LENGTH = 5

// 高频泛词：整段命中时跳过，不单独作为对象
const STOPWORDS = new Set([
  "当前默认",
  "默认配置",
  "支持通过",
  "可以通过",
  "需要使用",
  "同时支持",
  "相关配置",
  "命令参数",
  "工具使用",
  "问题修复",
  "功能调整",
  "优化改进",
])

// 从条目文本提取显式对象：反引号内容、fxri-* 技能名、toolkit 命令与 --flag
function extractObjects(text: string): string[] {
  const objects = new Set<string>()
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    if (match[1]) objects.add(match[1].trim())
  }
  for (const match of text.matchAll(/\bfxri-[a-z0-9-]+\b/gi)) {
    objects.add(match[0])
  }
  for (const match of text.matchAll(/\btoolkit\s+([a-z][a-z0-9-]*)/gi)) {
    if (match[1]) objects.add(`toolkit ${match[1]}`)
  }
  for (const match of text.matchAll(/(?<!\w)(--[a-z][a-z0-9-]+)/gi)) {
    if (match[1]) objects.add(match[1])
  }
  return [...objects]
}

// 提取自然语言短语：中文按 5–10 字滑窗，英文按 5 字符以上单词，纯自然语言也能参与比对
function extractNaturalTokens(text: string): string[] {
  const tokens = new Set<string>()
  const normalized = text
    .replace(/`[^`]*`/g, " ")
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]+/g, " ")
  for (const run of normalized.match(/[\u4e00-\u9fa5]{5,}/g) ?? []) {
    for (let size = NATURAL_MIN_LENGTH; size <= Math.min(10, run.length); size += 1) {
      for (let start = 0; start + size <= run.length; start += 1) {
        const token = run.slice(start, start + size)
        if (!STOPWORDS.has(token)) tokens.add(token)
      }
    }
  }
  for (const word of normalized.match(/[A-Za-z][A-Za-z0-9_-]{4,}/g) ?? []) {
    if (!STOPWORDS.has(word.toLowerCase())) tokens.add(word)
  }
  return [...tokens]
}

// 解析一行条目：返回类型与描述；不是条目返回 null
function parseEntry(line: string): { type: string; text: string } | null {
  const matched = /^\s*-\s*([^：:\s]+)[：:]\s*(.+)$/.exec(line)
  if (!matched) return null
  const rawType = (matched[1] ?? "").trim()
  const type = TYPE_ALIASES[rawType] ?? rawType
  return { type, text: (matched[2] ?? "").trim() }
}

// 扫描变更集目录：按对象聚合，返回可能需要在发布前合并的候选
export function auditChangesets(dir = ".changeset"): AuditCandidate[] {
  if (!existsSync(dir)) return []
  const entries: AuditEntry[] = []
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".md") || name === "README.md") continue
    const content = readFileSync(join(dir, name), "utf8")
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEntry(line)
      if (!parsed) continue
      entries.push({ file: name, type: parsed.type, text: parsed.text })
    }
  }

  const byObject = new Map<string, AuditEntry[]>()
  for (const entry of entries) {
    for (const object of extractObjects(entry.text)) {
      const list = byObject.get(object) ?? []
      list.push(entry)
      byObject.set(object, list)
    }
  }

  const candidates: AuditCandidate[] = []
  const seen = new Set<string>()
  const sameEntry = (a: AuditEntry, b: AuditEntry) => a.file === b.file && a.type === b.type && a.text === b.text
  const addCandidate = (label: string, list: AuditEntry[]) => {
    const unique = [...new Map(list.map((entry) => [`${entry.file}\u0000${entry.type}\u0000${entry.text}`, entry])).values()]
    const signature = unique
      .map((entry) => `${entry.file}\u0000${entry.type}\u0000${entry.text}`)
      .sort()
      .join("\u0001")
    if (seen.has(signature)) return
    // 已被既有候选完整覆盖的组不重复输出，避免显式对象与自然语言候选重复
    const covered = unique.every((entry) => candidates.some((candidate) => candidate.entries.some((item) => sameEntry(item, entry))))
    if (covered) return
    seen.add(signature)
    candidates.push({ object: label, entries: unique })
  }
  const hasMultipleNetTypes = (list: AuditEntry[]) => {
    const types = new Set(list.map((entry) => entry.type).filter((type) => (NET_TYPES as readonly string[]).includes(type)))
    return types.size >= 2
  }

  // 显式对象优先：反引号、fxri-*、toolkit 命令与 --flag
  for (const [object, list] of byObject.entries()) {
    if (hasMultipleNetTypes(list)) addCandidate(object, list)
  }

  // 自然语言兜底：同一短语片段出现在不同净变更类型时列为候选
  const byToken = new Map<string, AuditEntry[]>()
  for (const entry of entries) {
    for (const token of extractNaturalTokens(entry.text)) {
      const list = byToken.get(token) ?? []
      list.push(entry)
      byToken.set(token, list)
    }
  }
  const tokenGroups = [...byToken.entries()].sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0]))
  for (const [token, list] of tokenGroups) {
    if (hasMultipleNetTypes(list)) addCandidate(`自然语言相似：${token}`, list)
  }

  return candidates.sort((a, b) => a.object.localeCompare(b.object))
}
