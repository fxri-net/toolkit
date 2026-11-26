// 迁移应用：按迁移项执行具体改写，全部写前先进入备份会话
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { upgradeConventions } from "../conventions/upgrade"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { BackupSession } from "./backup"
import { LEGACY_PREPARE_SCRIPTS } from "../tasks/init"
import { commandMigrationRows } from "../command-registry"
import { findProjectRoot } from "../scope/paths"
import { removeSkills } from "../skills/install/global"
import { removeProjectSkills } from "../skills/install/project"
import { planConfigContent, type ConfigPlanOptions } from "./config-plan"
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

// 改写单个配置文件：先算计划，仅在内容确有变化时调用 beforeWrite 备份并落盘
export function rewriteConfigFile(file: string, options: ConfigPlanOptions & { beforeWrite?: (file: string) => void } = {}): { changed: boolean; manual: string[] } {
  const planned = planConfigContent(file, options)
  if (planned.changed && planned.content !== undefined) {
    options.beforeWrite?.(file)
    writeFileAtomic(file, planned.content)
  }
  return { changed: planned.changed, manual: planned.manual }
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
// 与配置文件同口径：先算内容，再由调用方决定写盘或仅预览
export function planPackageContent(file: string): { changed: boolean; content?: string; manual: string[] } {
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
  return { changed, content: `${JSON.stringify(pkg, null, indent)}\n`, manual }
}

// 改写 package.json：计算后落盘，仅在确有变化时备份
export function rewritePackage(file: string, options: { beforeWrite?: (file: string) => void } = {}): { changed: boolean; manual: string[] } {
  const planned = planPackageContent(file)
  if (planned.changed && planned.content !== undefined) {
    options.beforeWrite?.(file)
    writeFileAtomic(file, planned.content)
  }
  return { changed: planned.changed, manual: planned.manual }
}

// 规范载体目录下的 markdown 清单：备份与新建文件比对共用
function conventionFiles(tasksDir: string): string[] {
  const dir = join(tasksDir, "conventions")
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name))
}

// 应用单个迁移项：返回需人工说明；配置与 package 仅在确有变化时进入备份会话
function applyItem(
  item: UpgradeItem,
  cwd: string,
  tasksDir: string,
  session: BackupSession,
  options: { dropLegacy?: boolean },
): { manual: string[] } {
  if (item.surface === "config") {
    const captured = new Set<string>()
    const beforeWrite = (file: string): void => {
      if (captured.has(file)) return
      captured.add(file)
      session.capture([file])
    }
    const results = item.files.map((file) => rewriteConfigFile(file, { dropLegacy: options.dropLegacy, layer: item.layers[0], beforeWrite }))
    return { manual: results.flatMap((result) => result.manual) }
  }
  if (item.id === "project:package") {
    const captured = new Set<string>()
    const beforeWrite = (file: string): void => {
      if (captured.has(file)) return
      captured.add(file)
      session.capture([file])
    }
    return { manual: item.files.flatMap((file) => rewritePackage(file, { beforeWrite }).manual) }
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
export function applyUpgrade(
  items: UpgradeItem[],
  options: { cwd: string; tasksDir: string; scope?: "project" | "global"; dropLegacy?: boolean },
): UpgradeApplyResult {
  const session = new BackupSession(options.cwd, options.scope ?? "project")
  const result: UpgradeApplyResult = { applied: [], failed: [], backups: [] }
  for (const item of items) {
    if (item.status === "manual") continue
    try {
      const outcome = applyItem(item, options.cwd, options.tasksDir, session, { dropLegacy: options.dropLegacy })
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
