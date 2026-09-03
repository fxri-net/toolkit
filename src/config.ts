// 项目配置文件读取：项目根 .toolkitrc.json，统一加载与缓存，各能力域按需取自己的配置段
// 结构示例：
// {
//   "redact": { "enabled": true, "disable": [], "rules": [] },
//   "check":  { "warnings": true }
// }
import { readFileSync } from "node:fs"
import { join } from "node:path"

// 缓存：undefined=尚未加载，null=无配置文件（或解析失败）
let cached: Record<string, unknown> | null | undefined

// 读取项目根 .toolkitrc.json，文件缺失或 JSON 非法返回 null
export function loadToolkitConfig(): Record<string, unknown> | null {
  if (cached !== undefined) return cached
  cached = null
  try {
    const raw = readFileSync(join(process.cwd(), ".toolkitrc.json"), "utf8")
    cached = JSON.parse(raw) as Record<string, unknown>
  } catch {
    // 无配置文件或 JSON 非法：忽略，走各域默认值
  }
  return cached
}

// 取某个能力域的配置段（对象），不存在返回 undefined
export function getConfigSection(name: string): Record<string, unknown> | undefined {
  const cfg = loadToolkitConfig()
  if (!cfg) return undefined
  const section = cfg[name]
  return typeof section === "object" && section !== null ? (section as Record<string, unknown>) : undefined
}

// 失效配置缓存：库形态长驻进程 / 测试中修改 .toolkitrc.json 后调用，使下次读取重新加载
export function resetToolkitConfigCache(): void {
  cached = undefined
}
