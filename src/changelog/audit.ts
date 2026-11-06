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
  for (const [object, list] of byObject.entries()) {
    const types = new Set(list.map((entry) => entry.type).filter((type) => (NET_TYPES as readonly string[]).includes(type)))
    if (types.size < 2) continue
    candidates.push({ object, entries: list })
  }
  return candidates.sort((a, b) => a.object.localeCompare(b.object))
}
