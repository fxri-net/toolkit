// 跨域共用的命令行输出与参数小工具：命令模块与 cli.ts 共用同一份实现
import { getConfigSection } from "../config"
import { toJsonText } from "../json-output"
import { languages, type ChangelogLanguage } from "../changelog/languages"

// 多值参数解析（--owner / --scope / --status 共用）：仅按半角/全角逗号分隔，顿号与分号不作分隔符
export function splitMulti(v?: string): string[] | undefined {
  return v ? v.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : undefined
}

// 收集可多次出现的 --dir（commander collect 范式：默认 [] 逐个累积）
export function collectDir(value: string, previous: string[]): string[] {
  return [...previous, value]
}

// JSON 输出统一出口：技能域与任务统计域共用，序列化口径见 toJsonText
export function printJson(payload: object): void {
  console.log(toJsonText(payload))
}

// 读取 .toolkitrc.json 的 check.warnings 开关（软告警配置档）
export function getCheckWarnings(): boolean | undefined {
  const section = getConfigSection("check")
  return typeof section?.warnings === "boolean" ? section.warnings : undefined
}

// 合并 .toolkitrc.json 配置的语言到内置（配置同名 key 覆盖内置，新 key 追加，实现全语言支持）
export function resolveLanguages(): Record<string, ChangelogLanguage> {
  const section = getConfigSection("changelog")
  const custom = section?.languages
  if (!custom || typeof custom !== "object") return languages
  const merged: Record<string, ChangelogLanguage> = { ...languages }
  for (const [key, value] of Object.entries(custom)) {
    if (value && typeof value === "object") merged[key] = value as ChangelogLanguage
  }
  return merged
}
