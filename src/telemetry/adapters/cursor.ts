// Cursor 适配器：全局 Hook 配置位于 ~/.cursor/hooks.json
import { existsSync } from "node:fs"
import { join } from "node:path"
import { getHomeDir } from "../../config"
import { installStandardHooks, parseStandardEvent, standardHookStatus, uninstallStandardHooks } from "./standard"
import type { AgentAdapter, HookInstallResult, HookStatus } from "./types"

// Cursor 配置路径
function cursorHooksFile(): string {
  return join(getHomeDir(), ".cursor", "hooks.json")
}

// Cursor 适配器：事件结构按标准 Hook 解析，字段兼容 snake_case / camelCase
export const cursorAdapter: AgentAdapter = {
  id: "cursor",
  displayName: "Cursor",
  capabilities: ["sessionId", "toolName", "toolInput", "triggerPrompt", "outcome"],
  configPath: cursorHooksFile,
  detect(): boolean {
    return existsSync(join(getHomeDir(), ".cursor"))
  },
  installHooks(options: { command: string; dryRun?: boolean }): HookInstallResult {
    return installStandardHooks(cursorHooksFile(), this.id, options.command, options.dryRun)
  },
  uninstallHooks(): HookInstallResult {
    return uninstallStandardHooks(cursorHooksFile(), this.id)
  },
  status(): HookStatus {
    return standardHookStatus(cursorHooksFile(), this.id, this.displayName)
  },
  parseHookEvent(raw: unknown) {
    return parseStandardEvent(this.id, "cursor-hooks", raw)
  },
}
