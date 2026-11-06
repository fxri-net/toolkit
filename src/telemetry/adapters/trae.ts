// Trae 适配器：全局 Hook 配置位于 ~/.trae-cn/hooks.json（不存在时回退 ~/.trae/hooks.json）
import { existsSync } from "node:fs"
import { join } from "node:path"
import { getHomeDir } from "../../config"
import { installStandardHooks, parseStandardEvent, standardHookStatus, uninstallStandardHooks } from "./standard"
import type { AgentAdapter, HookInstallResult, HookStatus } from "./types"

// 全局配置路径：优先 .trae-cn，旧版目录回退 .trae
function traeHooksFile(): string {
  const home = getHomeDir()
  const dir = existsSync(join(home, ".trae-cn")) ? ".trae-cn" : ".trae"
  return join(home, dir, "hooks.json")
}

// Trae 适配器：配置结构与 Claude 一致，直接复用标准读写
export const traeAdapter: AgentAdapter = {
  id: "trae",
  displayName: "Trae",
  capabilities: ["sessionId", "toolName", "toolInput", "triggerPrompt", "outcome"],
  configPath: traeHooksFile,
  detect(): boolean {
    const home = getHomeDir()
    return existsSync(join(home, ".trae-cn")) || existsSync(join(home, ".trae"))
  },
  installHooks(options: { command: string; dryRun?: boolean }): HookInstallResult {
    return installStandardHooks(traeHooksFile(), this.id, options.command, options.dryRun)
  },
  uninstallHooks(): HookInstallResult {
    return uninstallStandardHooks(traeHooksFile(), this.id)
  },
  status(): HookStatus {
    return standardHookStatus(traeHooksFile(), this.id, this.displayName)
  },
  parseHookEvent(raw: unknown) {
    return parseStandardEvent(this.id, "trae-hooks", raw)
  },
}
