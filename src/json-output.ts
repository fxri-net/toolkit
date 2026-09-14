// 机器可读 JSON 统一序列化：前置 schemaVersion 锚点，技能域与任务统计域共用
// 与 tasks --export 的 schemaVersion: 1 同口径，消费方可据此判断结构版本

// 序列化载荷为带 schemaVersion 锚点的 JSON 文本（缩进 2，锚点先于载荷字段）
export function toJsonText(payload: object): string {
  return JSON.stringify({ schemaVersion: 1, ...payload }, null, 2)
}
