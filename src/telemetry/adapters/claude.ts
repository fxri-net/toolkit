// Claude Code 适配器：全局 Hook 配置位于 ~/.claude/settings.json，可用 CLAUDE_CONFIG_DIR 改写
import { existsSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { getHomeDir } from "../../config"
import { installStandardHooks, parseStandardEvent, standardHookStatus, uninstallStandardHooks } from "./standard"
import type { AgentAdapter, HookInstallResult, HookStatus } from "./types"

// 配置目录：CLAUDE_CONFIG_DIR 可为绝对路径或相对 home 的目录名
function claudeConfigDir(): string {
  const env = process.env.CLAUDE_CONFIG_DIR
  if (env) return isAbsolute(env) ? env : join(getHomeDir(), env)
  return join(getHomeDir(), ".claude")
}

// Claude 的 Hook 配置在 settings.json 内，与其它设置共存
function claudeSettingsFile(): string {
  return join(claudeConfigDir(), "settings.json")
}

// Claude Code 适配器
export const claudeAdapter: AgentAdapter = {
  id: "claude",
  displayName: "Claude Code",
  capabilities: ["sessionId", "toolName", "toolInput", "triggerPrompt", "outcome"],
  configPath: claudeSettingsFile,
  detect(): boolean {
    return existsSync(claudeConfigDir())
  },
  installHooks(options: { command: string; dryRun?: boolean }): HookInstallResult {
    return installStandardHooks(claudeSettingsFile(), this.id, options.command, options.dryRun)
  },
  uninstallHooks(): HookInstallResult {
    return uninstallStandardHooks(claudeSettingsFile(), this.id)
  },
  status(): HookStatus {
    return standardHookStatus(claudeSettingsFile(), this.id, this.displayName)
  },
  parseHookEvent(raw: unknown) {
    return parseStandardEvent(this.id, "claude-hooks", raw)
  },
}
