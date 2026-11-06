// 事件构造：把 Hook 载荷归一为固定 schema，并解析技能来源、生成稳定 eventId
import { createHash } from "node:crypto"
import { listPackageSkills, readSkillsState } from "../skills"
import { redactText, resolveRedactEnabled } from "../privacy/redact"
import type {
  SkillUsageEvent,
  TelemetryConfig,
  TelemetryEventInput,
  TelemetrySkillMeta,
  TelemetrySkillSource,
} from "./types"

// toolkit 版本：由 CLI 入口注入，库形态未注入时记为 unknown，避免事件构造依赖包路径
let toolkitVersion = "unknown"

// 注入当前 toolkit 版本：CLI 启动时调用一次
export function setToolkitVersion(version: string): void {
  toolkitVersion = version
}

// 触发词最大长度：避免把整段对话写入事件
const MAX_PROMPT_LENGTH = 200
// 技能参数最大长度：保留可辨识片段即可
const MAX_ARGS_LENGTH = 500

// 本地时区 ISO 时间串：保留偏移，便于跨时区阅读与排序
export function toLocalIsoString(date: Date): string {
  const pad = (value: number, size = 2) => String(Math.trunc(Math.abs(value))).padStart(size, "0")
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
  const offsetRest = Math.abs(offsetMinutes) % 60
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  return `${ymd}T${time}${sign}${pad(offsetHours)}:${pad(offsetRest)}`
}

// 稳定事件 ID：优先 agent + sessionId + toolUseId；缺少 toolUseId 时用技能与 2 秒窗口
export function computeEventId(
  agent: string,
  sessionId: string,
  toolUseId: string | undefined,
  skill: string,
  occurredAt: Date,
): string {
  const fallback = `${skill}|${Math.floor(occurredAt.getTime() / 2000)}`
  const key = `${agent}\u0000${sessionId}\u0000${toolUseId || fallback}`
  return `sha256:${createHash("sha256").update(key).digest("hex")}`
}

// 截断文本：超过上限时保留前缀并补省略号
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

// 解析 JSON 字符串载荷：已是对象则原样返回；无法解析返回 null
function parsePayload(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== "string") return null
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// 取对象里的字符串字段：按候选键顺序取第一个非空字符串
function pickString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === "string" && value.trim() !== "") return value.trim()
  }
  return undefined
}

// 包内技能名集合：用于判断裸 name 字段是否指向技能
function knownSkillNames(): Set<string> {
  try {
    return new Set(listPackageSkills().map((skill) => skill.name))
  } catch {
    return new Set()
  }
}

// 从工具名与入参中识别技能名：Skill 工具取 name，读取 SKILL.md 时从路径反推
export function extractSkillName(toolName: string | undefined, toolInput: unknown): string | null {
  const payload = parsePayload(toolInput)
  const known = knownSkillNames()
  const lowerTool = (toolName ?? "").toLowerCase()

  // 显式技能工具：不同 Agent 的字段名不同，统一按候选键取
  if (lowerTool.includes("skill")) {
    const explicit = payload ? pickString(payload, ["skill", "skill_name", "name", "command"]) : undefined
    if (explicit) return explicit
  }
  if (payload) {
    const explicitSkill = pickString(payload, ["skill", "skill_name"])
    if (explicitSkill) return explicitSkill
    const named = pickString(payload, ["name"])
    if (named && (known.has(named) || named.startsWith("fxri-"))) return named
    // 读取技能文件：从 skills/<name>/SKILL.md 反推
    const path = pickString(payload, ["file_path", "path", "filename"])
    if (path) {
      const matched = /skills[/\\]([^/\\]+)[/\\]SKILL\.md$/i.exec(path)
      if (matched?.[1]) return matched[1]
    }
  }
  // 少数 Agent 直接用技能名作为工具名
  if (known.has(lowerTool) || lowerTool.startsWith("fxri-")) return lowerTool
  return null
}

// 从入参中提取技能参数：保留 JSON 文本，便于统计页展示
export function extractSkillArgs(toolInput: unknown): string | undefined {
  const payload = parsePayload(toolInput)
  if (!payload) return typeof toolInput === "string" && toolInput.trim() !== "" ? toolInput : undefined
  const value = payload.args ?? payload.arguments ?? payload.input
  if (value === undefined) return undefined
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

// 解析技能元数据：包内清单判一方，状态文件中的非内置来源判第三方，其余为未托管
export function resolveSkillMeta(skill: string): TelemetrySkillMeta {
  try {
    const pkgSkill = listPackageSkills().find((item) => item.name === skill)
    if (pkgSkill) {
      return { name: skill, version: pkgSkill.version, source: "toolkit-first-party", managedBy: "toolkit" }
    }
  } catch {
    // 包内清单不可读时继续走状态文件判定
  }
  try {
    const state = readSkillsState()
    for (const source of Object.values(state?.sources ?? {})) {
      if (source.kind === "builtin") continue
      for (const target of source.targets) {
        const entry = target.entries.find((item) => item.name === skill)
        if (entry) {
          return { name: skill, version: entry.version, source: "toolkit-third-party", managedBy: "toolkit" }
        }
      }
    }
  } catch {
    // 状态文件损坏按未托管处理，由 doctor 提示
  }
  return { name: skill, version: "", source: "unmanaged", managedBy: "unknown" }
}

// 来源是否被配置开启
function sourceEnabled(config: TelemetryConfig, source: TelemetrySkillSource): boolean {
  if (source === "toolkit-first-party") return config.sources.firstParty
  if (source === "toolkit-third-party") return config.sources.thirdParty
  return config.sources.unmanaged
}

// 构造事件：字段开关只影响对应字段，不影响事件本身是否落盘
export function buildEvent(input: TelemetryEventInput, config: TelemetryConfig): SkillUsageEvent {
  const occurredAt = input.occurredAt ?? new Date()
  const meta = resolveSkillMeta(input.skill)
  const redactEnabled = resolveRedactEnabled(undefined)
  const event: SkillUsageEvent = {
    schemaVersion: 1,
    eventId: computeEventId(input.agent, input.sessionId, input.toolUseId, input.skill, occurredAt),
    occurredAt: toLocalIsoString(occurredAt),
    agent: input.agent,
    sessionId: input.sessionId,
    skill: input.skill,
    skillSource: meta.source,
    managedBy: meta.managedBy,
    originAdapter: input.originAdapter,
    toolkitVersion,
  }
  if (input.toolUseId) event.toolUseId = input.toolUseId
  if (input.project) event.project = input.project
  if (meta.version) event.skillVersion = meta.version
  if (config.capture.triggerPrompt && input.triggerPrompt) {
    event.triggerPrompt = truncate(redactText(input.triggerPrompt, redactEnabled), MAX_PROMPT_LENGTH)
  }
  if (config.capture.skillArgs && input.skillArgs) {
    event.skillArgs = truncate(redactText(input.skillArgs, redactEnabled), MAX_ARGS_LENGTH)
  }
  if (config.capture.outcome && input.outcome) event.outcome = input.outcome
  if (config.capture.outcome && input.durationMs !== undefined && input.durationMs >= 0) event.durationMs = input.durationMs
  return event
}

// 供过滤层复用：来源开关判定
export function isSourceEnabled(config: TelemetryConfig, source: TelemetrySkillSource): boolean {
  return sourceEnabled(config, source)
}
