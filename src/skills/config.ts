// 技能安装偏好：skillInstall 只读全局层（~/.toolkitrc.json），projectSkill 只读项目层（.toolkitrc.json）
// 本地层 .toolkitrc.local.json 不参与技能安装偏好；误写层的取值一律告警并按未配置处理
// 写配置只合并目标段、原子写、写前备份，写后重置配置缓存
import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { CONFIG_PROJECT_FILE, getHomeDir, inspectConfigLayers, isGlobalConfigPath, resetToolkitConfigCache } from "../config"
import { compilePattern } from "../scope/pattern"
import { findProjectRoot, isHomeDirectory } from "../scope/paths"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { DELIVERY_MODES, gateRulesToDeliveryRules, type DeliveryMode, type DeliveryRule, type SkillsDeliveryConfig } from "./delivery"
import { BUILTIN_SOURCE, type GateRules, type SkillsMode } from "./types"

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
  mode?: SkillsMode
  // 内容闸门：true / false 或 { include, exclude } 规则；开启后按规则接管技能为入口壳
  gate?: boolean | GateRules
}

// 项目段：targets 为项目相对目录数组；selection 为技能名数组（项目面只有内置源）
export interface ProjectSkillsConfig {
  targets?: string[]
  selection?: string[]
  mode?: SkillsMode
}

// 段归属层：只列只允许单一层读取的段，供升级识别「写错层」并按归属清理
export const SKILL_SECTION_LAYERS: Readonly<Record<string, readonly ("global" | "project" | "local")[]>> = {
  skillInstall: ["global"],
  projectSkill: ["project"],
}

// 告警去重集合：同一进程内同一个「文件 + 段 + 原因」只提示一次，避免 status 多次读取刷屏
const warned = new Set<string>()

// 重置告警去重集合（测试用：配置文件现场变化后重新提示）
export function resetSkillsConfigWarnings(): void {
  warned.clear()
}

// 段级误写告警：说清忽略了什么、该写在哪一层，并给出清理入口
function warnMisplaced(section: string, file: string | null, expected: string, actual: string): void {
  const key = `${file ?? ""}\u0000${section}\u0000layer`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(
    `⚠️ 忽略配置段「${section}」${file ? `（${file}）` : ""}：该段仅支持${expected}，${actual}不参与读取；请移到${expected}，或运行 toolkit upgrade --drop-legacy 清理`,
  )
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
    warnInvalid("skillInstall", "selection", file, "须为「来源 → 技能名数组」对象")
    return undefined
  }
  const out: Record<string, string[]> = {}
  for (const [source, names] of Object.entries(value)) {
    const parsed = parseStringArray("skillInstall", `selection.${source}`, names, file)
    if (parsed !== undefined) out[source] = parsed
  }
  return out
}

