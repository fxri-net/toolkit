// 技能版本更新检测：只读状态文件与包内 / 来源缓存真源版本，不联网
import { existsSync } from "node:fs"
import { join } from "node:path"
import { versionGt } from "../version"
import { listPackageSkills, readSkillVersion } from "./source"
import { readProjectState, readSkillsState } from "./state"
import { resolveProjectTargets } from "./source"
import type { SkillsState, SkillStateEntry } from "./types"

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

// 版本不可比条目：missing 标明缺的是来源侧还是已装侧
export interface SkillUnknownInfo {
  name: string
  source: string
  installed: string
  missing: "latest" | "installed"
  temporary: boolean
}

// 技能版本报告：内置与外部来源分开，未知版本单列
export interface SkillVersionReport {
  builtin: SkillUpdateInfo[]
  external: SkillUpdateInfo[]
  unknown: SkillUnknownInfo[]
  sources: SkillSourceVersionInfo[]
}

// 来源累积信息：多目标登记时取最低已安装版本，任一目标落后即可提示
interface SourceAccumulator {
  version: string
  root: string
  temporary: boolean
  versions: Map<string, string>
}

// 已装版本取证：link 模式内容随真源升级，直接读目标目录的 SKILL.md；
// copy / shell 是独立产物，不会随包更新，仍以状态登记为准
function installedVersion(targetDir: string, entry: SkillStateEntry): string {
  if (entry.mode !== "link") return entry.version
  return readSkillVersion(join(targetDir, entry.name)) || entry.version
}

// 合并状态文件来源：全局与项目状态同构，按来源名聚合技能与已安装版本
function accumulate(states: Array<SkillsState | null>): Map<string, SourceAccumulator> {
  const result = new Map<string, SourceAccumulator>()
  for (const state of states) {
    if (!state) continue
    for (const [sourceName, source] of Object.entries(state.sources)) {
      const acc = result.get(sourceName) ?? { version: "", root: "", temporary: false, versions: new Map<string, string>() }
      if (source.version && !acc.version) acc.version = source.version
      if (source.root && !acc.root) acc.root = source.root
      acc.temporary = acc.temporary || source.temporary
      for (const target of source.targets) {
        for (const entry of target.entries) {
          const installed = installedVersion(target.dir, entry)
          const current = acc.versions.get(entry.name) ?? ""
          if (!current || versionGt(current, installed)) acc.versions.set(entry.name, installed)
        }
      }
      result.set(sourceName, acc)
    }
  }
  return result
}

// 从来源缓存目录读取技能真源版本：兼容 <root>/skills/<name> 与 <root>/<name> 两种布局
function readVersionFromSource(root: string, name: string): string {
  if (!root) return ""
  for (const dir of [join(root, "skills", name), join(root, name)]) {
    if (existsSync(join(dir, "SKILL.md"))) return readSkillVersion(dir)
  }
  return ""
}

// 检测技能版本：内置源对比包内真源；外部来源对比缓存目录内的技能版本
// 外部来源不再用「来源级版本」冒充技能版本——两者独立编号，比较结果会永久显示落后
export function collectSkillVersionUpdates(cwd = process.cwd()): SkillVersionReport {
  const packageVersions = new Map(listPackageSkills().map((skill) => [skill.name, skill.version]))
  const root = resolveProjectTargets(cwd).root
  const accumulated = accumulate([readSkillsState(), readProjectState(root)])
  const builtin: SkillUpdateInfo[] = []
  const external: SkillUpdateInfo[] = []
  const unknown: SkillUnknownInfo[] = []
  for (const [sourceName, acc] of accumulated) {
    for (const [name, installed] of acc.versions) {
      const latest = sourceName === "toolkit" ? packageVersions.get(name) ?? "" : readVersionFromSource(acc.root, name)
      if (!latest || !installed) {
        unknown.push({ name, source: sourceName, installed, missing: latest ? "installed" : "latest", temporary: acc.temporary })
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
