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
