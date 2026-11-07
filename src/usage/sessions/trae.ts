// Trae 反查：Trae 的会话正文不落可读文件（IDE 内部存储），本地只有 memory 摘要与配置
// 因此不提供字段反查：返回 null，由调用方写基础事件；后续 Trae 开放会话记录时在此接入
import type { SessionLookup } from "./types"

// 反查 Trae 会话：当前无可读会话记录，恒返回 null（不影响基础计数）
export function lookupTraeSession(): SessionLookup | null {
  return null
}
