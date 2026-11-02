// 技能选择：纯函数负责「已保存选择 / 显式参数 / 非 TTY 回落」，交互层只做 TTY 下的多选
// core 技能默认选中且不可取消；optional 可切换；只有一个可选层级时跳过交互
import type { PackageSkill } from "./types"

// 单个技能在交互界面中的选项
export interface SkillChoice {
  name: string
  tier: PackageSkill["tier"]
  selected: boolean
}

// 选择解析结果：error 非空表示显式取值全部非法，调用方应报错退出
export interface SkillSelectionPlan {
  names: string[]
  // 显式传入但不在包内的技能名
  invalid: string[]
  // 已保存选择中已不在包内的技能名
  savedInvalid: string[]
  needsPrompt: boolean
  error?: string
}

export interface SkillSelectionInput {
  skills: PackageSkill[]
  saved?: string[]
  explicit?: string[]
  all?: boolean
  noOptional?: boolean
  interactive: boolean
  yes: boolean
}

// core 技能名（保持包内顺序）
export function coreSkillNames(skills: PackageSkill[]): string[] {
  return skills.filter((skill) => skill.tier === "core").map((skill) => skill.name)
}

// 可选技能名（保持包内顺序）
export function optionalSkillNames(skills: PackageSkill[]): string[] {
  return skills.filter((skill) => skill.tier !== "core").map((skill) => skill.name)
}

// 交互选项：core 恒选中；optional 按已保存选择回显（未保存过时只选 core）
export function buildSkillChoices(skills: PackageSkill[], saved?: string[]): SkillChoice[] {
  const savedSet = new Set(saved ?? [])
  return skills.map((skill) => ({
    name: skill.name,
    tier: skill.tier,
    selected: skill.tier === "core" || savedSet.has(skill.name),
  }))
}

// 过滤出包内存在的技能名并去重，保持包内顺序
function knownNames(skills: PackageSkill[], names: string[]): string[] {
  const wanted = new Set(names)
  return skills.filter((skill) => wanted.has(skill.name)).map((skill) => skill.name)
}

// 升序并集：core 始终包含
function withCore(skills: PackageSkill[], names: string[]): string[] {
  const set = new Set([...coreSkillNames(skills), ...names])
  return skills.filter((skill) => set.has(skill.name)).map((skill) => skill.name)
}

// 解析技能选择：显式参数优先，其次已保存选择，首次（无保存）只装 core
// TTY 下且未用 --yes / 未显式传参时标记 needsPrompt，由调用方进入交互；非 TTY 一律按已保存选择
export function planSkillSelection(input: SkillSelectionInput): SkillSelectionPlan {
  const { skills, saved, explicit, all, noOptional, interactive, yes } = input
  const allNames = skills.map((skill) => skill.name)
  if (explicit !== undefined) {
    const names = knownNames(skills, explicit)
    const invalid = explicit.filter((name) => !allNames.includes(name))
    if (names.length === 0) return { names: [], invalid, savedInvalid: [], needsPrompt: false, error: "全部取值非法" }
    return { names: withCore(skills, names), invalid, savedInvalid: [], needsPrompt: false }
  }
  if (all) return { names: allNames, invalid: [], savedInvalid: [], needsPrompt: false }
  if (noOptional) return { names: coreSkillNames(skills), invalid: [], savedInvalid: [], needsPrompt: false }

  const savedValid = knownNames(skills, saved ?? [])
  const savedInvalid = (saved ?? []).filter((name) => !allNames.includes(name))
  const base = savedValid.length > 0 ? withCore(skills, savedValid) : coreSkillNames(skills)
  // 只有一个层级（无 optional）时没有可切换项，直接跳过交互
  const needsPrompt = interactive && !yes && optionalSkillNames(skills).length > 0
  return { names: base, invalid: [], savedInvalid, needsPrompt }
}

// 是否处于可交互 TTY：stdin 与 stdout 同时为 TTY 才启用方向键多选
export function isInteractiveTty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

// 判断是否用户取消（Ctrl+C / ESC）：inquirer 以 ExitPromptError / AbortPromptError 抛出
function isPromptCancel(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === "ExitPromptError" || error.name === "AbortPromptError" || /force closed|cancel/i.test(error.message)
}

// TTY 多选：core 默认选中且禁用切换；返回 null 表示用户取消（调用方不得写任何文件）
export async function promptSkillSelection(skills: PackageSkill[], saved?: string[]): Promise<string[] | null> {
  const { checkbox } = await import("@inquirer/prompts")
  const choices = buildSkillChoices(skills, saved).map((choice) => ({
    value: choice.name,
    name: choice.tier === "core" ? `${choice.name}（core）` : choice.name,
    checked: choice.selected,
    disabled: choice.tier === "core" ? "core（必装）" : false,
  }))
  try {
    const picked = await checkbox({
      message: "选择要安装的技能（空格切换，回车确认；core 必装）",
      choices,
      pageSize: 12,
      required: false,
    })
    return withCore(skills, picked)
  } catch (error) {
    if (isPromptCancel(error)) return null
    throw error
  }
}
