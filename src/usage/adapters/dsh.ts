// DeepSeek Harness（dsh）适配器：Hook 文件为 ~/.dsh/hooks.json，
// 由官方桥接插件 @deepseek-ai/dsh-hooks-claude-code 在 profile 的 cordis.patch.yml 中注册后生效
import { existsSync } from "node:fs"
import { join } from "node:path"
import {
  DSH_BRIDGE_PLUGIN,
  dshHome,
  dshHooksFile,
  listDshProfiles,
  profileBridgePlugin,
  profileHasBridgePlugin,
  profileHasToolkitBlock,
  profileName,
  profilePatchIsArray,
  removeToolkitBlockFromProfile,
  writeToolkitBlock,
} from "../dsh-profile"
import { installStandardHooks, parseStandardEvent, standardHookStatus, uninstallStandardHooks } from "./standard"
import type { AgentAdapter, HookInstallResult, HookStatus } from "./types"

// 插件安装提示：桌面版插件页只收声明 dsh.bundle 的组合包，本桥接插件必须经 CLI 装进 profile
function pluginHint(profile: string): string {
  const name = profileName(profile)
  return `profile ${name} 未安装桥接插件：先完全退出桌面版（含托盘），执行 dsh plugin --profile ${name} add ${DSH_BRIDGE_PLUGIN}；官方 @deepseek-ai/dsh-hooks-claude-code 目前与 dsh 0.2.x 不兼容，桌面版「添加插件」也只收声明 dsh.bundle 的组合包`
}

// DeepSeek Harness 适配器：事件按 Claude Code 方言解析
export const dshAdapter: AgentAdapter = {
  id: "dsh",
  displayName: "DeepSeek Harness",
  capabilities: ["sessionId", "toolName", "toolInput", "triggerPrompt", "outcome"],
  configPath: dshHooksFile,
  detect(): boolean {
    return existsSync(dshHome())
  },
  installHooks(options: { command: string; dryRun?: boolean }): HookInstallResult {
    const hooks = installStandardHooks(dshHooksFile(), this.id, options.command, options.dryRun)
    const warnings: string[] = []
    const profiles = listDshProfiles()
    if (profiles.length === 0) {
      warnings.push(`未找到 dsh profile（${join(dshHome(), "profiles")}）：Hook 文件已写入，但桥接插件无处注册`)
    }
    let changed = hooks.changed
    for (const profile of profiles) {
      if (!profilePatchIsArray(profile)) {
        warnings.push(`profile ${profileName(profile)} 的 cordis.patch.yml 不是顶层数组，已跳过写入（请手工把 ${DSH_BRIDGE_PLUGIN} 条目并入数组）`)
        continue
      }
      // 已装的桥接包优先：官方版恢复兼容后无需改配置就能切回
      const plugin = profileBridgePlugin(profile) ?? DSH_BRIDGE_PLUGIN
      if (writeToolkitBlock(profile, dshHooksFile(), options.dryRun, plugin)) changed = true
      if (!profileHasBridgePlugin(profile)) warnings.push(pluginHint(profile))
    }
    return { ...hooks, changed, warnings }
  },
  uninstallHooks(): HookInstallResult {
    const hooks = uninstallStandardHooks(dshHooksFile(), this.id)
    let changed = hooks.changed
    for (const profile of listDshProfiles()) {
      if (removeToolkitBlockFromProfile(profile)) changed = true
    }
    return { ...hooks, changed }
  },
  status(): HookStatus {
    const status = standardHookStatus(dshHooksFile(), this.id, this.displayName)
    const warnings: string[] = []
    const profiles = listDshProfiles()
    if (profiles.length === 0) {
      warnings.push(`未找到 dsh profile（${join(dshHome(), "profiles")}）`)
    }
    for (const profile of profiles) {
      if (!profilePatchIsArray(profile)) {
        warnings.push(`profile ${profileName(profile)} 的 cordis.patch.yml 不是顶层数组，未写入桥接条目`)
        continue
      }
      if (!profileHasToolkitBlock(profile)) warnings.push(`profile ${profileName(profile)} 未写入桥接条目，请重跑 toolkit usage hooks install --agent ${this.id}`)
      else if (!profileHasBridgePlugin(profile)) warnings.push(pluginHint(profile))
    }
    return { ...status, warnings }
  },
  parseHookEvent(raw: unknown) {
    return parseStandardEvent(this.id, "dsh-hooks", raw)
  },
}
