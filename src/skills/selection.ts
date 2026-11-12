// 已保存技能选择的解析：按来源回显、曾用名（previousNames）迁移、整份名单失效时按默认口径重算
// 安装与状态共用同一口径，避免全局面与项目面各自实现导致行为分叉
import type { SkillTier } from "./types"

// 判定所需的技能视图：统一技能条目与状态侧的轻量视图均可满足
export interface SelectionSkill {
  name: string
  source: string
  sourceKind: "builtin" | "local"
  tier: SkillTier
  previousNames: string[]
}

// 失效名单：source 为空串表示项目面平铺名单；whole 表示整份名单都已失效
export interface ExpiredSelection {
  source: string
  // 已保存但当前不存在的名字
  missing: string[]
  whole: boolean
  // 整份失效时按默认口径重算出的名单
  rebased: string[]
}

export interface SavedSelectionResult {
  // 平铺的有效名单；undefined 表示未保存过选择，由调用方按模式默认处理
  saved?: string[]
  // 发生迁移或重算的来源名单，供 install 写回配置；status 只读不写
  migrated: Record<string, string[]>
  expired: ExpiredSelection[]
}

// 曾用名映射：旧名 → 现用名；唯一性已由 assertUniqueSkillNames 保证
function aliasMap(skills: SelectionSkill[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const skill of skills) {
    for (const old of skill.previousNames) if (!map.has(old)) map.set(old, skill.name)
  }
  return map
}

// 去重并保持首次出现顺序
function unique(names: string[]): string[] {
  return [...new Set(names)]
}

// 默认口径：有 core 取 core，否则取全部（外部来源为全选）
function defaultNames(skills: SelectionSkill[]): string[] {
  const core = skills.filter((skill) => skill.tier === "core").map((skill) => skill.name)
  return core.length > 0 ? core : skills.map((skill) => skill.name)
}

// 按来源分组：保持技能条目原顺序
function groupBySource(skills: SelectionSkill[]): Map<string, SelectionSkill[]> {
  const out = new Map<string, SelectionSkill[]>()
  for (const skill of skills) {
    const list = out.get(skill.source) ?? []
    list.push(skill)
    out.set(skill.source, list)
  }
  return out
}

// 全局面：按来源回显已保存名单；来源键缺省视为未保存（默认全选，避免新增来源被漏装）
export function resolveSavedSelection(skills: SelectionSkill[], savedBySource: Record<string, string[]> | undefined): SavedSelectionResult {
  if (!savedBySource || Object.keys(savedBySource).length === 0) return { migrated: {}, expired: [] }
  const alias = aliasMap(skills)
  const selected = new Set<string>()
  const migrated: Record<string, string[]> = {}
  const expired: ExpiredSelection[] = []
  for (const [source, list] of groupBySource(skills)) {
    const raw = savedBySource[source]
    if (raw === undefined) {
      for (const skill of list) selected.add(skill.name)
      continue
    }
    const names = new Set(list.map((skill) => skill.name))
    const mapped = unique(raw.map((name) => alias.get(name) ?? name))
    const valid = mapped.filter((name) => names.has(name))
    const missing = mapped.filter((name) => !names.has(name))
    // 整份名单失效（整体改名 / 重构）：按默认口径重算，避免新技能静默漏装
    if (mapped.length > 0 && valid.length === 0) {
      const rebased = defaultNames(list)
      for (const name of rebased) selected.add(name)
      migrated[source] = rebased
      expired.push({ source, missing, whole: true, rebased })
      continue
    }
    for (const name of valid) selected.add(name)
    if (missing.length > 0) expired.push({ source, missing, whole: false, rebased: [] })
    if (valid.length !== raw.length || valid.some((name, index) => name !== raw[index])) migrated[source] = valid
  }
  return { saved: skills.filter((skill) => selected.has(skill.name)).map((skill) => skill.name), migrated, expired }
}

// 项目面：名单是平铺的（无来源维度），外部来源技能默认选中，与既有口径一致
export function resolveSavedProjectSelection(skills: SelectionSkill[], saved: string[] | undefined): SavedSelectionResult {
  if (saved === undefined || saved.length === 0) return { migrated: {}, expired: [] }
  const alias = aliasMap(skills)
  const names = new Set(skills.map((skill) => skill.name))
  const mapped = unique(saved.map((name) => alias.get(name) ?? name))
  const valid = mapped.filter((name) => names.has(name))
  const missing = mapped.filter((name) => !names.has(name))
  if (mapped.length > 0 && valid.length === 0) {
    const rebased = skills.filter((skill) => skill.sourceKind !== "builtin" || skill.tier === "core").map((skill) => skill.name)
    return { saved: rebased, migrated: {}, expired: [{ source: "", missing, whole: true, rebased }] }
  }
  const selected = new Set([...valid, ...skills.filter((skill) => skill.sourceKind !== "builtin").map((skill) => skill.name)])
  return {
    saved: skills.filter((skill) => selected.has(skill.name)).map((skill) => skill.name),
    migrated: {},
    expired: missing.length > 0 ? [{ source: "", missing, whole: false, rebased: [] }] : [],
  }
}

// 失效提示文案：整份失效说明重算结果，部分失效只说明被忽略的名字；source 为空串按项目面措辞
export function expiredSelectionWarnings(result: SavedSelectionResult): string[] {
  return result.expired.map((item) => {
    const scope = item.source === "" ? "项目面" : `来源 ${item.source}`
    return item.whole
      ? `⚠️ ${scope} 的已保存技能选择已失效（${item.missing.join("、")} 均不存在），已按默认口径重算：${item.rebased.join("、") || "无"}`
      : `⚠️ ${scope} 的已保存技能选择含不存在的技能：${item.missing.join("、")}（已忽略）`
  })
}