// sources 解析：来源名 → { root }；值非对象或缺 root 剔除并告警
function parseSources(value: unknown, file: string | null): Record<string, ExternalSourceConfig> | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    warnInvalid("skillInstall", "sources", file, "须为「来源名 → 来源配置」对象")
    return undefined
  }
  const out: Record<string, ExternalSourceConfig> = {}
  for (const [name, source] of Object.entries(value)) {
    if (!isPlainObject(source)) {
      warnInvalid("skillInstall", `sources.${name}`, file, "来源配置须为对象且包含非空 root 或 url")
      continue
    }
    const root = typeof source.root === "string" && source.root.trim() !== "" ? source.root.trim() : undefined
    const url = typeof source.url === "string" && source.url.trim() !== "" ? source.url.trim() : undefined
    if (!root && !url) {
      warnInvalid("skillInstall", `sources.${name}`, file, "来源配置须包含非空 root 或 url")
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
  if (layers.project.config?.skillInstall !== undefined) warnMisplaced("skillInstall", layers.project.file, "全局层（~/.toolkitrc.json）", "项目层")
  if (layers.local.config?.skillInstall !== undefined) warnMisplaced("skillInstall", layers.local.file, "全局层（~/.toolkitrc.json）", "本地层")
  const section = layers.global.config?.skillInstall
  if (!isPlainObject(section)) return {}
  return {
    targets: parseStringArray("skillInstall", "targets", section.targets, layers.global.file),
    sources: parseSources(section.sources, layers.global.file),
    selection: parseSourceSelection(section.selection, layers.global.file),
    mode: parseMode("skillInstall", section.mode, layers.global.file),
    gate: parseGate(section.gate, layers.global.file),
  }
}

// 读取项目技能安装偏好：只取项目层；全局层 / 本地层误写时告警并忽略
export function readProjectSkillsConfig(cwd = process.cwd()): ProjectSkillsConfig {
  const layers = inspectConfigLayers(cwd)
  if (layers.global.config?.projectSkill !== undefined) warnMisplaced("projectSkill", layers.global.file, "项目层（.toolkitrc.json）", "全局层")
  if (layers.local.config?.projectSkill !== undefined) warnMisplaced("projectSkill", layers.local.file, "项目层（.toolkitrc.json）", "本地层")
  const section = layers.project.config?.projectSkill
  if (!isPlainObject(section)) return {}
  return {
    targets: parseStringArray("projectSkill", "targets", section.targets, layers.project.file),
    selection: parseStringArray("projectSkill", "selection", section.selection, layers.project.file),
    mode: parseMode("projectSkill", section.mode, layers.project.file),
  }
}

// 模式解析：只接受 skills / package；非法值告警后按未配置处理
function parseMode(section: string, value: unknown, file: string | null): SkillsMode | undefined {
  if (value === undefined) return undefined
  if (value === "skills" || value === "package") return value
  warnInvalid(section, "mode", file, "须为 skills 或 package")
  return undefined
}

// 内容闸门开关解析：接受布尔值或 { include, exclude } 对象；非法值告警后按未配置处理
function parseGate(value: unknown, file: string | null): boolean | GateRules | undefined {
  if (value === undefined) return undefined
  if (typeof value === "boolean") return value
  if (isPlainObject(value)) {
    return {
      include: parseGatePatterns(value.include, "include", file) ?? ["*"],
      exclude: parseGatePatterns(value.exclude, "exclude", file) ?? [],
    }
  }
  warnInvalid("skillInstall", "gate", file, "须为布尔值或 { include, exclude } 对象")
  return undefined
}

// 闸门规则数组：逐条编译校验，非法或过于复杂的规则告警剔除；字段缺省返回 undefined 由调用方取默认
function parseGatePatterns(value: unknown, field: string, file: string | null): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    warnInvalid("skillInstall", `gate.${field}`, file, "须为字符串数组")
    return undefined
  }
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      warnInvalid("skillInstall", `gate.${field}`, file, "含非字符串或空项，已剔除")
      continue
    }
    const compiled = compilePattern(item.trim())
    if (!compiled.ok) {
      warnInvalid("skillInstall", `gate.${field}`, file, `规则「${item.trim()}」${compiled.reason}，已剔除`)
      continue
    }
    out.push(item.trim())
  }
  return out
}

// 安装面：全局面读全局层 + 本地层，项目面另读项目层（段级覆盖全局、本地层字段级覆盖）
export type SkillsDeliveryFace = "global" | "project"

// 读取分发形态配置：按安装面合层后解析；旧键仅在无 skillDelivery 段时映射，读时只提示不写盘
export function readSkillsDeliveryConfig(face: SkillsDeliveryFace = "global", startDir = process.cwd()): SkillsDeliveryConfig {
  const layers = inspectConfigLayers(startDir)
  // 全局面不读项目层：项目层配置只对项目面生效，误写时告警并按未配置处理
  if (face === "global" && layers.project.config?.skillDelivery !== undefined && isPlainObject(layers.project.config.skillDelivery)) {
    warnOnce(
      `${layers.project.file ?? ""}\u0000skillDelivery\u0000global-face`,
      `⚠️ 忽略配置段「skillDelivery」${layers.project.file ? `（${layers.project.file}）` : ""}：全局面不读取项目层配置，该段仅对项目面生效`,
    )
  }
  const globalSection = asDeliverySection(layers.global.config?.skillDelivery)
  const projectSection = face === "project" ? asDeliverySection(layers.project.config?.skillDelivery) : undefined
  const localSection = asDeliverySection(layers.local.config?.skillDelivery)
  // 段级覆盖：项目层整段覆盖全局；本地层再按字段覆盖（rules 为数组，本地层写出时整体替换）
  const merged = mergeDeliverySections(projectSection ?? globalSection, localSection)
  const legacy = readLegacyGate(layers.global.config?.skillInstall)
  if (merged) {
    if (legacy) {
      warnOnce(
        "skillDelivery\u0000legacy-ignored",
        "⚠️ 忽略旧配置「skillInstall.gate」：已由配置段「skillDelivery」接管，旧键不再生效（2.1.0 起移除兼容）；可运行 toolkit upgrade --drop-legacy 清理",
      )
    }
    return parseDeliverySection(merged)
  }
  if (legacy) {
    warnOnce(
      "skillDelivery\u0000legacy-migrated",
      "⚠️ 检测到旧配置「skillInstall.gate」：已按「skillDelivery」等价值读取，建议迁移（2.1.0 起移除兼容）；可运行 toolkit upgrade --layers global 迁移",
    )
    return legacy
  }
  return { rules: [] }
}

