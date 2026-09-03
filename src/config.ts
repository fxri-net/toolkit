// 项目配置文件读取：从当前目录向上查找最近的 .toolkitrc.json（支持在 monorepo 子目录运行），
// 统一加载与缓存，各能力域按需取自己的配置段
// 结构示例：
// {
//   "redact": { "enabled": true, "disable": [], "rules": [] },
//   "check":  { "warnings": true }
// }
import { existsSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"

// 缓存：undefined=尚未加载，null=无配置文件（或全部解析失败）
let cached: Record<string, unknown> | null | undefined

// 读取最近的 .toolkitrc.json（从 process.cwd() 向上逐级查找，取最近一个可解析的），都没有返回 null
export function loadToolkitConfig(): Record<string, unknown> | null {
  if (cached !== undefined) return cached
  cached = null
  let dir = process.cwd()
  for (;;) {
    const candidate = join(dir, ".toolkitrc.json")
    if (existsSync(candidate)) {
      try {
        cached = JSON.parse(readFileSync(candidate, "utf8")) as Record<string, unknown>
        break
      } catch {
        // 该级配置文件非法：继续向上查找上级目录的配置
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
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
