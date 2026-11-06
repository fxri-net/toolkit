// 可选上传：Webhook / OTLP HTTP / 本地文件导出；默认关闭，必须显式配置端点
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import { writeFileAtomic } from "../write-atomic"
import { loadTelemetryConfig, resolveTelemetryDir, updateTelemetryConfig } from "./config"
import { readAllEvents, telemetryPaths, type TelemetryPaths } from "./store"
import type { SkillUsageEvent, TelemetryConfig, TelemetryUploadProtocol } from "./types"

// 上传账本：记录已成功发送的 eventId，重试不重复
interface UploadLedger {
  schemaVersion: 1
  updatedAt: string
  sent: string[]
}

// 上传结果：dry-run 时 sent 恒为 0
export interface UploadResult {
  sent: number
  pending: number
  skipped: number
  dryRun: boolean
  protocol: TelemetryUploadProtocol
  endpoint: string
  preview?: unknown
}

// 账本路径
function ledgerPath(paths: TelemetryPaths): string {
  return join(paths.root, "upload-ledger.json")
}

// 读取账本：损坏按空账本处理，最多导致一次重复上传
function readLedger(paths: TelemetryPaths): UploadLedger {
  const file = ledgerPath(paths)
  if (!existsSync(file)) return { schemaVersion: 1, updatedAt: new Date().toISOString(), sent: [] }
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
    if (typeof parsed !== "object" || parsed === null) return { schemaVersion: 1, updatedAt: new Date().toISOString(), sent: [] }
    const ledger = parsed as Partial<UploadLedger>
    return {
      schemaVersion: 1,
      updatedAt: typeof ledger.updatedAt === "string" ? ledger.updatedAt : new Date().toISOString(),
      sent: Array.isArray(ledger.sent) ? ledger.sent.filter((id): id is string => typeof id === "string") : [],
    }
  } catch {
    return { schemaVersion: 1, updatedAt: new Date().toISOString(), sent: [] }
  }
}

// 写入账本：原子写
function writeLedger(paths: TelemetryPaths, ledger: UploadLedger): void {
  mkdirSync(paths.root, { recursive: true })
  writeFileAtomic(ledgerPath(paths), `${JSON.stringify(ledger, null, 2)}\n`)
}

// 是否本地地址：localhost / 127.0.0.1 / ::1 允许 HTTP
function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

// 校验端点：非本地地址必须 HTTPS，除非显式 allowInsecure
export function validateUploadEndpoint(config: TelemetryConfig): URL | null {
  const endpoint = config.upload.endpoint.trim()
  if (!endpoint) throw new Error("未配置上传端点，先执行 toolkit telemetry upload setup")
  if (config.upload.protocol === "file") {
    const path = isAbsolute(endpoint) ? endpoint : join(process.cwd(), endpoint)
    return new URL(`file://${path.replace(/\\/g, "/")}`)
  }
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error(`上传端点不是合法 URL：${endpoint}`)
  }
  if (url.protocol !== "https:" && !config.upload.allowInsecure && !isLocalHost(url.hostname)) {
    throw new Error("非 localhost 上传端点必须使用 HTTPS；确需 HTTP 请显式设置 allowInsecure")
  }
  return url
}

// 构造 OTLP/HTTP JSON：resourceLogs + scopeLogs + logRecords
export function buildOtlpPayload(events: SkillUsageEvent[]): unknown {
  return {
    resourceLogs: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "@fxri/toolkit" } }] },
        scopeLogs: [
          {
            scope: { name: "@fxri/toolkit.telemetry", version: "1" },
            logRecords: events.map((event) => ({
              timeUnixNano: `${new Date(event.occurredAt).getTime()}000000`,
              body: { stringValue: JSON.stringify(event) },
              attributes: [
                { key: "event.id", value: { stringValue: event.eventId } },
                { key: "skill.name", value: { stringValue: event.skill } },
                { key: "agent.name", value: { stringValue: event.agent } },
              ],
            })),
          },
        ],
      },
    ],
  }
}

// POST JSON：3 次指数退避重试；非 2xx 视为失败
async function postJson(endpoint: string, body: unknown, headers: Record<string, string>): Promise<void> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })
      if (response.ok) return
      lastError = new Error(`上传失败：HTTP ${response.status}`)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt))
  }
  throw lastError ?? new Error("上传失败")
}

