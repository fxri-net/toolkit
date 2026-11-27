// 机器可读 JSON 统一序列化：前置 schemaVersion 锚点，各域共用同一份序列化出口
// JSON 信封契约独立升版：格式为两位 MAJOR.MINOR，与任务导出 / 事件等契约互不联动
import type { ContractVersion } from "./contract-version"

export const JSON_ENVELOPE_VERSION: ContractVersion = "1.0"

// 序列化载荷为带 schemaVersion 锚点的 JSON 文本（缩进 2，锚点先于载荷字段）
export function toJsonText(payload: object): string {
  return JSON.stringify({ schemaVersion: JSON_ENVELOPE_VERSION, ...payload }, null, 2)
}

// 聚合问题：level 与各域 check 同口径，scope 标注所属区块
export interface JsonIssue {
  level: "error" | "warn" | "info"
  scope: string
  message: string
}

// 统一信封入参：code / message 缺省由 issues 推导，exitCode 独立于业务结论
export interface JsonEnvelopeInput<T> {
  command: string
  // 业务结论码（HTTP 语义）：缺省含 error 取 422，否则取 200；调用点可显式覆盖
  code?: number
  // 结论文案：缺省无 issues 取「成功」，只含提示取「成功（N 项提示）」，含 error 取首条 error 文案
  message?: string
  data: T
  issues?: JsonIssue[]
  // 进程退出码，写入 extend.exitCode；与 code 分离，避免「有 error 但未阻断」被误读为失败退出
  exitCode?: number
  extend?: Record<string, unknown>
  debug?: Record<string, unknown>
}

// 统一信封：固定 7 个载荷键，schemaVersion 由 toJsonText 统一前置
// 键序固定为 command / code / message / data / extend / debug / issues，缺失项以空值补齐不省略
export function jsonEnvelope<T>(input: JsonEnvelopeInput<T>): {
  command: string
  code: number
  message: string
  data: T
  extend: Record<string, unknown>
  debug: Record<string, unknown>
  issues: JsonIssue[]
} {
  const issues = input.issues ?? []
  const firstError = issues.find((issue) => issue.level === "error")
  const code = input.code ?? (firstError ? 422 : 200)
  // 提示计数只统计非 error 项：含 error 时文案直接取首条错误，不再报「N 项提示」
  const noticeCount = issues.filter((issue) => issue.level !== "error").length
  const message =
    input.message ?? (firstError ? firstError.message : noticeCount > 0 ? `成功（${noticeCount} 项提示）` : "成功")
  return {
    command: input.command,
    code,
    message,
    data: input.data,
    // exitCode 是一等入参，不允许被 extend 内同名键覆盖
    extend: { ...input.extend, exitCode: input.exitCode ?? 0 },
    debug: input.debug ?? {},
    issues,
  }
}

// 校验 --format 取值：仅支持 json，非法值告警并置退出码 1；返回 false 时调用方直接 return
export function assertJsonFormat(format: string | undefined): boolean {
  if (format && format !== "json") {
    console.error(`⚠️ 不支持的输出格式「${format}」，仅支持 json`)
    process.exitCode = 1
    return false
  }
  return true
}
