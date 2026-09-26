// 配置文件读取：项目级从当前目录向上查找最近的 .toolkitrc.json（支持在 monorepo 子目录运行），
// 全局级读取 ~/.toolkitrc.json（个人偏好，不进项目仓库）；两层按配置段合并，统一加载与缓存，
// 各能力域按需取自己的配置段。覆盖链：CLI --flag > 环境变量 > 项目配置 > 全局配置 > 默认值。
// 结构示例：
// {
//   "redact": { "enabled": true, "disable": [], "rules": [] },
//   "check":  { "warnings": true },
//   "skills": { "autoLink": true, "autoLinkReplaceForeign": true }
// }
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { readTextFile } from "./read-text"

// 缓存：undefined=尚未加载，null=无配置文件（或全部解析失败）
let cached: Record<string, unknown> | null | undefined

// 全局配置目录注入点（仅测试用）：生产保持 os.homedir()，测试指向临时目录避免读到真实用户配置
let homeOverride: string | undefined
export function setHomeDirForTest(dir: string | undefined): void {
  homeOverride = dir
}

// 当前生效的用户 home：测试注入优先，生产为 os.homedir()；供配置读取与 skills 分发等需要 home 的能力统一复用
export function getHomeDir(): string {
  return homeOverride ?? homedir()
}

// 配置降级告警去重集合：同一进程内同一个键只提示一次（getConfigSection 有多个落点调用，不去重会刷屏）
const warnedConfigFallbacks = new Set<string>()

// 配置降级告警：显式配置却无法采纳时提示一次（走 stderr，stdout 留给机器可读输出）
function warnConfigFallback(key: string, detail: string): void {
  if (warnedConfigFallbacks.has(key)) return
  warnedConfigFallbacks.add(key)
  console.warn(`⚠️ 忽略配置项「${key}」：${detail}，已按未配置处理`)
}

// 读取并解析单个配置文件：不存在返回 null；JSON 非法（含顶层非对象）告警后按未配置处理；BOM 一并剥离
function readConfigFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null
  try {
    // 读盘即剥离 BOM，否则配置会被静默跳过
    const parsed: unknown = JSON.parse(readTextFile(filePath))
    if (typeof parsed !== "object" || parsed === null) {
      warnConfigFallback(filePath, `顶层须为对象（实际：${parsed === null ? "null" : typeof parsed}）`)
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    warnConfigFallback(filePath, "JSON 解析失败")
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
  const globalCfg = readConfigFile(join(getHomeDir(), ".toolkitrc.json"))
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

// 取某个能力域的配置段（对象）：不存在返回 undefined；显式配置但类型不符时告警后按未配置处理
export function getConfigSection(name: string): Record<string, unknown> | undefined {
  const cfg = loadToolkitConfig()
  if (!cfg) return undefined
  const section = cfg[name]
  if (section === undefined) return undefined
  if (typeof section === "object" && section !== null) return section as Record<string, unknown>
  warnConfigFallback(name, `配置段须为对象（实际：${typeof section}）`)
  return undefined
}

// 解析任务目录三档：CLI --dir 显式传参 > 配置 tasks.dir > 默认 .tasks
// 支持 .tasks 放项目外（绝对路径或 ../ 相对路径），配合独立文档仓库管理任务
export function resolveTasksDir(cliValue?: string): string {
  if (cliValue) return cliValue
  const dir = getConfigSection("tasks")?.dir
  // 空字符串按「视为未配置」静默处理；其他类型不符才是显式配错，须告警
  if (typeof dir === "string") return dir !== "" ? dir : ".tasks"
  if (dir !== undefined) warnConfigFallback("tasks.dir", `须为非空字符串（实际：${typeof dir}）`)
  return ".tasks"
}

// 失效配置缓存：库形态长驻进程 / 测试中修改 .toolkitrc.json 后调用，使下次读取重新加载
export function resetToolkitConfigCache(): void {
  cached = undefined
  // 告警去重集合同步清空，使重新加载后的降级问题仍能提示
  warnedConfigFallbacks.clear()
}
