// 技能列表：已装技能的名称 / 简介 / 版本 / 形态 / 目标数，供 skill list 与脚本消费
import { existsSync } from "node:fs"
import { readSkillsDeliveryConfig, readSkillsInstallConfig } from "./config"
import { deliveryModeLabel, resolveDelivery } from "./delivery"
import { derivePolicyDelivery, loadPolicyDeliveryContext } from "./policy-delivery"
import { listPackageSkills, resolveLocalSource } from "./source"
import { readSkillsState } from "./state"
import { skillsStatus } from "./status"
import { skillSummary } from "./summary"
import { BUILTIN_SOURCE, type PackageSkill } from "./types"

export interface SkillListEntry {
  name: string
  summary: string
  version: string
  // 人读形态文案：全文安装 / 入口壳 / 不安装
  form: string
  // 已写入的目标目录数
  targets: number
  installed: boolean
}

// 状态文件里的登记信息：来源不可解析时兜底简介与版本
function stateEntries(): Map<string, { summary?: string; version?: string }> {
  const out = new Map<string, { summary?: string; version?: string }>()
  for (const source of Object.values(readSkillsState()?.sources ?? {})) {
    for (const target of source.targets) {
      for (const entry of target.entries) {
        const current = out.get(entry.name) ?? {}
        out.set(entry.name, {
          summary: current.summary || entry.summary,
          version: current.version || entry.version,
        })
      }
    }
  }
  return out
}

// 候选技能真源：包内 + 已登记外部来源（远程来源读本机缓存）；来源不可解析则跳过，简介交状态登记兜底
function candidateSkills(): Map<string, PackageSkill> {
  const out = new Map(listPackageSkills().map((skill) => [skill.name, skill]))
  const state = readSkillsState()
  const configured = readSkillsInstallConfig().sources ?? {}
  for (const name of new Set([...Object.keys(configured), ...Object.keys(state?.sources ?? {})])) {
    if (name === BUILTIN_SOURCE) continue
    const entry = configured[name]
    const location = entry?.url ? state?.sources[name]?.root : entry?.root ?? state?.sources[name]?.root
    if (!location || !existsSync(location)) continue
    try {
      for (const skill of resolveLocalSource(location, { name, temporary: false }).skills) {
        if (!out.has(skill.name)) out.set(skill.name, skill)
      }
    } catch {
      // 来源失效不阻断列表：该来源技能的简介与版本由状态登记兜底
    }
  }
  return out
}

// 列表入口：默认只列已装；all 为真时并上包内未装技能
export function buildSkillList(options: { all?: boolean } = {}): SkillListEntry[] {
  const status = skillsStatus()
  const packages = candidateSkills()
  const registered = stateEntries()
  const installed = new Map<string, { targets: number; version: string }>()
  for (const target of status.targets) {
    for (const item of target.items) {
      // 未选择与缺失不算已装；异常产物仍列出，交由对应命令处置
      if (item.state === "not-selected" || item.state === "missing") continue
      const current = installed.get(item.name) ?? { targets: 0, version: item.version }
      current.targets += 1
      installed.set(item.name, current)
    }
  }
  const names = options.all
    ? [...new Set([...packages.keys(), ...installed.keys()])].sort()
    : [...installed.keys()].sort()
  const policyContext = loadPolicyDeliveryContext()
  const config = readSkillsDeliveryConfig("global")
  return names.map((name) => {
    const pkg = packages.get(name)
    const recorded = registered.get(name)
    const summary = (pkg?.description ? skillSummary(pkg.description) : "") || recorded?.summary || ""
    const form = resolveDelivery({ name, config, policy: derivePolicyDelivery(name, policyContext) }).mode
    return {
      name,
      summary,
      version: pkg?.version || installed.get(name)?.version || recorded?.version || "",
      form: deliveryModeLabel(form),
      targets: installed.get(name)?.targets ?? 0,
      installed: installed.has(name),
    }
  })
}
