// 本机路径归一：项目级 opt-in，默认 off；业务仓库保留本地路径时不产生任何变化
import { getConfigSection } from "../config"

// 档位单源：off 不处理 / warn 只提示 / error 由扫描与任务校验阻断
export const LOCAL_PATH_LEVELS = ["off", "warn", "error"] as const
export type LocalPathLevel = (typeof LOCAL_PATH_LEVELS)[number]

// 盘符路径与 POSIX 用户主目录路径：占位符（<本机> / ~/ / %USERPROFILE%）不会被匹配；
// 通配规则（含 `*` / `?`）与裸目录写法（如 `/Users/`）原样保留，避免把文档里的规则示例改坏
const WINDOWS_PATH = /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s`"'()<>|，。；：、]*/g
const POSIX_HOME_PATH = /(?:\/Users|\/home)\/[^\s`"'()<>|，。；：、*?]+/g

// 读取档位：未配置即 off；非法取值告警后按 off 处理（降级不静默）
export function resolveLocalPathLevel(): LocalPathLevel {
  const raw = getConfigSection("privacy")?.localPaths
  if (raw === undefined) return "off"
  if (typeof raw === "string" && (LOCAL_PATH_LEVELS as readonly string[]).includes(raw)) return raw as LocalPathLevel
  console.warn(`⚠️ privacy.localPaths 取值非法（${String(raw)}），已按关闭（off）处理`)
  return "off"
}

// 末段名：保留可辨识的文件 / 目录名，盘符段不算
function lastSegment(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part !== "" && !/^[A-Za-z]:$/.test(part))
  return parts.at(-1) ?? ""
}

// 归一：盘符 → <本机>/…/末段，POSIX 用户主目录 → ~/…/末段；结果不含原始路径，重复执行不再命中
export function normalizeLocalPaths(text: string): { text: string; count: number } {
  let count = 0
  const out = text
    .replace(WINDOWS_PATH, (match) => {
      // 通配 / glob 规则是写作示例，不归一
      if (/[*?]/.test(match)) return match
      count += 1
      const tail = lastSegment(match)
      return tail ? `<本机>/…/${tail}` : "<本机>/…"
    })
    .replace(POSIX_HOME_PATH, (match) => {
      count += 1
      const tail = lastSegment(match)
      return tail ? `~/…/${tail}` : "~/…"
    })
  return { text: out, count }
}

// 单条路径命中：value 为原文片段，kind 区分盘符与 POSIX 用户主目录
export interface LocalPathHit {
  value: string
  kind: "windows" | "posix-home"
}

// 查找（不改写）：供扫描与任务校验使用；通配与裸目录写法同样跳过
export function findLocalPaths(text: string): LocalPathHit[] {
  const hits: LocalPathHit[] = []
  for (const match of text.matchAll(new RegExp(WINDOWS_PATH.source, "g"))) {
    if (/[*?]/.test(match[0])) continue
    hits.push({ value: match[0], kind: "windows" })
  }
  for (const match of text.matchAll(new RegExp(POSIX_HOME_PATH.source, "g"))) {
    hits.push({ value: match[0], kind: "posix-home" })
  }
  return hits
}

// 写盘前归一：档位为 off 时原样返回，保证业务仓库行为与升级前一致
export function normalizeIfEnabled(text: string): { text: string; count: number } {
  if (resolveLocalPathLevel() === "off") return { text, count: 0 }
  return normalizeLocalPaths(text)
}

// 归一结果提示：有改动才输出，诊断走 stderr
export function reportNormalizedPaths(count: number): void {
  if (count > 0) console.warn(`⚠️ 已归一 ${count} 处本机路径（privacy.localPaths）`)
}
