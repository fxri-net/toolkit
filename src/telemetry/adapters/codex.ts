// Codex CLI 适配器：优先 CODEX_HOME，缺省 ~/.codex；事件结构按标准 Hook 解析
import { existsSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { getHomeDir } from "../../config"
import { installStandardHooks, parseStandardEvent, standardHookStatus, uninstallStandardHooks } from "./standard"
import type { AgentAdapter, HookInstallResult, HookStatus } from "./types"

// Codex 配置目录
function codexHome(): string {
  const env = process.env.CODEX_HOME
  if (env) return isAbsolute(env) ? env : join(getHomeDir(), env)
  return join(getHomeDir(), ".codex")
}

// Codex Hook 配置路径
function codexHooksFile(): string {
  return join(codexHome(), "hooks.json")
}

// Codex 适配器：载荷含 transcript_path 时仍按工具事件解析，矩阵标注需实测
export const codexAdapter: AgentAdapter = {
  id: "codex",
  displayName: "Codex CLI",
  capabilities: ["sessionId", "toolName", "toolInput", "triggerPrompt", "outcome"],
  configPath: codexHooksFile,
  detect(): boolean {
    return existsSync(codexHome())
  },
  installHooks(options: { command: string; dryRun?: boolean }): HookInstallResult {
    return installStandardHooks(codexHooksFile(), this.id, options.command, options.dryRun)
  },
  uninstallHooks(): HookInstallResult {
    return uninstallStandardHooks(codexHooksFile(), this.id)
  },
  status(): HookStatus {
    return standardHookStatus(codexHooksFile(), this.id, this.displayName)
  },
  parseHookEvent(raw: unknown) {
    return parseStandardEvent(this.id, "codex-hooks", raw)
  },
}
