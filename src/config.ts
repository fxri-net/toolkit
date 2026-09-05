// 配置文件读取：项目级从当前目录向上查找最近的 .toolkitrc.json（支持在 monorepo 子目录运行），
// 全局级读取 ~/.toolkitrc.json（个人偏好，不进项目仓库）；两层按配置段合并，统一加载与缓存，
// 各能力域按需取自己的配置段。覆盖链：CLI --flag > 环境变量 > 项目配置 > 全局配置 > 默认值。
// 结构示例：
// {
//   "redact": { "enabled": true, "disable": [], "rules": [] },
//   "check":  { "warnings": true }
// }
import { existsSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

// 缓存：undefined=尚未加载，null=无配置文件（或全部解析失败）
let cached: Record<string, unknown> | null | undefined

// 全局配置目录注入点（仅测试用）：生产保持 os.homedir()，测试指向临时目录避免读到真实用户配置
let homeOverride: string | undefined
export function setHomeDirForTest(dir: string | undefined): void {
  homeOverride = dir
}

// 读取并解析单个配置文件：不存在、JSON 非法（含顶层非对象）返回 null；BOM 一并剥离
function readConfigFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null
  try {
    // 剥离 UTF-8 BOM：Windows 下 PowerShell Set-Content 默认写 BOM，不处理会导致配置被静默跳过
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""))
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// 段级合并：项目配置出现的段整体覆盖全局同名段（非字段级深合并），项目未配的段落到全局
function mergeSectioned(
  globalCfg: Record<string, unknown> | null,
  projectCfg: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!globalCfg) return projectCfg
  if (!projectCfg) return globalCfg
  const merged = { ...globalCfg }
  for (const [key, value] of Object.entries(projectCfg)) merged[key] = value
  return merged
}

// 加载配置：全局 ~/.toolkitrc.json 一层 + 项目从 process.cwd() 向上逐级（取最近一个可解析），
// 段级合并后返回；都没有返回 null
export function loadToolkitConfig(): Record<string, unknown> | null {
  if (cached !== undefined) return cached
  const globalCfg = readConfigFile(join(homeOverride ?? homedir(), ".toolkitrc.json"))
  let projectCfg: Record<string, unknown> | null = null
  let dir = process.cwd()
  for (;;) {
    const cfg = readConfigFile(join(dir, ".toolkitrc.json"))
    if (cfg) {
      projectCfg = cfg
      break
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  cached = mergeSectioned(globalCfg, projectCfg)
  return cached
}

// 取某个能力域的配置段（对象），不存在返回 undefined
export function getConfigSection(name: string): Record<string, unknown> | undefined {
  const cfg = loadToolkitConfig()
  if (!cfg) return undefined
  const section = cfg[name]
  return typeof section === "object" && section !== null ? (section as Record<string, unknown>) : undefined
}

// 解析任务目录三档：CLI --dir 显式传参 > 配置 tasks.dir > 默认 .tasks
// 支持 .tasks 放项目外（绝对路径或 ../ 相对路径），配合独立文档仓库管理任务
export function resolveTasksDir(cliValue?: string): string {
  if (cliValue) return cliValue
  const dir = getConfigSection("tasks")?.dir
  return typeof dir === "string" && dir !== "" ? dir : ".tasks"
}

// 失效配置缓存：库形态长驻进程 / 测试中修改 .toolkitrc.json 后调用，使下次读取重新加载
export function resetToolkitConfigCache(): void {
  cached = undefined
}
