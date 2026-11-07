// Agent 适配器契约：安装 / 卸载 / 状态 / 事件解析四件事，新增 Agent 只实现本接口
import type { NormalizedHookEvent } from "../types"

// Hook 安装结果：changed 为 false 表示已存在，不重复写入
export interface HookInstallResult {
  agent: string
  file: string
  changed: boolean
  command: string
  dryRun: boolean
  // 安装完成但尚未生效的前置条件（如缺少桥接插件），由调用方打印
  warnings?: string[]
}

// Hook 状态：installed 只表示配置中存在本包命令，不代表采集已开启
export interface HookStatus {
  agent: string
  displayName: string
  file: string
  installed: boolean
  command?: string
  legacyCommand?: string
  outdatedCommand?: string
  missingPaths?: string[]
  warnings?: string[]
  lastError?: string
}

// Agent 适配器：detect 用于初始化时只列出本机存在的 Agent
export interface AgentAdapter {
  id: string
  displayName: string
  capabilities: Array<"sessionId" | "toolName" | "toolInput" | "triggerPrompt" | "outcome" | "duration">
  configPath(): string
  detect(): boolean
  installHooks(options: { command: string; dryRun?: boolean }): HookInstallResult
  uninstallHooks(): HookInstallResult
  status(): HookStatus
  parseHookEvent(raw: unknown): NormalizedHookEvent | null
}
