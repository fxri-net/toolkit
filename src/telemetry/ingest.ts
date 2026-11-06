// Hook 事件入口：解析 stdin、缓存触发词、构造事件并落盘；任何异常只记日志，不阻断 Agent
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { writeFileAtomic } from "../write-atomic"
import { getAdapter } from "./adapters"
import { loadTelemetryConfig, resolveTelemetryDir } from "./config"
import { buildEvent, extractSkillArgs, extractSkillName, resolveSkillMeta } from "./event"
import { shouldRecord } from "./filter"
import { appendEvent, ensureDir, telemetryPaths } from "./store"
import type { NormalizedHookEvent, TelemetryConfig, TelemetryOutcome } from "./types"

// 触发词缓存有效期：超过一天视为过期，避免读到陈旧会话
const PROMPT_CACHE_TTL_MS = 24 * 60 * 60 * 1000

// Hook 处理结果：CLI 只打印简要状态，不输出大段内容
export interface IngestResult {
  status: "disabled" | "cached" | "ignored" | "written" | "duplicate" | "filtered" | "error"
  skill?: string
  message?: string
}

// 生成 Hook 命令：使用当前 Node 与 CLI 绝对路径，避免依赖 PATH
export function buildHookCommand(agent: string, cliPath = process.argv[1], nodePath = process.execPath): string {
  return `"${nodePath}" "${cliPath}" telemetry ingest --agent ${agent}`
}

// 会话缓存文件：按 sessionId 哈希，避免路径中出现特殊字符
function promptCacheFile(paths: ReturnType<typeof telemetryPaths>, sessionId: string): string {
  const hash = createHash("sha256").update(sessionId).digest("hex").slice(0, 16)
  return join(paths.sessionsDir, `${hash}.json`)
}

// 写入触发词缓存：只缓存最近一次 prompt，供同会话后续 PostToolUse 使用
export function writePromptCache(paths: ReturnType<typeof telemetryPaths>, sessionId: string, prompt: string): void {
  ensureDir(paths.sessionsDir)
  writeFileAtomic(promptCacheFile(paths, sessionId), `${JSON.stringify({ sessionId, prompt, cachedAt: Date.now() })}\n`)
}

// 读取触发词缓存：不存在、损坏或过期都返回 undefined
export function readPromptCache(paths: ReturnType<typeof telemetryPaths>, sessionId: string): string | undefined {
  const file = promptCacheFile(paths, sessionId)
  if (!existsSync(file)) return undefined
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
    if (typeof parsed !== "object" || parsed === null) return undefined
    const cache = parsed as { prompt?: unknown; cachedAt?: unknown }
    if (typeof cache.prompt !== "string") return undefined
    if (typeof cache.cachedAt !== "number" || Date.now() - cache.cachedAt > PROMPT_CACHE_TTL_MS) return undefined
    return cache.prompt
  } catch {
    return undefined
  }
}

// 从工具结果推断执行结果：字段口径因 Agent 而异，无法判断时返回 unknown
export function extractOutcome(toolResponse: unknown): TelemetryOutcome {
  if (typeof toolResponse !== "object" || toolResponse === null) return "unknown"
  const response = toolResponse as Record<string, unknown>
  if (response.is_error === true || response.success === false || typeof response.error === "string") return "failure"
  if (response.success === true || response.exit_code === 0 || response.exitCode === 0) return "success"
  return "unknown"
}

// 从工具结果提取耗时：优先 duration_ms，其次 durationMs
function extractDuration(toolResponse: unknown): number | undefined {
  if (typeof toolResponse !== "object" || toolResponse === null) return undefined
  const response = toolResponse as Record<string, unknown>
  const value = response.duration_ms ?? response.durationMs
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
}

// 处理已解析的 Hook 事件：UserPromptSubmit 只缓存，PostToolUse 才落盘
export function processHookEvent(event: NormalizedHookEvent, config: TelemetryConfig, paths: ReturnType<typeof telemetryPaths>): IngestResult {
  if (!config.enabled) return { status: "disabled" }
  if (event.prompt !== undefined && event.toolName === undefined) {
    if (config.capture.triggerPrompt) writePromptCache(paths, event.sessionId, event.prompt)
    return { status: "cached" }
  }
  const skill = extractSkillName(event.toolName, event.toolInput)
  if (!skill) return { status: "ignored" }
  const meta = resolveSkillMeta(skill)
  if (!shouldRecord(config, event.agent, meta)) return { status: "filtered", skill }
  const eventRecord = buildEvent(
    {
      agent: event.agent,
      sessionId: event.sessionId,
      toolUseId: event.toolUseId,
      project: event.project,
      skill,
      triggerPrompt: readPromptCache(paths, event.sessionId),
      skillArgs: extractSkillArgs(event.toolInput),
      outcome: extractOutcome(event.toolResponse),
      durationMs: extractDuration(event.toolResponse),
      originAdapter: event.originAdapter,
      occurredAt: event.occurredAt,
    },
    config,
  )
  const result = appendEvent(paths, eventRecord, config)
  return { status: result.written ? "written" : "duplicate", skill }
}

// 写 Hook 错误日志：入口本身不能抛错，否则会变成阻断性错误
export function logHookError(paths: ReturnType<typeof telemetryPaths>, message: string): void {
  try {
    ensureDir(paths.root)
    const file = join(paths.root, "hook-errors.log")
    const line = `${new Date().toISOString()} ${message}\n`
    const previous = existsSync(file) ? readFileSync(file, "utf8") : ""
    // 只保留最近 200 行，避免日志无限增长
    const lines = `${previous}${line}`.split(/\r?\n/).filter(Boolean)
    writeFileAtomic(file, `${lines.slice(-200).join("\n")}\n`)
  } catch {
    // 日志失败不影响主流程
  }
}

// 从 stdin 读取全部内容：Hook 载荷通常很小
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

// CLI ingest：解析、处理、记录错误；退出码恒 0，避免阻断 Agent
export async function ingestFromStdin(agentId: string): Promise<IngestResult> {
  const config = loadTelemetryConfig()
  // 数据目录按统一优先级解析，避免与其它命令不一致
  const paths = telemetryPaths(resolveTelemetryDir(undefined, config))
  const adapter = getAdapter(agentId)
  if (!adapter) {
    logHookError(paths, `未知 Agent：${agentId}`)
    return { status: "error", message: `未知 Agent：${agentId}` }
  }
  try {
    const text = await readStdin()
    const raw: unknown = JSON.parse(text)
    const event = adapter.parseHookEvent(raw)
    if (!event) return { status: "ignored" }
    return processHookEvent(event, config, paths)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logHookError(paths, message)
    return { status: "error", message }
  }
}