// 只接受普通对象作为配置段：数组与标量已由配置加载统一告警剔除
function asDeliverySection(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined
}

// 段内字段级合并：本地层显式写出的字段覆盖基准段，null / undefined 视为未写
function mergeDeliverySections(
  base: Record<string, unknown> | undefined,
  overlay: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base && !overlay) return undefined
  const merged: Record<string, unknown> = { ...(base ?? {}) }
  for (const [field, value] of Object.entries(overlay ?? {})) {
    if (value === undefined || value === null) continue
    merged[field] = value
  }
  return merged
}

// 解析合并后的段：default 与 rules 各自校验，非法项告警后剔除，其余内容不影响
function parseDeliverySection(section: Record<string, unknown>): SkillsDeliveryConfig {
  return {
    default: parseDeliveryMode("default", section.default),
    rules: parseDeliveryRules(section.rules),
  }
}

// 形态枚举解析：非法取值告警一次并按未配置处理
function parseDeliveryMode(field: string, value: unknown): DeliveryMode | undefined {
  if (value === undefined) return undefined
  if (typeof value === "string" && DELIVERY_MODES.includes(value as DeliveryMode)) return value as DeliveryMode
  warnInvalid("skillDelivery", field, null, "须为 full / gated / off")
  return undefined
}

// 规则数组解析：match 逐条编译校验，非法模式与非法枚举告警剔除；无有效 match 的规则整条丢弃
function parseDeliveryRules(value: unknown): DeliveryRule[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    warnInvalid("skillDelivery", "rules", null, "须为规则数组")
    return []
  }
  const out: DeliveryRule[] = []
  value.forEach((item, index) => {
    const field = `rules[${index}]`
    if (!isPlainObject(item)) {
      warnInvalid("skillDelivery", field, null, "规则须为对象")
      return
    }
    if (!Array.isArray(item.match)) {
      warnInvalid("skillDelivery", `${field}.match`, null, "须为字符串数组")
      return
    }
    const patterns: string[] = []
    for (const raw of item.match) {
      if (typeof raw !== "string" || raw.trim() === "") {
        warnInvalid("skillDelivery", `${field}.match`, null, "含非字符串或空项，已剔除")
        continue
      }
      const compiled = compilePattern(raw.trim())
      if (!compiled.ok) {
        warnInvalid("skillDelivery", `${field}.match`, null, `规则「${raw.trim()}」${compiled.reason}，已剔除`)
        continue
      }
      patterns.push(raw.trim())
    }
    if (patterns.length === 0) {
      warnInvalid("skillDelivery", `${field}.match`, null, "无有效规则，整条规则已剔除")
      return
    }
    if (item.delivery === undefined) {
      warnInvalid("skillDelivery", `${field}.delivery`, null, "缺少 delivery")
      return
    }
    const delivery = parseDeliveryMode(`${field}.delivery`, item.delivery)
    if (delivery === undefined) return
    out.push({ match: [...new Set(patterns)], delivery, origin: "config" })
  })
  return out
}

