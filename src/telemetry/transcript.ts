// transcript 补录：从 Claude / 通用 JSONL 中提取 tool_use 块，转为统一 Hook 事件
import type { NormalizedHookEvent } from "./types"

// 判普通对象
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 字符串字段
function readString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined
}

// 从消息内容取纯文本：兼容字符串与 content block 数组
function extractText(content: unknown): string | undefined {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return undefined
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === "string") parts.push(block)
    else if (isPlainObject(block) && block.type === "text" && typeof block.text === "string") parts.push(block.text)
  }
  return parts.length > 0 ? parts.join("\n") : undefined
}

// 从一行记录提取 tool_use 块：支持顶层、message.content、content 三种形态
function extractToolUses(record: Record<string, unknown>): Array<Record<string, unknown>> {
  if (record.type === "tool_use") return [record]
  const content = isPlainObject(record.message) ? record.message.content : record.content
  if (!Array.isArray(content)) return []
  return content.filter((block): block is Record<string, unknown> => isPlainObject(block) && block.type === "tool_use")
}

// 解析 transcript 文本：JSONL 或 JSON 数组；返回去重后的 Hook 事件
export function parseTranscript(content: string, options: { agent?: string; project?: string } = {}): NormalizedHookEvent[] {
  const records: unknown[] = []
  const text = content.trim()
  if (text.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (Array.isArray(parsed)) records.push(...parsed)
    } catch {
      return []
    }
  } else {
    for (const line of text.split(/\r?\n/)) {
      const item = line.trim()
      if (!item) continue
      try {
        records.push(JSON.parse(item))
      } catch {
        // 跳过无法解析的行
      }
    }
  }

  const events: NormalizedHookEvent[] = []
  const seen = new Set<string>()
  let sessionId = "transcript"
  let prompt: string | undefined
  let project = options.project
  for (const raw of records) {
    if (!isPlainObject(raw)) continue
    sessionId = readString(raw.sessionId) ?? readString(raw.session_id) ?? sessionId
    project = readString(raw.cwd) ?? readString(raw.project) ?? project
    const role = readString(raw.type) ?? readString(raw.role)
    if (role === "user") {
      const message = isPlainObject(raw.message) ? raw.message.content : raw.content
      prompt = extractText(message) ?? prompt
    }
    for (const block of extractToolUses(raw)) {
      const toolUseId = readString(block.id) ?? readString(block.tool_use_id)
      const toolName = readString(block.name) ?? readString(block.tool_name)
      if (!toolName) continue
      const key = `${sessionId}\u0000${toolUseId ?? ""}`
      if (toolUseId && seen.has(key)) continue
      if (toolUseId) seen.add(key)
      events.push({
        agent: options.agent ?? "claude",
        sessionId,
        toolUseId,
        toolName,
        toolInput: block.input ?? block.tool_input,
        project,
        prompt,
        originAdapter: "transcript",
        occurredAt: new Date(),
      })
    }
  }
  return events
}
