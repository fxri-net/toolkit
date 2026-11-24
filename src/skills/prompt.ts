// 技能选择：纯函数负责「已保存选择 / 显式参数 / 非 TTY 回落」，交互层只做 TTY 下的多选
// core 技能默认选中且不可取消；optional 可切换；只有一个可选层级时跳过交互
import type { PackageSkill, SkillsMode, SkillTarget } from "./types"
import { BUILTIN_SOURCE, CANONICAL_LABEL } from "./types"
import { LIST_PAGE_SIZE, loadPrompts } from "../prompts"
import { askCheckbox, askConfirm } from "../cli-ui"
import { formatChoiceLine, terminalColumns } from "../prompt-line"
import { displayWidth } from "../text-line"
import { formatSkillChoice } from "./format"

// 交互层技能条目：来源名由收集层（SkillItem）带入，纯包内调用可省略
export type PromptSkill = PackageSkill & { source?: string }

// 单个技能在交互界面中的选项
export interface SkillChoice {
  name: string
  // 简介：选择列表里跟在名称后展示，缺省为空串
  description: string
  tier: PackageSkill["tier"]
  selected: boolean
}

// 分组选项：title 为分隔行文案，choices 为该组技能
export interface SkillChoiceGroup {
  title: string
  choices: SkillChoice[]
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
  mode?: SkillsMode
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

// 交互选项：skills 模式 core 恒选中；package 模式全部按已保存选择回显（未保存过时全不选）
// 分组顺序：包内（core 在前、optional 在后）→ 各外部来源按来源名排序；组内按技能名升序
export function groupSkillChoices(skills: PromptSkill[], saved?: string[], mode: SkillsMode = "skills"): SkillChoiceGroup[] {
  const savedSet = new Set(saved ?? [])
  const sourceOf = (skill: PromptSkill): string => skill.source?.trim() || BUILTIN_SOURCE
  const byName = (a: PromptSkill, b: PromptSkill): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const toChoice = (skill: PromptSkill): SkillChoice => ({
    name: skill.name,
    description: skill.description ?? "",
    tier: skill.tier,
    selected: mode === "skills" ? skill.tier === "core" || savedSet.has(skill.name) : savedSet.has(skill.name),
  })

  const builtin = skills.filter((skill) => sourceOf(skill) === BUILTIN_SOURCE)
  const core = builtin.filter((skill) => skill.tier === "core").sort(byName)
  const optional = builtin.filter((skill) => skill.tier !== "core").sort(byName)
  const groups: SkillChoiceGroup[] = []
  if (mode === "package") {
    // package 模式 core 也可取消，合并为一个「包内」组，不写「必装」
    const all = [...core, ...optional]
    if (all.length > 0) groups.push({ title: "包内", choices: all.map(toChoice) })
  } else {
    if (core.length > 0) groups.push({ title: "包内 · 必装", choices: core.map(toChoice) })
    if (optional.length > 0) groups.push({ title: "包内 · 可选", choices: optional.map(toChoice) })
  }

  const external = skills.filter((skill) => sourceOf(skill) !== BUILTIN_SOURCE)
  const sourceNames = [...new Set(external.map(sourceOf))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  for (const source of sourceNames) {
    const items = external.filter((skill) => sourceOf(skill) === source).sort(byName)
    groups.push({ title: source, choices: items.map(toChoice) })
  }
  return groups
}

// 交互选项（扁平）：顺序与分组一致，供非交互消费与既有调用面复用
export function buildSkillChoices(skills: PromptSkill[], saved?: string[], mode: SkillsMode = "skills"): SkillChoice[] {
  return groupSkillChoices(skills, saved, mode).flatMap((group) => group.choices)
}

// 过滤出包内存在的技能名并去重，保持包内顺序
function knownNames(skills: PackageSkill[], names: string[]): string[] {
  const wanted = new Set(names)
  return skills.filter((skill) => wanted.has(skill.name)).map((skill) => skill.name)
}

// 升序并集：skills 模式 core 始终包含；package 模式不强制
function withCore(skills: PackageSkill[], names: string[], mode: SkillsMode = "skills"): string[] {
  const set = new Set(mode === "skills" ? [...coreSkillNames(skills), ...names] : names)
  return skills.filter((skill) => set.has(skill.name)).map((skill) => skill.name)
}

// 解析技能选择：显式参数优先，其次已保存选择，首次（无保存）只装 core
// TTY 下且未用 --yes / 未显式传参时标记 needsPrompt，由调用方进入交互；非 TTY 一律按已保存选择
export function planSkillSelection(input: SkillSelectionInput): SkillSelectionPlan {
  const { skills, saved, explicit, all, noOptional, interactive, yes } = input
  const mode = input.mode ?? "skills"
  const allNames = skills.map((skill) => skill.name)
  if (explicit !== undefined) {
    const names = knownNames(skills, explicit)
    const invalid = explicit.filter((name) => !allNames.includes(name))
    if (names.length === 0) return { names: [], invalid, savedInvalid: [], needsPrompt: false, error: "全部取值非法" }
    return { names: withCore(skills, names, mode), invalid, savedInvalid: [], needsPrompt: false }
  }
  if (all) return { names: allNames, invalid: [], savedInvalid: [], needsPrompt: false }
  if (noOptional) return { names: coreSkillNames(skills), invalid: [], savedInvalid: [], needsPrompt: false }

  // 区分「已保存为空数组」与「未保存」：package 模式显式空选择即零装
  const hasSaved = saved !== undefined
  const savedValid = knownNames(skills, saved ?? [])
  const savedInvalid = (saved ?? []).filter((name) => !allNames.includes(name))
  const base =
    mode === "package"
      ? hasSaved
        ? savedValid
        : []
      : savedValid.length > 0
        ? withCore(skills, savedValid, mode)
        : coreSkillNames(skills)
  // package 模式下全部技能都可切换，即使没有 optional 也可交互
  const needsPrompt = interactive && !yes && (mode === "package" ? skills.length > 0 : optionalSkillNames(skills).length > 0)
  return { names: base, invalid: [], savedInvalid, needsPrompt }
}

// 目标选择项：value 全局面为 canonical / agent name，项目面为仓库相对目录；group 用于分隔小标题
export interface TargetChoice {
  value: string
  group: string
  label: string
  checked: boolean
  disabled?: boolean | string
}

// 全局目标选择项：按 canonical → 已检测 agent → 自定义目录排序；未检测到的已保存 agent 置灰保留，避免选择静默丢失
export function buildGlobalTargetChoices(all: SkillTarget[], saved: string[] | undefined, extraDirs: string[] = []): TargetChoice[] {
  const savedSet = saved ? new Set(saved) : undefined
  const choices: TargetChoice[] = []
  const canonical = all.find((target) => target.kind === "primary")
  if (canonical) {
    choices.push({
      value: canonical.name,
      group: "主目标",
      label: CANONICAL_LABEL,
      checked: savedSet ? savedSet.has(canonical.name) : true,
    })
  }
  for (const target of all.filter((item) => item.kind === "agent")) {
    // 未检测到的 agent 只在曾经选过时列出，避免把内置表全部未安装项堆进交互
    if (!target.available && !savedSet?.has(target.name)) continue
    choices.push({
      value: target.name,
      group: "agent",
      label: target.label,
      checked: target.available ? (savedSet ? savedSet.has(target.name) : true) : false,
      disabled: target.available ? false : "本机未检测到该 agent，不凭空创建目录",
    })
  }
  const custom = new Set(extraDirs)
  for (const target of all.filter((item) => item.kind === "custom" && custom.has(item.dir))) {
    choices.push({
      value: target.dir,
      group: "自定义（一次性）",
      label: target.dir,
      checked: true,
      disabled: "一次性 --dir，本次固定写入、不保存为长期选择",
    })
  }
  return choices
}

// 项目目标选择项：只列已存在的候选目录；已保存但目录不存在者置灰提示，--dir 追加项固定勾选
export function buildProjectTargetChoices(
  available: string[],
  saved: string[] | undefined,
  extraDirs: string[] = [],
  missing: string[] = [],
): TargetChoice[] {
  const savedSet = saved ? new Set(saved) : undefined
  const choices: TargetChoice[] = available.map((dir) => ({
    value: dir,
    group: "项目目录",
    label: dir,
    checked: savedSet ? savedSet.has(dir) : true,
  }))
  for (const dir of missing) {
    if (!savedSet?.has(dir)) continue
    choices.push({ value: dir, group: "已保存（目录不存在）", label: dir, checked: false, disabled: "目录不存在，补齐后重跑即可" })
  }
  for (const dir of extraDirs) {
    if (available.includes(dir)) continue
    choices.push({
      value: dir,
      group: "自定义（一次性）",
      label: dir,
      checked: true,
      disabled: "一次性 --dir，本次固定写入、不保存为长期选择",
    })
  }
  return choices
}

// 目标多选：返回选中值；ESC 返回 null（调用方决定回上一步或取消），Ctrl+C 由上层统一按 130 结束
export async function promptTargetSelection(choices: TargetChoice[], message: string): Promise<string[] | null> {
  if (choices.length === 0) return []
  // 按 group 聚合稳定分组；多组时插入分隔标题，单组保持扁平
  const groups = new Map<string, TargetChoice[]>()
  for (const choice of choices) {
    const list = groups.get(choice.group)
    if (list) list.push(choice)
    else groups.set(choice.group, [choice])
  }
  const { Separator } = await loadPrompts()
  const columns = terminalColumns()
  const rows = [...groups].flatMap(([title, items]) => {
    const mapped = items.map((choice) => {
      // 禁用原因由 inquirer 追加在行尾，预算须一并扣除
      const reasonWidth = typeof choice.disabled === "string" ? 1 + displayWidth(choice.disabled) : 0
      const asPath = ["自定义（一次性）", "项目目录", "已保存（目录不存在）"].includes(choice.group)
      return {
        value: choice.value,
        name: formatChoiceLine({ name: choice.label, reserved: 5 + reasonWidth, columns, path: asPath }),
        checked: choice.checked,
        disabled: choice.disabled ?? false,
      }
    })
    return groups.size > 1 ? [new Separator(`── ${title} ──`), ...mapped] : mapped
  })
  // 目标选择是安装流程第二步：ESC 退回技能选择
  return askCheckbox({ message, choices: rows, pageSize: LIST_PAGE_SIZE, escape: "back" })
}

// 汇总确认：返回 true 继续、false 放弃、null 按 ESC 返回上一步；破坏性操作应传 defaultValue = false
export async function promptConfirm(message: string, defaultValue = true): Promise<boolean | null> {
  return askConfirm({ message, default: defaultValue })
}

// 卸载候选项：value 带面 / 类型前缀，保证跨面同名可区分；group 用于分组展示
export interface UninstallChoice {
  value: string
  group: string
  label: string
  // 简介：行内暗色单行展示，缺省时只显示名称
  description?: string
}

// 卸载多选：按面分组，行内名称 + 暗色单行简介；答案行用「面｜名称」保留归属
export async function promptUninstallSelection(choices: UninstallChoice[]): Promise<string[] | null> {
  const { Separator } = await loadPrompts()
  const columns = terminalColumns()
  const groups = new Map<string, UninstallChoice[]>()
  for (const choice of choices) {
    const list = groups.get(choice.group)
    if (list) list.push(choice)
    else groups.set(choice.group, [choice])
  }
  const rows = [...groups].flatMap(([title, items]) => {
    const mapped = items.map((item) => ({
      value: item.value,
      // 3 为光标 + 勾选符 + 空格，2 为名称与简介之间的间隔
      name: formatChoiceLine({ name: item.label, description: item.description, reserved: 5, columns }),
      short: `${title}｜${item.label}`,
    }))
    return groups.size > 1 ? [new Separator(`── ${title} ──`), ...mapped] : mapped
  })
  return askCheckbox({
    message: "选择要卸载的技能（空格切换，回车确认）",
    choices: rows,
    pageSize: LIST_PAGE_SIZE,
    escape: "cancel",
  })
}

// TTY 多选：core 默认选中且禁用切换；分组多于一个时插入来源 / 层级分隔行；返回 null 表示用户取消（调用方不得写任何文件）
export async function promptSkillSelection(skills: PromptSkill[], saved?: string[], mode: SkillsMode = "skills"): Promise<string[] | null> {
  const groups = groupSkillChoices(skills, saved, mode)
  const { Separator } = await loadPrompts()
  const columns = terminalColumns()
  const choices = groups.flatMap((group) => {
    const items = group.choices.map((choice) => {
      const reason = mode === "skills" && choice.tier === "core" ? "必装，不可取消" : ""
      // 3 为光标 + 勾选符 + 空格，2 为名称与简介之间的间隔；禁用原因由 inquirer 追加在行尾
      const reserved = 5 + (reason ? 1 + displayWidth(reason) : 0)
      return {
        value: choice.name,
        name: formatSkillChoice(choice.name, choice.description ?? "", { reserved, columns }),
        short: choice.name,
        checked: choice.selected,
        disabled: reason || false,
      }
    })
    // 单组时不加标题，保持原列表观感；多组用分隔行标注来源与层级
    return groups.length > 1 ? [new Separator(`── ${group.title} ──`), ...items] : items
  })
  const message = mode === "package" ? "选择要安装的技能（空格切换，回车确认；全不选即纯包管理器模式）" : "选择要安装的技能（空格切换，回车确认；必装项不可取消）"
  const picked = await askCheckbox({ message, choices, pageSize: LIST_PAGE_SIZE, escape: "cancel" })
  if (picked === null) return null
  return mode === "package" ? picked : withCore(skills, picked)
}
