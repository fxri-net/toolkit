// 技能版本更新检测：只读状态文件与包内真源版本，不扫技能目录、不联网
import { versionGt } from "../version"
import { listPackageSkills } from "./source"
import { readProjectState, readSkillsState } from "./state"
import { resolveProjectTargets } from "./source"
import type { SkillsState } from "./types"

// 单个可更新技能：installed 为已安装版本，latest 为来源 / 包内真源版本
export interface SkillUpdateInfo {
  name: string
  installed: string
  latest: string
  source: string
  temporary: boolean
}

// 外部来源版本状态：供 skills status 展示
export interface SkillSourceVersionInfo {
  name: string
  version: string
  temporary: boolean
  skills: string[]
}

// 技能版本报告：内置与外部来源分开，未知版本单列
export interface SkillVersionReport {
  builtin: SkillUpdateInfo[]
  external: SkillUpdateInfo[]
  unknown: Array<{ name: string; source: string; installed: string; temporary: boolean }>
  sources: SkillSourceVersionInfo[]
}

// 来源累积信息：多目标登记时取最低已安装版本，任一目标落后即可提示
interface SourceAccumulator {
  version: string
  temporary: boolean
  versions: Map<string, string>
}

// 合并状态文件来源：全局与项目状态同构，按来源名聚合技能与已安装版本
function accumulate(states: Array<SkillsState | null>): Map<string, SourceAccumulator> {
  const result = new Map<string, SourceAccumulator>()
  for (const state of states) {
    if (!state) continue
    for (const [sourceName, source] of Object.entries(state.sources)) {
      const acc = result.get(sourceName) ?? { version: "", temporary: false, versions: new Map<string, string>() }
      if (source.version && !acc.version) acc.version = source.version
      acc.temporary = acc.temporary || source.temporary
      for (const target of source.targets) {
        for (const entry of target.entries) {
          const current = acc.versions.get(entry.name) ?? ""
          if (!current || versionGt(current, entry.version)) acc.versions.set(entry.name, entry.version)
        }
      }
      result.set(sourceName, acc)
    }
  }
  return result
}

// 检测技能版本：内置源对比包内真源；外部来源对比状态登记的来源版本
export function collectSkillVersionUpdates(cwd = process.cwd()): SkillVersionReport {
  const packageVersions = new Map(listPackageSkills().map((skill) => [skill.name, skill.version]))
  const root = resolveProjectTargets(cwd).root
  const accumulated = accumulate([readSkillsState(), readProjectState(root)])
  const builtin: SkillUpdateInfo[] = []
  const external: SkillUpdateInfo[] = []
  const unknown: SkillVersionReport["unknown"] = []
  for (const [sourceName, acc] of accumulated) {
    for (const [name, installed] of acc.versions) {
      const latest = sourceName === "toolkit" ? packageVersions.get(name) ?? "" : acc.version
      if (!latest || !installed) {
        unknown.push({ name, source: sourceName, installed, temporary: acc.temporary })
        continue
      }
      if (!versionGt(latest, installed)) continue
      const info = { name, installed, latest, source: sourceName, temporary: acc.temporary }
      if (sourceName === "toolkit") builtin.push(info)
      else external.push(info)
    }
  }
  const sources = [...accumulated.entries()].map(([name, acc]) => ({
    name,
    version: acc.version,
    temporary: acc.temporary,
    skills: [...acc.versions.keys()],
  }))
  return { builtin, external, unknown, sources }
}
