// 契约版本格式：MAJOR.MINOR（两位）；每个契约各自声明版本值、独立升版，本模块只提供格式归一与比较
export type ContractVersion = `${number}.${number}`

/**
 * 归一契约版本。
 * @param value 版本取值：整数（历史写法）或两位字符串
 * @return 归一后的 "MAJOR.MINOR"；无法识别返回 null
 */
export function normalizeContractVersion(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return `${value}.0`
  if (typeof value === "string" && /^\d+\.\d+$/.test(value)) return value
  return null
}

/**
 * 判断契约版本是否等于声明值（历史整数按 N.0 归一后比较）。
 * @param value 实际版本
 * @param expected 该契约声明的版本常量
 * @return 是否一致
 */
export function isContractVersion(value: unknown, expected: ContractVersion): boolean {
  return normalizeContractVersion(value) === expected
}

// 版本相对声明值的状态：current 无需处理；legacy 落后；newer 高于当前 toolkit；unknown 无法识别
export type ContractVersionState = "current" | "legacy" | "newer" | "unknown"

// 两位版本比较：MAJOR 优先，其次 MINOR
function compareContractVersion(left: string, right: string): number {
  const [leftMajor, leftMinor] = left.split(".").map(Number)
  const [rightMajor, rightMinor] = right.split(".").map(Number)
  return leftMajor !== rightMajor ? (leftMajor ?? 0) - (rightMajor ?? 0) : (leftMinor ?? 0) - (rightMinor ?? 0)
}

/**
 * 判定实际版本相对声明值的状态。
 * 历史整数即使语义等于声明值也按 legacy 处理，因为磁盘上仍是旧写法、需要重写为两位格式。
 * @param value 实际版本
 * @param expected 该契约声明的版本常量
 * @return 版本状态
 */
export function contractVersionState(value: unknown, expected: ContractVersion): ContractVersionState {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) return "unknown"
    return compareContractVersion(normalizeContractVersion(value) as string, expected) > 0 ? "newer" : "legacy"
  }
  const normalized = normalizeContractVersion(value)
  if (!normalized) return "unknown"
  const compared = compareContractVersion(normalized, expected)
  return compared === 0 ? "current" : compared > 0 ? "newer" : "legacy"
}
