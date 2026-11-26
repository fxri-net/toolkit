// 配置改写计划：段名迁移、旧闸门键映射与误放层段清理，供检测、预览与落盘共用同一份转换
import { CONFIG_LEGACY_SECTIONS } from "../config"
import { readTextFile } from "../read-text"
import { SKILL_SECTION_LAYERS } from "../skills/config"
import type { UpgradeLayer } from "./types"

// 配置改写选项：pruneLegacy 删除已被忽略的旧段 / 误放段；layer 用于判定段归属与提示命令
export interface ConfigPlanOptions {
  pruneLegacy?: boolean
  layer?: UpgradeLayer
}

// 读 JSON 对象：解析失败或顶层非对象返回 null，由调用方按人工项处理
function readObject(file: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readTextFile(file))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// 对象深比较：只用于新旧段「是否等价」的判定，不做语义推断
function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

// 层中文名：提示文案用，与全局层 / 项目层 / 本地层三词一致
export function layerLabel(layer: UpgradeLayer): string {
  return layer === "global" ? "全局层" : layer === "project" ? "项目层" : "本地层"
}

// 段归属层清单：用于判断某段写在当前层是否会被读取
// （旧段改名不依赖归属，避免把 skillsInstall.gate 这类可映射为 skillDelivery 的旧写法误删）

// 旧闸门键转新段：布尔值转 default，include / exclude 转 rules 并保留排除优先
function gateToDelivery(gate: unknown): Record<string, unknown> | null {
  if (typeof gate === "boolean") return { default: gate ? "gated" : "full" }
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) return null
  const raw = gate as Record<string, unknown>
  const include = Array.isArray(raw.include) && raw.include.length > 0 ? raw.include.filter((item): item is string => typeof item === "string") : ["*"]
  const exclude = Array.isArray(raw.exclude) ? raw.exclude.filter((item): item is string => typeof item === "string") : []
  return {
    rules: [
      ...include.map((pattern) => ({ match: [pattern], delivery: "gated" })),
      ...exclude.map((pattern) => ({ match: [pattern], delivery: "full" })),
    ],
  }
}

// 单段提示后缀：给出可执行的清理命令，避免用户只能手改 JSON
function cleanupCommand(layer: UpgradeLayer | undefined): string {
  return layer ? `toolkit upgrade --only config:${layer} --prune-legacy` : "toolkit upgrade --prune-legacy"
}

// 重写单个配置文件：段名整体搬移，旧闸门键映射，误放层段按归属清理
// 返回结果不写盘，供 upgrade --diff 预览与真正写入共用同一份转换
export function planConfigContent(file: string, options: ConfigPlanOptions = {}): { changed: boolean; content?: string; manual: string[] } {
  const data = readObject(file)
  if (!data) return { changed: false, manual: [`配置文件解析失败，未改写：${file}`] }
  const layer = options.layer
  const originalKeys = Object.keys(data)
  const manual: string[] = []
  let changed = false
  for (const [legacy, canonical] of Object.entries(CONFIG_LEGACY_SECTIONS)) {
    if (!(legacy in data)) continue
    if (canonical in data) {
      if (sameValue(data[canonical], data[legacy])) {
        delete data[legacy]
        changed = true
      } else if (options.pruneLegacy) {
        delete data[legacy]
        changed = true
      } else {
        manual.push(
          `段「${legacy}」与「${canonical}」内容不同（旧段已被忽略）：旧段 ${JSON.stringify(data[legacy])} / 新段 ${JSON.stringify(data[canonical])}；保留新段可执行 ${cleanupCommand(layer)}，保留旧段内容请先手工合并`,
        )
      }
      continue
    }
    data[canonical] = data[legacy]
    delete data[legacy]
    changed = true
  }
  const section = data.skillInstall
  if (section && typeof section === "object" && !Array.isArray(section)) {
    const legacy = section as Record<string, unknown>
    if ("gate" in legacy) {
      const delivery = gateToDelivery(legacy.gate)
      if (delivery && data.skillDelivery === undefined) {
        data.skillDelivery = delivery
        delete legacy.gate
        changed = true
        if (Object.keys(legacy).length === 0) delete data.skillInstall
      } else if (data.skillDelivery !== undefined) {
        // 新段已接管：旧键本就被忽略，直接删除
        delete legacy.gate
        changed = true
        if (Object.keys(legacy).length === 0) delete data.skillInstall
      } else {
        manual.push("skillInstall.gate 形态无法识别，保留原键并交人工确认")
      }
    }
  }
  // 误放层的新段：本层不读取的段按归属清理（skillInstall 仅全局层、projectSkill 仅项目层）
  // 放在闸门映射之后：映射后整段已空的 skillInstall 不应再报「写错层」
  if (layer) {
    for (const [name, owners] of Object.entries(SKILL_SECTION_LAYERS)) {
      if (!(name in data) || owners.includes(layer)) continue
      if (options.pruneLegacy) {
        delete data[name]
        changed = true
      } else {
        manual.push(`段「${name}」写错层（${layerLabel(layer)}不读取，已忽略）；确认不需要时执行 ${cleanupCommand(layer)} 删除`)
      }
    }
  }
  if (!changed) return { changed, manual }
  // 按键序重建：旧段在原位置换成新段，闸门映射出的新段占据旧段位置，其余新键追加
  const ordered: Record<string, unknown> = {}
  for (const key of originalKeys) {
    if (key in data) {
      ordered[key] = data[key]
      continue
    }
    const canonical = CONFIG_LEGACY_SECTIONS[key]
    if (canonical && canonical in data && !(canonical in ordered)) {
      ordered[canonical] = data[canonical]
      continue
    }
    if ((key === "skillInstall" || key === "skillsInstall") && data.skillDelivery !== undefined) {
      ordered.skillDelivery = data.skillDelivery
    }
  }
  for (const [key, value] of Object.entries(data)) {
    if (!(key in ordered)) ordered[key] = value
  }
  return { changed, content: `${JSON.stringify(ordered, null, 2)}\n`, manual }
}
