// GitHub Copilot CLI 适配器：优先 COPILOT_HOME，缺省 ~/.copilot；矩阵标注需实测
import { existsSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { getHomeDir } from "../../config"
import { installStandardHooks, parseStandardEvent, standardHookStatus, uninstallStandardHooks } from "./standard"
import type { AgentAdapter, HookInstallResult, HookStatus } from "./types"

// Copilot 配置目录
function copilotHome(): string {
  const env = process.env.COPILOT_HOME
  if (env) return isAbsolute(env) ? env : join(getHomeDir(), env)
  return join(getHomeDir(), ".copilot")
}

// Copilot Hook 配置路径
function copilotHooksFile(): string {
  return join(copilotHome(), "hooks.json")
}

// GitHub Copilot CLI 适配器
export const copilotAdapter: AgentAdapter = {
  id: "copilot",
  displayName: "GitHub Copilot CLI",
  capabilities: ["sessionId", "toolName", "toolInput", "triggerPrompt", "outcome"],
  configPath: copilotHooksFile,
  detect(): boolean {
    return existsSync(copilotHome())
  },
  installHooks(options: { command: string; dryRun?: boolean }): HookInstallResult {
    return installStandardHooks(copilotHooksFile(), this.id, options.command, options.dryRun)
  },
  uninstallHooks(): HookInstallResult {
    return uninstallStandardHooks(copilotHooksFile(), this.id)
  },
  status(): HookStatus {
    return standardHookStatus(copilotHooksFile(), this.id, this.displayName)
  },
  parseHookEvent(raw: unknown) {
    return parseStandardEvent(this.id, "copilot-hooks", raw)
  },
}
