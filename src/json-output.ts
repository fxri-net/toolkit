// 机器可读 JSON 统一序列化：前置 schemaVersion 锚点，技能域与任务统计域共用
// 与 tasks --export 的 schemaVersion: 1 同口径，消费方可据此判断结构版本

// 序列化载荷为带 schemaVersion 锚点的 JSON 文本（缩进 2，锚点先于载荷字段）
export function toJsonText(payload: object): string {
  return JSON.stringify({ schemaVersion: 1, ...payload }, null, 2)
}

// 聚合问题：level 与各域 check 同口径，scope 标注所属区块
export interface JsonIssue {
  level: "error" | "warn" | "info"
  scope: string
  message: string
}

// 统一信封：command 标识来源、ok 为总体结论、data 为域载荷、issues 为聚合问题
// schemaVersion 由 toJsonText 统一前置，构造函数不重复携带
export function jsonEnvelope<T>(
  command: string,
  ok: boolean,
  data: T,
  issues: JsonIssue[] = [],
): { command: string; ok: boolean; data: T; issues: JsonIssue[] } {
  return { command, ok, data, issues }
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
