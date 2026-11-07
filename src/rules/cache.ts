// 规则组合选择缓存：存于用户级缓存目录，记录模块顺序；损坏时告警并回落推荐预设
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname } from "node:path"
import { cachePath } from "../cache"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"

const SELECTION_FILE = "rules-selection.json"

export interface RulesSelection {
  schema: 1
  modules: string[]
}

export function rulesSelectionPath(): string {
  return cachePath(SELECTION_FILE)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

// 读取缓存：不存在返回 null；结构不符 / 空列表 / 未知模块告警后按无缓存处理
export function readRulesSelection(validIds?: string[]): RulesSelection | null {
  const file = rulesSelectionPath()
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readTextFile(file)) as unknown
    if (!isRecord(parsed) || parsed.schema !== 1 || !Array.isArray(parsed.modules)) throw new Error("结构不兼容")
    const ids = [...new Set(parsed.modules.filter((item): item is string => typeof item === "string" && item !== ""))]
    const unknown = validIds ? ids.filter((id) => !validIds.includes(id)) : []
    if (unknown.length > 0) console.warn(`⚠️ 规则组合缓存含未知模块 id（${unknown.join("、")}），已忽略`)
    const modules = validIds ? ids.filter((id) => validIds.includes(id)) : ids
    if (modules.length === 0) throw new Error("模块列表为空")
    return { schema: 1, modules }
  } catch (error) {
    console.warn(`⚠️ 忽略规则组合缓存 ${file}：${(error as Error).message}，已回落推荐预设`)
    return null
  }
}

// 写入缓存：显式选择后记住顺序，下次直接复用；重复 id 保留首次位置
export function writeRulesSelection(modules: string[]): void {
  const file = rulesSelectionPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileAtomic(file, `${JSON.stringify({ schema: 1, modules: [...new Set(modules)] }, null, 2)}\n`)
}

// 清除缓存：不存在时返回 false，供 CLI 如实报告
export function clearRulesSelection(): boolean {
  const file = rulesSelectionPath()
  if (!existsSync(file)) return false
  rmSync(file, { force: true })
  return true
}
