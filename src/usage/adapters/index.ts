// 适配器注册表：新增 Agent 只在此登记，CLI 与向导按 id 取用
import { claudeAdapter } from "./claude"
import { codexAdapter } from "./codex"
import { copilotAdapter } from "./copilot"
import { cursorAdapter } from "./cursor"
import { dshAdapter } from "./dsh"
import { traeAdapter } from "./trae"
import type { AgentAdapter } from "./types"

// 全部适配器：顺序即 docs/usage/agents.md 的矩阵顺序（Trae、DeepSeek Harness 优先）
export const AGENT_ADAPTERS: AgentAdapter[] = [traeAdapter, dshAdapter, claudeAdapter, cursorAdapter, codexAdapter, copilotAdapter]

// 按 id 取适配器：未知 id 返回 undefined
export function getAdapter(id: string): AgentAdapter | undefined {
  return AGENT_ADAPTERS.find((adapter) => adapter.id === id)
}

// 本机是否检测到该 Agent：探测抛错按未安装处理，避免一个适配器阻断全部命令
export function isAdapterAvailable(adapter: AgentAdapter): boolean {
  try {
    return adapter.detect()
  } catch {
    return false
  }
}

// 本机检测到的适配器：初始化向导只列已存在的 Agent
export function detectedAdapters(): AgentAdapter[] {
  return AGENT_ADAPTERS.filter(isAdapterAvailable)
}

// Agent 选择解析结果：invalid 为未知 id，unavailable 为已知但本机未安装
export interface ResolvedAdapters {
  adapters: AgentAdapter[]
  invalid: string[]
  unavailable: string[]
}

// 解析选项：cleanup 用于卸载 / 清理场景，允许处理本机已卸载的 Agent 留下的配置
export interface ResolveOptions {
  allowUnavailable?: boolean
}

// 解析 Agent 选择：未传时取全部已检测；显式传入时同样要求本机已安装，不凭空创建配置
// 清理场景（allowUnavailable）放开该限制，否则工具卸载后残留的 Hook 无从清除
export function resolveAdapters(ids: string[] | undefined, options: ResolveOptions = {}): ResolvedAdapters {
  if (!ids || ids.length === 0) {
    const adapters = options.allowUnavailable ? [...AGENT_ADAPTERS] : detectedAdapters()
    return { adapters, invalid: [], unavailable: [] }
  }
  const adapters: AgentAdapter[] = []
  const invalid: string[] = []
  const unavailable: string[] = []
  for (const id of ids) {
    const adapter = getAdapter(id)
    if (!adapter) {
      invalid.push(id)
      continue
    }
    if (!isAdapterAvailable(adapter) && !options.allowUnavailable) {
      unavailable.push(id)
      continue
    }
    if (!adapters.includes(adapter)) adapters.push(adapter)
  }
  return { adapters, invalid, unavailable }
}
