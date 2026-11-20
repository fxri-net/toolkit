// 全局配置文件读写：只动 ~/.toolkitrc.json，读-合并-原子写
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getHomeDir } from "../config"
import { writeFileAtomic } from "../write-atomic"

// 全局配置文件路径
export function globalConfigPath(): string {
  return join(getHomeDir(), ".toolkitrc.json")
}

// 读取全局配置：缺失返回空对象；解析失败抛错，由调用方中止（不静默覆盖）
export function readGlobalConfig(): Record<string, unknown> {
  const file = globalConfigPath()
  if (!existsSync(file)) return {}
  const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file} 不是合法的 JSON 对象，请先手动修正`)
  }
  return parsed as Record<string, unknown>
}

// 原子写回：保留其它段，只覆盖本次变更的段
export function writeGlobalConfig(config: Record<string, unknown>): void {
  writeFileAtomic(globalConfigPath(), `${JSON.stringify(config, null, 2)}\n`)
}
