// 技能安装偏好：skillsInstall 只读全局层（~/.toolkitrc.json），projectSkills 只读项目层（.toolkitrc.json）
// 本地层 .toolkitrc.local.json 不参与技能安装偏好；误写层的取值一律告警并按未配置处理
// 写配置只合并目标段、原子写、写前备份，写后重置配置缓存
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { getHomeDir, inspectConfigLayers, resetToolkitConfigCache } from "../config"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { BUILTIN_SOURCE } from "./types"

// 外部来源登记：本地来源记 root（绝对路径），远程来源记 url 与可选 ref
export interface ExternalSourceConfig {
  root?: string
  url?: string
  ref?: string
}

// 全局段：targets 为 agent name 数组；sources 为外部来源登记；selection 为「来源 → 技能名数组」
export interface SkillsInstallConfig {
  targets?: string[]
  sources?: Record<string, ExternalSourceConfig>
  selection?: Record<string, string[]>
}

// 项目段：targets 为项目相对目录数组；selection 为技能名数组（项目面只有内置源）
export interface ProjectSkillsConfig {
  targets?: string[]
  selection?: string[]
}

// 告警去重集合：同一进程内同一个「文件 + 段 + 原因」只提示一次，避免 status 多次读取刷屏
const warned = new Set<string>()

// 重置告警去重集合（测试用：配置文件现场变化后重新提示）
export function resetSkillsConfigWarnings(): void {
  warned.clear()
}

// 段级误写告警：说清忽略了什么、该写在哪一层
function warnMisplaced(section: string, file: string | null, expected: string): void {
  const key = `${file ?? ""}\u0000${section}\u0000layer`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`⚠️ 忽略配置段「${section}」${file ? `（${file}）` : ""}：该段仅支持${expected}，本地层不参与技能安装偏好`)
}

// 字段类型非法告警：能继续执行则告警后按未配置处理（降级不静默）
function warnInvalid(section: string, field: string, file: string | null, detail: string): void {
  const key = `${file ?? ""}\u0000${section}.${field}`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`⚠️ 忽略配置项「${section}.${field}」${file ? `（${file}）` : ""}：${detail}，已按未配置处理`)
}

// 普通对象判定：null 与数组不算配置段 / 字段对象
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 字符串数组解析：非数组整体丢弃；数组内非字符串与空串逐个剔除并告警
function parseStringArray(section: string, field: string, value: unknown, file: string | null): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    warnInvalid(section, field, file, "须为字符串数组")
    return undefined
  }
  const names = value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim())
  if (names.length !== value.length) warnInvalid(section, field, file, "含非字符串或空串条目，已剔除")
  return [...new Set(names)]
}

// selection 解析：来源 → 技能名数组；非法来源名与非字符串条目逐个剔除并告警
function parseSourceSelection(value: unknown, file: string | null): Record<string, string[]> | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    warnInvalid("skillsInstall", "selection", file, "须为「来源 → 技能名数组」对象")
    return undefined
  }
  const out: Record<string, string[]> = {}
  for (const [source, names] of Object.entries(value)) {
    const parsed = parseStringArray("skillsInstall", `selection.${source}`, names, file)
    if (parsed !== undefined) out[source] = parsed
  }
  return out
}

// sources 解析：来源名 → { root }；值非对象或缺 root 剔除并告警
function parseSources(value: unknown, file: string | null): Record<string, ExternalSourceConfig> | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    warnInvalid("skillsInstall", "sources", file, "须为「来源名 → 来源配置」对象")
    return undefined
  }
  const out: Record<string, ExternalSourceConfig> = {}
  for (const [name, source] of Object.entries(value)) {
    if (!isPlainObject(source)) {
      warnInvalid("skillsInstall", `sources.${name}`, file, "来源配置须为对象且包含非空 root 或 url")
      continue
    }
    const root = typeof source.root === "string" && source.root.trim() !== "" ? source.root.trim() : undefined
    const url = typeof source.url === "string" && source.url.trim() !== "" ? source.url.trim() : undefined
    if (!root && !url) {
      warnInvalid("skillsInstall", `sources.${name}`, file, "来源配置须包含非空 root 或 url")
      continue
    }
    const ref = typeof source.ref === "string" && source.ref.trim() !== "" ? source.ref.trim() : undefined
    out[name] = { root, url, ref }
  }
  return out
}

