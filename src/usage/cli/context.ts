// 使用情况 CLI（context）：上下文、格式与解析助手，自 commands.ts 原样搬移
import { existsSync, readFileSync } from "node:fs"
import { jsonEnvelope, toJsonText } from "../../json-output"
import { line } from "../../term-style"
import { redactText, resolveRedactEnabled } from "../../privacy/redact"
import { uploadStatus } from "../upload"
import { resolveSkillMeta } from "../event"
import { AGENT_ADAPTERS } from "../adapters"
import { queueCount } from "../queue"
import { loadUsageConfig, resolveUsageDir, usageConfigPath } from "../config"
import { parseSince, summarize } from "../stats"
import { listEventFiles, readAllEvents, readIndex, usagePaths } from "../store"
import { readLastHookError } from "../ingest"
import type { SkillUsageEvent, UsageConfig, UsageSkillSource } from "../types"


// 合法来源枚举：CLI 过滤与导入校验共用
export const SOURCE_VALUES: UsageSkillSource[] = ["toolkit-first-party", "toolkit-third-party", "unmanaged", "unknown"]

// 运行时上下文：配置、数据目录与路径集合一次算好，避免各命令重复解析
export interface UsageContext {
  config: UsageConfig
  dir: string
  paths: ReturnType<typeof usagePaths>
}

// 取当前上下文：--dir 只影响本次运行，不写配置
export function createContext(cliDir?: string): UsageContext {
  const config = loadUsageConfig()
  const dir = resolveUsageDir(cliDir, config)
  return { config, dir, paths: usagePaths(dir) }
}

// 打印 JSON：沿用仓库统一的 schemaVersion 锚点
export function printJson(payload: object): void {
  console.log(toJsonText(payload))
}

// 本地时间格式：把 Hook 记录的 ISO 时间转为 YYYY-MM-DD HH:mm:ss；无法解析时原样返回
export function formatLocalTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (item: number) => String(item).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// 解析 --older-than：只接受 30d / 24h / 60m，返回对应天数（保留小数，供保留期比较）
export function parseOlderThanDays(value: string): number | null {
  const matched = /^(\d+)([dhm])$/.exec(value.trim())
  if (!matched) return null
  const amount = Number(matched[1])
  if (!Number.isInteger(amount) || amount <= 0) return null
  const unit = matched[2]
  const ms = amount * (unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : 60_000)
  return ms / 86_400_000
}

// 解析来源过滤：非法取值置退出码并返回 null
export function parseSource(value: string | undefined): UsageSkillSource | null {
  if (value === undefined) return null
  if ((SOURCE_VALUES as string[]).includes(value)) return value as UsageSkillSource
  console.error(`⚠️ --source 取值须为 ${SOURCE_VALUES.join(" / ")}`)
  process.exitCode = 1
  return null
}

// 解析 since：非法取值置退出码并返回 null
export function parseSinceOption(value: string | undefined): Date | null | undefined {
  const parsed = parseSince(value)
  if (parsed === null) {
    console.error("⚠️ --since 取值须为 30d / 24h / 60m 或 YYYY-MM-DD")
    process.exitCode = 1
  }
  return parsed
}

// 逗号分隔的名单：去空、去重
export function splitNames(value: string | undefined): string[] {
  if (!value) return []
  return [...new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))]
}

// 开关类命令的摘要段：文本与 JSON 由同一份载荷渲染，避免两处口径漂移
export type ConfigSegment = "enabled" | "channel" | "sources" | "skills" | "capture" | "storage"

export interface SegmentReport {
  payload: Record<string, unknown>
  lines: string[]
}