// 执行一次上传：dry-run 只返回预览，不发请求、不写账本
export async function uploadOnce(options: { dryRun?: boolean; limit?: number } = {}): Promise<UploadResult> {
  const config = loadTelemetryConfig()
  if (!config.upload.enabled) throw new Error("上传未启用，先执行 toolkit telemetry upload setup")
  // 数据目录与其它命令同源解析
  const resolved = telemetryPaths(resolveTelemetryDir(undefined, config))
  validateUploadEndpoint(config)
  const events = readAllEvents(resolved)
  const ledger = readLedger(resolved)
  const sent = new Set(ledger.sent)
  const pending = events.filter((event) => !sent.has(event.eventId))
  const limit = options.limit ?? config.upload.batchSize
  const batch = pending.slice(0, limit)
  if (options.dryRun) {
    return {
      sent: 0,
      pending: pending.length,
      skipped: events.length - pending.length,
      dryRun: true,
      protocol: config.upload.protocol,
      endpoint: config.upload.endpoint,
      preview: config.upload.protocol === "otlp-http" ? buildOtlpPayload(batch) : { schemaVersion: 1, events: batch },
    }
  }
  if (batch.length === 0) {
    return { sent: 0, pending: 0, skipped: events.length, dryRun: false, protocol: config.upload.protocol, endpoint: config.upload.endpoint }
  }
  if (config.upload.protocol === "file") {
    const target = isAbsolute(config.upload.endpoint) ? config.upload.endpoint : join(process.cwd(), config.upload.endpoint)
    mkdirSync(dirname(target), { recursive: true })
    const content = batch.map((event) => JSON.stringify(event)).join("\n") + "\n"
    writeFileSync(target, content, { encoding: "utf8", flag: "a" })
  } else if (config.upload.protocol === "otlp-http") {
    await postJson(config.upload.endpoint, buildOtlpPayload(batch), config.upload.headers)
  } else {
    await postJson(config.upload.endpoint, { schemaVersion: 1, events: batch }, config.upload.headers)
  }
  for (const event of batch) sent.add(event.eventId)
  writeLedger(resolved, { schemaVersion: 1, updatedAt: new Date().toISOString(), sent: [...sent] })
  return {
    sent: batch.length,
    pending: pending.length - batch.length,
    skipped: events.length - pending.length,
    dryRun: false,
    protocol: config.upload.protocol,
    endpoint: config.upload.endpoint,
  }
}

// 上传状态：开关、端点、待上传与已发送数量
export function uploadStatus(): { enabled: boolean; protocol: TelemetryUploadProtocol; endpoint: string; pending: number; sent: number } {
  const config = loadTelemetryConfig()
  const paths = telemetryPaths(resolveTelemetryDir(undefined, config))
  const events = readAllEvents(paths)
  const sentIds = new Set(readLedger(paths).sent)
  const sent = events.filter((event) => sentIds.has(event.eventId)).length
  return {
    enabled: config.upload.enabled,
    protocol: config.upload.protocol,
    endpoint: config.upload.endpoint,
    pending: events.length - sent,
    sent,
  }
}

// 上传配置向导：协议 → 端点 → 请求头 → 确认启用
export async function runUploadSetup(): Promise<void> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    console.error("⚠️ 当前环境不支持交互，请直接编辑 ~/.toolkitrc.json 的 telemetry.upload 段")
    process.exitCode = 2
    return
  }
  const { select, input, confirm } = await import("@inquirer/prompts")
  try {
    const config = loadTelemetryConfig()
    const protocol = await select<TelemetryUploadProtocol>({
      message: "上传协议",
      default: config.upload.protocol,
      choices: [
        { name: "Webhook（自定义 HTTP）", value: "webhook" },
        { name: "OTLP/HTTP（OpenTelemetry）", value: "otlp-http" },
        { name: "本地文件（追加 JSONL）", value: "file" },
      ],
    })
    const endpoint = await input({ message: protocol === "file" ? "导出文件路径" : "上传端点 URL", default: config.upload.endpoint })
    const headersRaw = await input({ message: "附加请求头 JSON（可留空）", default: JSON.stringify(config.upload.headers) })
    let headers: Record<string, string> = {}
    try {
      const parsed: unknown = JSON.parse(headersRaw || "{}")
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        headers = Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string")) as Record<string, string>
      }
    } catch {
      console.error("⚠️ 请求头不是合法 JSON，未修改配置")
      return
    }
    const enabled = await confirm({ message: "确认启用上传？", default: false })
    if (!enabled) {
      console.log("已取消，未修改任何配置")
      return
    }
    updateTelemetryConfig({ upload: { enabled: true, protocol, endpoint, headers } })
    console.log("上传已启用；先执行 toolkit telemetry upload --dry-run 预览载荷")
  } catch (error) {
    if (error instanceof Error && (error.name === "ExitPromptError" || error.name === "AbortPromptError")) {
      console.log("已取消，未修改任何配置")
      return
    }
    throw error
  }
}
