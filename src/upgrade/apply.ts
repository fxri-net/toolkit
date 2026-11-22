// 迁移应用：按迁移项执行具体改写，全部写前先进入备份会话
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { CONFIG_LEGACY_SECTIONS } from "../config"
import { upgradeConventions } from "../conventions/upgrade"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { BackupSession } from "./backup"
import { LEGACY_PREPARE_SCRIPTS } from "../init"
import { commandMigrationRows } from "../command-registry"
import { findProjectRoot } from "../scope/paths"
import { removeSkills } from "../skills/install/global"
import { removeProjectSkills } from "../skills/install/project"
import { legacySkillNames } from "./detect"
import type { UpgradeApplyResult, UpgradeItem } from "./types"

// prepare 钩子目标写法：与 init 同源，避免两处各写一份
const PREPARE_SCRIPT = "toolkit skill install --scope project --refresh"

// 读 JSON 对象：与检测同口径，解析失败返回 null
function readObject(file: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readTextFile(file))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// 对象深比较：只用于新旧段“是否等价”的判定，不做语义推断
function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

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

// 重写单个配置文件：段名整体搬移，旧闸门键映射；段内出现未知键时整段保留并记人工
export function rewriteConfigFile(file: string): { changed: boolean; manual: string[] } {
  const data = readObject(file)
  if (!data) return { changed: false, manual: [`配置文件解析失败，未改写：${file}`] }
  const originalKeys = Object.keys(data)
  const manual: string[] = []
  let changed = false
  for (const [legacy, canonical] of Object.entries(CONFIG_LEGACY_SECTIONS)) {
    if (!(legacy in data)) continue
    if (canonical in data) {
      if (sameValue(data[canonical], data[legacy])) {
        delete data[legacy]
        changed = true
      } else {
        manual.push(`段「${legacy}」与「${canonical}」内容不同，保留新段并把旧段留给人工确认`)
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
  writeFileAtomic(file, `${JSON.stringify(ordered, null, 2)}\n`)
  return { changed, manual }
}

// 逐段改写脚本里的旧命令：只处理命令位置的 toolkit 调用，普通字符串不动
function rewriteScript(value: string): string {
  const tokens = commandMigrationRows().map((row) => ({ from: row.from, to: row.to }))
  return value
    .split(/(&&|\|\||;)/)
    .map((segment) => {
      const trimmed = segment.trim()
      if (!/^(pnpm\s+exec\s+|npx\s+)?toolkit\s+/.test(trimmed)) return segment
      let next = segment
      for (const token of tokens) {
        const pattern = new RegExp(`(\\btoolkit\\s+)${token.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
        if (pattern.test(next)) {
          next = next.replace(pattern, `$1${token.to}`)
          break
        }
      }
      return next
    })
    .join("")
}

// 重写 package.json：prepare 旧写法与 scripts 旧命令；保留原缩进与其余字段
export function rewritePackage(file: string): { changed: boolean; manual: string[] } {
  if (!existsSync(file)) return { changed: false, manual: [] }
  const raw = readTextFile(file)
  const pkg = readObject(file)
  if (!pkg) return { changed: false, manual: [`package.json 解析失败，未改写：${file}`] }
  const manual: string[] = []
  let changed = false
  const scripts = pkg.scripts && typeof pkg.scripts === "object" && !Array.isArray(pkg.scripts) ? (pkg.scripts as Record<string, unknown>) : null
  if (scripts) {
    for (const [name, value] of Object.entries(scripts)) {
      if (typeof value !== "string") continue
      if (name === "prepare" && LEGACY_PREPARE_SCRIPTS.includes(value.trim())) {
        scripts[name] = PREPARE_SCRIPT
        changed = true
        continue
      }
      const next = rewriteScript(value)
      if (next !== value) {
        scripts[name] = next
        changed = true
      }
    }
  }
  if (!changed) return { changed, manual }
  const indent = /"\s*:\s*[^\n]*\n([ \t]+)"/.exec(raw)?.[1] ?? "  "
  writeFileAtomic(file, `${JSON.stringify(pkg, null, indent)}\n`)
  return { changed, manual }
}

// 规范载体目录下的 markdown 清单：备份与新建文件比对共用
function conventionFiles(tasksDir: string): string[] {
  const dir = join(tasksDir, "conventions")
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name))
}

// 应用单个迁移项：返回是否成功与需人工说明
function applyItem(item: UpgradeItem, cwd: string, tasksDir: string, session: BackupSession): { manual: string[] } {
  if (item.surface === "config") {
    session.capture(item.files)
    return { manual: item.files.flatMap((file) => rewriteConfigFile(file).manual) }
  }
  if (item.id === "project:package") {
    session.capture(item.files)
    return { manual: item.files.flatMap((file) => rewritePackage(file).manual) }
  }
  if (item.surface === "convention") {
    const before = conventionFiles(tasksDir)
    session.capture(before)
    upgradeConventions(tasksDir)
    const after = conventionFiles(tasksDir)
    session.trackCreated(after.filter((file) => !before.includes(file)))
    return { manual: [] }
  }
  if (item.surface === "skill") {
    session.capture(item.files)
    if (item.id === "skill:global") {
      const names = legacySkillNames("global", null)
      const report = removeSkills({ skills: names })
      const foreign = report.targets.flatMap((target) => target.skippedForeign)
      return { manual: foreign.length > 0 ? [`无法确认归属的旧名目录未删除：${foreign.join("、")}`] : [] }
    }
    const names = legacySkillNames("project", findProjectRoot(cwd))
    const report = removeProjectSkills({ cwd: findProjectRoot(cwd), skills: names })
    const foreign = report.dirs.flatMap((dir) => dir.skippedForeign)
    return { manual: foreign.length > 0 ? [`无法确认归属的旧名目录未删除：${foreign.join("、")}`] : [] }
  }
  if (item.surface === "backup") {
    session.absorb(item.files)
    return { manual: [] }
  }
  return { manual: item.manualHint ? [item.manualHint] : [] }
}

// 应用整份计划：逐项执行，失败即停；手动项跳过并在结果中保留
export function applyUpgrade(items: UpgradeItem[], options: { cwd: string; tasksDir: string; scope?: "project" | "global" }): UpgradeApplyResult {
  const session = new BackupSession(options.cwd, options.scope ?? "project")
  const result: UpgradeApplyResult = { applied: [], failed: [], backups: [] }
  for (const item of items) {
    if (item.status === "manual") continue
    try {
      const outcome = applyItem(item, options.cwd, options.tasksDir, session)
      item.status = outcome.manual.length > 0 ? "manual" : "applied"
      if (outcome.manual.length > 0) item.manualHint = outcome.manual.join("；")
      else result.applied.push(item.id)
    } catch (error) {
      item.status = "failed"
      item.manualHint = error instanceof Error ? error.message : String(error)
      result.failed.push(item.id)
      break
    }
  }
  const dir = session.finalize()
  if (dir) result.backups.push(dir)
  return result
}