// 生成摘要段：payload 供 --format json，lines 供人读模式
export function buildSegmentReport(config: UsageConfig, segment: ConfigSegment): SegmentReport {
  if (segment === "enabled") {
    return { payload: { enabled: config.enabled }, lines: [`技能使用情况：${config.enabled ? "已开启" : "已关闭"}`] }
  }
  if (segment === "channel") {
    const label = config.channel === "rule" ? "rule（全局规则上报）" : "hook（Agent Hook）"
    return { payload: { channel: config.channel }, lines: [`采集通道：${label}`] }
  }
  if (segment === "sources") {
    const { firstParty, thirdParty, unmanaged } = config.sources
    return {
      payload: { sources: config.sources },
      lines: [`来源：一方 ${firstParty ? "开" : "关"} / 第三方 ${thirdParty ? "开" : "关"} / 未托管 ${unmanaged ? "开" : "关"}`],
    }
  }
  if (segment === "skills") {
    const names = config.skills.mode === "exclude" ? config.skills.exclude : config.skills.include
    return { payload: { skills: config.skills }, lines: [`技能模式：${config.skills.mode}；名单：${names.join("、") || "空"}`] }
  }
  if (segment === "capture") {
    const { triggerPrompt, skillArgs, outcome } = config.capture
    return {
      payload: { capture: config.capture },
      lines: [`字段：触发词 ${triggerPrompt ? "开" : "关"} / 参数 ${skillArgs ? "开" : "关"} / 结果 ${outcome ? "开" : "关"}`],
    }
  }
  const { rotation, retentionDays, maxFileBytes } = config.storage
  return {
    payload: { storage: config.storage },
    lines: [`存储：${rotation} / 保留 ${retentionDays} 天 / 单文件 ${maxFileBytes} 字节`],
  }
}

// 打印摘要段：json 走统一信封（command 由调用点给出），文本按同一份数据渲染
export function printSegment(config: UsageConfig, segment: ConfigSegment, format: string | undefined, command: string): void {
  const report = buildSegmentReport(config, segment)
  if (format === "json") {
    printJson(jsonEnvelope(command, true, report.payload))
    return
  }
  for (const text of report.lines) console.log(text)
}

// 打印配置当前值：无参数时供各子命令回显
export function printConfig(config: UsageConfig, dir: string): void {
  const segment = (part: ConfigSegment): string => buildSegmentReport(config, part).lines[0] ?? ""
  console.log(segment("enabled"))
  console.log(segment("channel"))
  console.log(`配置：${usageConfigPath()}`)
  console.log(`数据目录：${dir}`)
  const agents = Object.entries(config.agents).filter(([, enabled]) => enabled).map(([name]) => name)
  console.log(`Agent：${agents.length > 0 ? agents.join("、") : "未开启"}`)
  console.log(segment("sources"))
  console.log(segment("skills"))
  console.log(segment("capture"))
  console.log(segment("storage"))
  const upload = uploadStatus()
  console.log(`上传：${upload.enabled ? `已开启（待上传 ${upload.pending} 条）` : "已关闭"}`)
}

// 状态摘要：裸 usage 与 info 子命令共用同一份文本口径
export function printUsageInfo(dirOption?: string): void {
  const { config, dir, paths } = createContext(dirOption)
  const index = readIndex(paths)
  const files = listEventFiles(paths)
  const events = readAllEvents(paths)
  const last = events.reduce<string | undefined>((acc, event) => (!acc || event.occurredAt > acc ? event.occurredAt : acc), undefined)
  const installedHooks = AGENT_ADAPTERS.filter((adapter) => {
    try {
      return adapter.status().installed
    } catch {
      return false
    }
  }).map((adapter) => adapter.id)
  const lastHookError = readLastHookError(paths)
  printConfig(config, dir)
  if (config.channel === "rule") console.log("规则入口：toolkit rule compose --module usage（输出可复制到全局规则的文案）")
  console.log(`Hook：${installedHooks.length > 0 ? installedHooks.join("、") : "未安装"}`)
  console.log(`队列：${queueCount(paths)} 条待处理`)
  console.log(`事件：${events.length} 条（索引 ${index.eventIds.length} 条，文件 ${files.length} 个）`)
  console.log(`最近：${last ?? "暂无"}`)
  if (lastHookError) console.log(`最近 Hook 错误：${lastHookError}`)
}

// 默认统计视图：菜单与 stats 子命令共用同一个打印器
export function printDefaultStats(limit = 20, dir?: string): void {
  const { paths } = createContext(dir)
  printSkillSummary(readAllEvents(paths), limit)
}

