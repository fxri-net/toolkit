// 适配器注册表：新增 Agent 只在此登记，CLI 与向导按 id 取用
import { claudeAdapter } from "./claude"
import { codexAdapter } from "./codex"
import { copilotAdapter } from "./copilot"
import { cursorAdapter } from "./cursor"
import { traeAdapter } from "./trae"
import type { AgentAdapter } from "./types"

// 全部适配器：Trae / Claude 已验证，Cursor / Codex / Copilot 按标准 Hook 接入
export const AGENT_ADAPTERS: AgentAdapter[] = [traeAdapter, claudeAdapter, cursorAdapter, codexAdapter, copilotAdapter]

// 按 id 取适配器：未知 id 返回 undefined
export function getAdapter(id: string): AgentAdapter | undefined {
  return AGENT_ADAPTERS.find((adapter) => adapter.id === id)
}

// 本机检测到的适配器：初始化向导只列已存在的 Agent
export function detectedAdapters(): AgentAdapter[] {
  return AGENT_ADAPTERS.filter((adapter) => {
    try {
      return adapter.detect()
    } catch {
      return false
    }
  })
}

// 解析 Agent 选择：未传时取全部已检测；显式传入未知 id 时返回 invalid 名单
export function resolveAdapters(ids: string[] | undefined): { adapters: AgentAdapter[]; invalid: string[] } {
  if (!ids || ids.length === 0) return { adapters: detectedAdapters(), invalid: [] }
  const adapters: AgentAdapter[] = []
  const invalid: string[] = []
  for (const id of ids) {
    const adapter = getAdapter(id)
    if (adapter) adapters.push(adapter)
    else invalid.push(id)
  }
  return { adapters, invalid }
}