// 读取全局技能安装偏好：只取全局层；项目层 / 本地层误写时告警并忽略
export function readSkillsInstallConfig(startDir = process.cwd()): SkillsInstallConfig {
  const layers = inspectConfigLayers(startDir)
  if (layers.project.config?.skillsInstall !== undefined) warnMisplaced("skillsInstall", layers.project.file, "全局层（~/.toolkitrc.json）")
  if (layers.local.config?.skillsInstall !== undefined) warnMisplaced("skillsInstall", layers.local.file, "全局层（~/.toolkitrc.json）")
  const section = layers.global.config?.skillsInstall
  if (!isPlainObject(section)) return {}
  return {
    targets: parseStringArray("skillsInstall", "targets", section.targets, layers.global.file),
    sources: parseSources(section.sources, layers.global.file),
    selection: parseSourceSelection(section.selection, layers.global.file),
  }
}

// 读取项目技能安装偏好：只取项目层；全局层 / 本地层误写时告警并忽略
export function readProjectSkillsConfig(cwd = process.cwd()): ProjectSkillsConfig {
  const layers = inspectConfigLayers(cwd)
  if (layers.global.config?.projectSkills !== undefined) warnMisplaced("projectSkills", layers.global.file, "项目层（.toolkitrc.json）")
  if (layers.local.config?.projectSkills !== undefined) warnMisplaced("projectSkills", layers.local.file, "项目层（.toolkitrc.json）")
  const section = layers.project.config?.projectSkills
  if (!isPlainObject(section)) return {}
  return {
    targets: parseStringArray("projectSkills", "targets", section.targets, layers.project.file),
    selection: parseStringArray("projectSkills", "selection", section.selection, layers.project.file),
  }
}

// 取内置源的选择集：未保存过选择时返回 undefined，由调用方回落「全部技能」
export function readSavedSelection(config: SkillsInstallConfig): string[] | undefined {
  return config.selection?.[BUILTIN_SOURCE]
}

// 读取配置文件根对象：不存在返回空对象；解析失败或顶层非对象则报错（不覆盖用户配置）
function readConfigRoot(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  const parsed = JSON.parse(readTextFile(file)) as unknown
  if (!isPlainObject(parsed)) throw new Error(`配置文件顶层须为对象：${file}`)
  return parsed
}

// 合并写入目标段：只改目标段，其余段与同段内其他字段原样保留；patch 中值为 undefined 的键表示删除
function writeConfigSection(file: string, sectionName: string, patch: Record<string, unknown>): void {
  const root = readConfigRoot(file)
  const current = root[sectionName]
  const section: Record<string, unknown> = isPlainObject(current) ? { ...current } : {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete section[key]
    else section[key] = value
  }
  if (Object.keys(section).length === 0) delete root[sectionName]
  else root[sectionName] = section
  if (existsSync(file)) copyFileSync(file, `${file}.bak`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileAtomic(file, `${JSON.stringify(root, null, 2)}\n`)
  resetToolkitConfigCache()
}

// 写全局技能安装偏好：只合并 skillsInstall 段；写入失败向上抛出，由调用方决定是否继续
export function writeSkillsInstallConfig(patch: Partial<SkillsInstallConfig>): void {
  writeConfigSection(join(getHomeDir(), ".toolkitrc.json"), "skillsInstall", patch as Record<string, unknown>)
}

// 写项目技能安装偏好：定位最近的项目层配置；不存在则在 cwd 下新建
export function writeProjectSkillsConfig(patch: Partial<ProjectSkillsConfig>, cwd = process.cwd()): void {
  const layers = inspectConfigLayers(cwd)
  const file = layers.project.file ?? join(resolve(cwd), ".toolkitrc.json")
  writeConfigSection(file, "projectSkills", patch as Record<string, unknown>)
}
