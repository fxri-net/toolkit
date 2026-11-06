// 标准 Hook 配置读写：Trae / Claude 共用同一份 hooks.json 结构，差异只在配置路径
import { copyFileSync, existsSync, readFileSync } from "node:fs"
import { writeFileAtomic } from "../../write-atomic"
import type { NormalizedHookEvent } from "../types"
import type { HookInstallResult, HookStatus } from "./types"

// Hook 配置对象：版本 1，事件名映射到 Hook 组列表
interface HookConfig {
  version?: number
  hooks?: Record<string, unknown>
  [key: string]: unknown
}

// 判普通对象
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 读取配置：不存在返回空对象；JSON 非法直接抛错，避免覆盖用户配置
export function readHookConfig(file: string): HookConfig {
  if (!existsSync(file)) return { version: 1, hooks: {} }
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
  if (!isPlainObject(parsed)) throw new Error(`Hook 配置顶层须为对象：${file}`)
  return parsed as HookConfig
}

// 写前备份：只备份已存在的文件，备份名带时间戳
function backup(file: string): void {
  if (!existsSync(file)) return
  copyFileSync(file, `${file}.toolkit-backup-${Date.now()}`)
}

// 判断配置中是否已有本包 ingest 命令
export function hasIngestCommand(config: HookConfig, agent: string): boolean {
  const needle = `telemetry ingest --agent ${agent}`
  for (const groups of Object.values(config.hooks ?? {})) {
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      if (!isPlainObject(group) || !Array.isArray(group.hooks)) continue
      for (const hook of group.hooks) {
        if (isPlainObject(hook) && typeof hook.command === "string" && hook.command.includes(needle)) return true
      }
    }
  }
  return false
}

// 取第一条本包命令：状态展示用
export function findIngestCommand(config: HookConfig, agent: string): string | undefined {
  const needle = `telemetry ingest --agent ${agent}`
  for (const groups of Object.values(config.hooks ?? {})) {
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      if (!isPlainObject(group) || !Array.isArray(group.hooks)) continue
      for (const hook of group.hooks) {
        if (isPlainObject(hook) && typeof hook.command === "string" && hook.command.includes(needle)) return hook.command
      }
    }
  }
  return undefined
}

// 安装标准 Hook：PostToolUse 与 UserPromptSubmit 各一组，已存在则幂等跳过
export function installStandardHooks(file: string, agent: string, command: string, dryRun = false): HookInstallResult {
  const config = readHookConfig(file)
  if (hasIngestCommand(config, agent)) {
    return { agent, file, changed: false, command, dryRun }
  }
  config.version = 1
  const hooks = isPlainObject(config.hooks) ? config.hooks : {}
  config.hooks = hooks
  const append = (event: string, matcher: string | undefined) => {
    const groups = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : []
    const group: Record<string, unknown> = {
      hooks: [{ type: "command", command, timeout: 10 }],
    }
    if (matcher !== undefined) group.matcher = matcher
    groups.push(group)
    hooks[event] = groups
  }
  append("PostToolUse", "*")
  append("UserPromptSubmit", undefined)
  if (!dryRun) {
    backup(file)
    writeFileAtomic(file, `${JSON.stringify(config, null, 2)}\n`)
  }
  return { agent, file, changed: true, command, dryRun }
}

// 卸载标准 Hook：只移除包含本包 ingest 命令的 Hook 定义与空组
export function uninstallStandardHooks(file: string, agent: string): HookInstallResult {
  const config = readHookConfig(file)
  const needle = `telemetry ingest --agent ${agent}`
  let changed = false
  const hooks = isPlainObject(config.hooks) ? config.hooks : {}
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue
    const nextGroups: unknown[] = []
    for (const group of groups) {
      if (!isPlainObject(group) || !Array.isArray(group.hooks)) {
        nextGroups.push(group)
        continue
      }
      const remaining = group.hooks.filter((hook) => {
        const matched = isPlainObject(hook) && typeof hook.command === "string" && hook.command.includes(needle)
        if (matched) changed = true
        return !matched
      })
      if (remaining.length === group.hooks.length) {
        nextGroups.push(group)
      } else if (remaining.length > 0) {
        nextGroups.push({ ...group, hooks: remaining })
      }
    }
    if (nextGroups.length === 0) delete hooks[event]
    else hooks[event] = nextGroups
  }
  config.hooks = hooks
  if (changed) {
    backup(file)
    writeFileAtomic(file, `${JSON.stringify(config, null, 2)}\n`)
  }
  return { agent, file, changed, command: "", dryRun: false }
}

// 标准 Hook 状态：只看配置中是否存在本包命令
export function standardHookStatus(file: string, agent: string, displayName: string): HookStatus {
  try {
    const config = readHookConfig(file)
    const command = findIngestCommand(config, agent)
    return { agent, displayName, file, installed: Boolean(command), command }
  } catch (error) {
    return { agent, displayName, file, installed: false, lastError: (error as Error).message }
  }
}

// 字符串字段：非字符串或空串返回 undefined
function readString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined
}

// 标准事件解析：Trae / Claude 的 stdin 字段口径一致
export function parseStandardEvent(agent: string, adapterId: string, raw: unknown): NormalizedHookEvent | null {
  if (!isPlainObject(raw)) return null
  const sessionId = readString(raw.session_id) ?? readString(process.env.ICUBE_CODEMAIN_SESSION)
  if (!sessionId) return null
  const eventName = readString(raw.hook_event_name)
  const project = Array.isArray(raw.workspace_roots)
    ? readString(raw.workspace_roots[0])
    : readString(raw.cwd)
  if (eventName === "UserPromptSubmit") {
    const prompt = readString(raw.prompt)
    if (!prompt) return null
    return { agent, sessionId, prompt, project, originAdapter: adapterId, occurredAt: new Date() }
  }
  if (eventName === "PostToolUse" || (eventName === undefined && raw.tool_name !== undefined)) {
    return {
      agent,
      sessionId,
      toolUseId: readString(raw.tool_use_id),
      toolName: readString(raw.llm_tool_name) ?? readString(raw.tool_name),
      toolInput: raw.tool_input,
      toolResponse: raw.tool_response,
      project,
      originAdapter: adapterId,
      occurredAt: new Date(),
    }
  }
  return null
}