// 打印技能统计：按次数降序，最多显示 limit 条
export function printSkillSummary(events: SkillUsageEvent[], limit = 20): void {
  const summary = summarize(events)
  console.log(`技能使用统计：共 ${summary.total} 条`)
  if (summary.bySkill.length === 0) {
    console.log(line.hint("暂无记录"))
    return
  }
  for (const item of summary.bySkill.slice(0, limit)) {
    console.log(`  ${item.skill}  ${item.count} 次 / ${item.sessions} 会话  ${item.source}`)
  }
}

// 打印触发词：默认脱敏，避免终端泄露敏感信息
export function printTriggers(events: SkillUsageEvent[], skill: string | undefined, limit: number): void {
  const summary = summarize(events)
  const rows = skill ? summary.triggers.filter((item) => item.skills.includes(skill)) : summary.triggers
  if (rows.length === 0) {
    console.log(line.hint("暂无触发词记录（触发词采集默认关闭，可用 capture --trigger on 开启）"))
    return
  }
  const redact = resolveRedactEnabled(undefined)
  for (const item of rows.slice(0, limit)) {
    console.log(`  ${item.count} 次｜${formatLocalTime(item.lastAt)}｜${redactText(item.prompt, redact)}｜${item.skills.join("、")}`)
  }
}

// 导入事件归一：补齐缺省字段，拒绝缺少必要标识的记录
export function normalizeImportedEvent(raw: unknown): SkillUsageEvent | null {
  if (typeof raw !== "object" || raw === null) return null
  const item = raw as Partial<SkillUsageEvent>
  if (typeof item.eventId !== "string" || typeof item.skill !== "string" || typeof item.agent !== "string") return null
  if (typeof item.sessionId !== "string" || typeof item.occurredAt !== "string") return null
  const meta = resolveSkillMeta(item.skill)
  const source = SOURCE_VALUES.includes(item.skillSource as UsageSkillSource)
    ? (item.skillSource as UsageSkillSource)
    : meta.source
  const event: SkillUsageEvent = {
    schemaVersion: 1,
    eventId: item.eventId,
    occurredAt: item.occurredAt,
    agent: item.agent,
    sessionId: item.sessionId,
    skill: item.skill,
    skillSource: source,
    managedBy: item.managedBy ?? (source === "unmanaged" ? "unknown" : "toolkit"),
    originAdapter: item.originAdapter ?? "import",
    toolkitVersion: item.toolkitVersion ?? "unknown",
  }
  if (item.toolUseId) event.toolUseId = item.toolUseId
  if (item.project) event.project = item.project
  if (item.skillVersion) event.skillVersion = item.skillVersion
  if (item.triggerPrompt) event.triggerPrompt = item.triggerPrompt
  if (item.skillArgs) event.skillArgs = item.skillArgs
  if (item.outcome) event.outcome = item.outcome
  if (item.durationMs !== undefined) event.durationMs = item.durationMs
  return event
}

// 解析导入文件：JSON 数组 / { events } 与 JSONL 两种形态
export function parseImportFile(file: string, format: string): SkillUsageEvent[] | null {
  if (!existsSync(file)) {
    console.error(`⚠️ 导入文件不存在：${file}`)
    process.exitCode = 1
    return null
  }
  const content = readFileSync(file, "utf8")
  const rawItems: unknown[] = []
  if (format === "jsonl") {
    for (const line of content.split(/\r?\n/)) {
      const text = line.trim()
      if (!text) continue
      try {
        rawItems.push(JSON.parse(text))
      } catch {
        console.warn(`⚠️ 跳过无法解析的行：${text.slice(0, 80)}`)
      }
    }
  } else {
    try {
      const parsed: unknown = JSON.parse(content)
      if (Array.isArray(parsed)) rawItems.push(...parsed)
      else if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { events?: unknown[] }).events)) {
        rawItems.push(...((parsed as { events: unknown[] }).events))
      } else {
        console.error("⚠️ JSON 导入文件须为事件数组或 { events: [...] }")
        process.exitCode = 1
        return null
      }
    } catch {
      console.error("⚠️ JSON 导入文件解析失败")
      process.exitCode = 1
      return null
    }
  }
  const events: SkillUsageEvent[] = []
  for (const raw of rawItems) {
    const event = normalizeImportedEvent(raw)
    if (event) events.push(event)
    else console.warn("⚠️ 跳过缺少必要字段的事件记录")
  }
  return events
}

