// 会话反查：把各 Agent 的会话记录归一为「技能调用」序列，仅用于补齐规则上报的明细字段
import type { UsageOutcome } from "../types"

// 单次技能调用：字段缺一不可用则留空，不伪造
export interface SessionCall {
  skill: string
  prompt?: string
  args?: string
  outcome?: UsageOutcome
  durationMs?: number
  at?: number
}

// 反查结果：calls 为空表示没匹配到，调用方回退为基础事件
export interface SessionLookup {
  agent: string
  file: string
  calls: SessionCall[]
}

// 反查函数签名：测试可注入替身
export type SessionLookupFn = (agent: string, sessionId: string, cwd?: string) => SessionLookup | null
