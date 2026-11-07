// 会话 JSONL 解析：兼容 Claude Code 与 dsh 的 tool_use / tool_result 结构
// 只提取技能名、触发词、参数、结果与耗时；无法识别的记录直接跳过，不抛错
import { extractSkillArgs, extractSkillName } from "../event"
import type { UsageOutcome } from "../types"
import type { SessionCall } from "./types"

// 判普通对象
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 取纯文本：兼容字符串与 content block 数组
function extractText(content: unknown): string | undefined {
  if (typeof content === "string") return content.trim() === "" ? undefined : content
  if (!Array.isArray(content)) return undefined
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === "string") parts.push(block)
    else if (isPlainObject(block) && block.type === "text" && typeof block.text === "string") parts.push(block.text)
  }
  return parts.length > 0 ? parts.join("\n") : undefined
}

// 从一条记录取出 tool_use / tool_result 块：支持顶层与 message.content 两种形态
function extractBlocks(record: Record<string, unknown>): Array<Record<string, unknown>> {
  if (record.type === "tool_use" || record.type === "tool_result") return [record]
  const content = isPlainObject(record.message) ? record.message.content : record.content
  if (!Array.isArray(content)) return []
  return content.filter((block): block is Record<string, unknown> => isPlainObject(block))
}

// 结果判定：is_error / success 字段优先，无法判断记 unknown
function toOutcome(block: Record<string, unknown>): UsageOutcome {
  if (block.is_error === true || block.success === false) return "failure"
  if (block.is_error === false || block.success === true) return "success"
  return "unknown"
}

// 解析会话文件：返回按出现顺序排列的技能调用
export function parseSessionJsonl(text: string): SessionCall[] {
  const calls: SessionCall[] = []
  // 待补结果的调用：tool_use_id → calls 下标
  const pending = new Map<string, number>()
  let prompt: string | undefined
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim()
    if (!raw) continue
    let record: unknown
    try {
      record = JSON.parse(raw)
    } catch {
      continue
    }
    if (!isPlainObject(record)) continue
    const role = typeof record.type === "string" ? record.type : typeof record.role === "string" ? record.role : ""
    const content = isPlainObject(record.message) ? record.message.content : record.content
    // 用户消息：纯文本才算触发词，只含 tool_result 的消息不覆盖
    if (role === "user") {
      const hasResult = Array.isArray(content) && content.some((block) => isPlainObject(block) && block.type === "tool_result")
      if (!hasResult) prompt = extractText(content) ?? prompt
    }
    const timestamp = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : Number.NaN
    for (const block of extractBlocks(record)) {
      if (block.type === "tool_use") {
        const name = typeof block.name === "string" ? block.name : undefined
        const skill = extractSkillName(name, block.input)
        if (!skill) continue
        const id = typeof block.id === "string" ? block.id : undefined
        const call: SessionCall = { skill }
        if (prompt) call.prompt = prompt
        const args = extractSkillArgs(block.input)
        if (args) call.args = args
        if (Number.isFinite(timestamp)) call.at = timestamp
        calls.push(call)
        if (id) pending.set(id, calls.length - 1)
      } else if (block.type === "tool_result") {
        const id = typeof block.tool_use_id === "string" ? block.tool_use_id : undefined
        const index = id ? pending.get(id) : undefined
        if (index === undefined) continue
        const target = calls[index]
        if (!target) continue
        target.outcome = toOutcome(block)
        const finished = Number.isFinite(timestamp) ? timestamp : undefined
        if (finished !== undefined && target.at !== undefined && finished >= target.at) target.durationMs = finished - target.at
      }
    }
  }
  return calls
}