// 旧键映射：gate 布尔值转为全局默认；include / exclude 转为等价规则并保留排除优先
function readLegacyGate(section: unknown): SkillsDeliveryConfig | undefined {
  if (!isPlainObject(section)) return undefined
  const value = section.gate
  if (value === undefined) return undefined
  if (typeof value === "boolean") return { default: value ? "gated" : "full", rules: [] }
  if (isPlainObject(value)) {
    const include = parseGatePatterns(value.include, "include", null) ?? ["*"]
    const exclude = parseGatePatterns(value.exclude, "exclude", null) ?? []
    return { rules: gateRulesToDeliveryRules({ include, exclude }) }
  }
  return undefined
}

// 告警去重：同一「文件 + 主题」只提示一次，供配置读取与状态命令复用
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(message)
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

// 写全局技能安装偏好：只合并 skillInstall 段；写入失败向上抛出，由调用方决定是否继续
export function writeSkillsInstallConfig(patch: Partial<SkillsInstallConfig>): void {
  writeConfigSection(join(getHomeDir(), ".toolkitrc.json"), "skillInstall", patch as Record<string, unknown>)
}

// 写全局分发形态默认值：只合并 skillDelivery.default，已有 rules 原样保留（gate 命令降为语法糖）
export function writeSkillsDeliveryDefault(value: DeliveryMode): void {
  writeConfigSection(join(getHomeDir(), ".toolkitrc.json"), "skillDelivery", { default: value })
}

// 写项目技能安装偏好：定位最近的项目层配置；不存在则在 cwd 下新建
// 家目录不作为项目根，且项目层不得落到全局文件（两者同址时会把 projectSkill 写进全局层）
export function writeProjectSkillsConfig(patch: Partial<ProjectSkillsConfig>, cwd = process.cwd()): void {
  if (isHomeDirectory(cwd)) {
    throw new Error("家目录不作为项目根，不能写入项目面技能配置：请进入项目仓库，或改用 --scope global")
  }
  const layers = inspectConfigLayers(cwd)
  const file = layers.project.file ?? join(resolve(cwd), ".toolkitrc.json")
  if (isGlobalConfigPath(file)) {
    throw new Error(`项目面技能配置不能写入全局文件 ${file}：请进入项目目录，或改用 --scope global`)
  }
  writeConfigSection(file, "projectSkill", patch as Record<string, unknown>)
}

// 升级提示频率：与 update-check 的取值保持一致
export type UpdateNotifyFrequency = "always" | "daily" | "weekly" | "off"

// 写单个第三方来源的提示频率：只合并 updateCheck.sources.<name>.notify，其余段原样保留
export function writeUpdateCheckSourceNotify(
  name: string,
  notify: UpdateNotifyFrequency | undefined,
  scope: "global" | "project",
  cwd = process.cwd(),
): string {
  let file: string
  if (scope === "project") {
    if (isHomeDirectory(cwd)) throw new Error("家目录不作为项目根，不能写入项目层更新提示：请进入项目目录")
    file = inspectConfigLayers(cwd).project.file ?? join(findProjectRoot(cwd), CONFIG_PROJECT_FILE)
  } else {
    file = join(getHomeDir(), ".toolkitrc.json")
  }
  const root = readConfigRoot(file)
  const section = isPlainObject(root.updateCheck) ? { ...root.updateCheck } : {}
  const sources = isPlainObject(section.sources) ? { ...section.sources } : {}
  const entry = isPlainObject(sources[name]) ? { ...sources[name] } : {}
  if (notify === undefined) delete entry.notify
  else entry.notify = notify
  if (Object.keys(entry).length === 0) delete sources[name]
  else sources[name] = entry
  section.sources = sources
  writeConfigSection(file, "updateCheck", section)
  return file
}

// 清理来源提示配置：全局与项目层同时尝试，返回实际写入的文件
export function removeUpdateCheckSource(name: string, cwd = process.cwd()): string[] {
  const files: string[] = []
  try {
    files.push(writeUpdateCheckSourceNotify(name, undefined, "global"))
  } catch {
    // 全局配置不可写时跳过，不阻断卸载
  }
  try {
    files.push(writeUpdateCheckSourceNotify(name, undefined, "project", cwd))
  } catch {
    // 非 git 仓库或项目配置不可写时跳过
  }
  return files
}
