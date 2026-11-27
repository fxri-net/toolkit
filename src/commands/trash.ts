// 项目内回收站：查看 / 恢复 / 按策略清理用户可见删除
import type { Command } from "commander"
import { assertJsonFormat, jsonEnvelope } from "../json-output"
import { askConfirm } from "../cli-ui"
import { isInteractive } from "../prompts"
import { line, style } from "../term-style"
import { printJson } from "./shared"
import { isHomeDirectory } from "../scope/paths"
import { listTrash, pruneTrash, restoreTrash, statsTrash, type TrashEntry, type TrashScopeChoice } from "../trash/store"

interface CommonOptions {
  scope?: string
  format?: string
}

function parseScope(value: string | undefined): TrashScopeChoice | null {
  if (value === undefined || value === "all") return "all"
  if (value === "project" || value === "global") return value
  console.error(`⚠️ --scope 只接受 项目面（project）/ 全局面（global）/ 全部（all）（实际：${value}）`)
  process.exitCode = 1
  return null
}

function parseCount(value: string | undefined, label: string): number | undefined | false {
  if (value === undefined) return undefined
  if (!/^\d+$/.test(value.trim())) {
    console.error(`⚠️ ${label} 只接受非负整数（实际：${value}）`)
    process.exitCode = 1
    return false
  }
  return Number(value)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function scopeLabel(scope: TrashScopeChoice): string {
  return scope === "all" ? "全部" : scope === "project" ? "项目" : "全局"
}

function printEntries(entries: TrashEntry[], scope: TrashScopeChoice): void {
  if (entries.length === 0) {
    console.log(line.hint(`回收站为空（${scopeLabel(scope)}）`))
    return
  }
  console.log(`回收站条目（${scopeLabel(scope)}，共 ${entries.length} 条）：`)
  for (const entry of entries) {
    const status = entry.status === "partial" ? "  部分失败" : ""
    console.log(`  ${style.accent(entry.id)}  ${entry.createdAt}  ${entry.scope}  ${entry.command}  ${entry.files} 项 / ${formatBytes(entry.bytes)}${status}`)
  }
  console.log(line.hint("恢复：toolkit trash restore <id>（或 latest）；彻底清理：toolkit trash prune --all"))
}

// 过滤：按来源命令精确匹配、按自然日截止
function filterEntries(entries: TrashEntry[], command?: string, olderThan?: number): TrashEntry[] {
  const cutoff = olderThan === undefined ? Number.NaN : Date.now() - olderThan * 86_400_000
  return entries.filter((entry) => {
    if (command && entry.command !== command) return false
    if (olderThan !== undefined && Date.parse(entry.createdAt) >= cutoff) return false
    return true
  })
}

export function registerTrashCommands(program: Command): void {
  const trashCmd = program.command("trash").description("项目内回收站：查看、恢复与清理用户可见删除（默认列出条目）")

  const addCommon = (cmd: Command): Command =>
    cmd.option("--scope <scope>", "作用域：项目面（project）/ 全局面（global）/ 全部（all，两者；缺省 all）").option("--format <format>", "输出格式（json，输出到 stdout）")

  addCommon(trashCmd).action((options: CommonOptions) => {
    const scope = parseScope(options.scope)
    if (scope === null || !assertJsonFormat(options.format)) return
    const entries = listTrash(process.cwd(), scope)
    if (options.format === "json") {
      printJson(jsonEnvelope({ command: "trash", data: { scope, entries } }))
      return
    }
    printEntries(entries, scope)
  })

  addCommon(trashCmd.command("list").description("列出回收站条目（按时间倒序）"))
    .option("--command <name>", "按来源命令精确过滤（如 skill uninstall）")
    .option("--older-than <days>", "只看早于指定天数的条目")
    .action((options: CommonOptions & { command?: string; olderThan?: string }) => {
      const scope = parseScope(options.scope)
      const olderThan = parseCount(options.olderThan, "--older-than")
      if (scope === null || olderThan === false || !assertJsonFormat(options.format)) return
      const entries = filterEntries(listTrash(process.cwd(), scope), options.command, olderThan)
      if (options.format === "json") {
        printJson(jsonEnvelope({ command: "trash list", data: { scope, command: options.command ?? null, olderThan: olderThan ?? null, entries } }))
        return
      }
      printEntries(entries, scope)
    })

  addCommon(trashCmd.command("restore [id]").description("恢复回收站条目；省略 id 取最近一次"))
    .option("--to <dir>", "恢复到指定目录（替换原根，保留条目内相对结构）")
    .option("--overwrite", "目标已存在时覆盖（先收进回收站，不直接删除）")
    .option("--dry-run", "只预览，不移动 / 删除")
    .action((id: string | undefined, options: CommonOptions & { to?: string; overwrite?: boolean; dryRun?: boolean }) => {
      const scope = parseScope(options.scope)
      if (scope === null || !assertJsonFormat(options.format)) return
      try {
        const result = restoreTrash(process.cwd(), id ?? "latest", {
          scope,
          to: options.to,
          overwrite: Boolean(options.overwrite),
          dryRun: Boolean(options.dryRun),
        })
        if (options.format === "json") {
          printJson(jsonEnvelope({ command: "trash restore", data: result }))
          return
        }
        const tag = options.dryRun ? "[预演] " : ""
        const failed = result.failed.length > 0 ? `，失败 ${result.failed.length} 项` : ""
        console.log(`${tag}恢复 ${result.id}：${result.restored.length} 项，跳过 ${result.skipped.length} 项${failed}`)
        for (const file of result.restored) console.log(`  ${tag}还原 ${file}`)
        for (const item of result.failed) console.error(`⚠️ 失败 ${item.path}：${item.message}`)
        if (result.skipped.length > 0) console.error(`⚠️ 跳过 ${result.skipped.length} 项（目标已存在、路径越界或链接悬空）`)
        if (result.failed.length > 0) process.exitCode = 1
      } catch (error) {
        console.error(`⚠️ 恢复失败：${(error as Error).message}`)
        process.exitCode = 1
      }
    })

  addCommon(trashCmd.command("prune").description("按策略彻底清理回收站条目（不自动执行）"))
    .option("--keep <n>", "每个回收站根保留最近 n 条")
    .option("--older-than <days>", "清理早于指定天数的条目")
    .option("--all", "清空当前作用域内全部条目")
    .option("--dry-run", "只预览，不删除")
    .option("--yes", "非交互环境确认执行")
    .action(async (options: CommonOptions & { keep?: string; olderThan?: string; all?: boolean; dryRun?: boolean; yes?: boolean }) => {
      const scope = options.scope === undefined ? null : parseScope(options.scope)
      const keep = parseCount(options.keep, "--keep")
      const olderThan = parseCount(options.olderThan, "--older-than")
      if ((options.scope !== undefined && scope === null) || keep === false || olderThan === false || !assertJsonFormat(options.format)) return
      const selected = [keep !== undefined, olderThan !== undefined, Boolean(options.all)].filter(Boolean).length
      if (selected !== 1) {
        console.error("⚠️ 请且只指定一种清理方式：--keep <n> / --older-than <days> / --all")
        process.exitCode = 1
        return
      }
      if (!options.dryRun && !options.yes) {
        if (!isInteractive()) {
          console.error("⚠️ 非交互环境执行清理需显式加 --yes，未执行清理")
          process.exitCode = 1
          return
        }
        const ok = await askConfirm({ message: "确认彻底清理所选回收站条目？", default: false })
        if (!ok) return
      }
      const effectiveScope = options.scope === undefined ? (isHomeDirectory(process.cwd()) ? "global" : "project") : scope!
      const result = pruneTrash(process.cwd(), { scope: effectiveScope, keep, olderThan, all: Boolean(options.all), dryRun: Boolean(options.dryRun) })
      if (options.format === "json") {
        printJson(jsonEnvelope({ command: "trash prune", data: result }))
        return
      }
      const tag = options.dryRun ? "[预演] " : ""
      console.log(`${tag}清理 ${result.removed.length} 条，保留 ${result.kept.length} 条`)
      for (const id of result.removed) console.log(`  ${tag}清理 ${id}`)
    })

  addCommon(trashCmd.command("stats").description("只读统计回收站条数与占用"))
    .action((options: CommonOptions) => {
      const scope = parseScope(options.scope)
      if (scope === null || !assertJsonFormat(options.format)) return
      const data = statsTrash(process.cwd(), scope)
      if (options.format === "json") {
        printJson(jsonEnvelope({ command: "trash stats", data }))
        return
      }
      console.log(`回收站统计（${scopeLabel(scope)}）：${data.entries} 条 / ${formatBytes(data.bytes)}`)
      if (data.oldest && data.newest) console.log(line.hint(`最旧 ${data.oldest}，最新 ${data.newest}`))
      for (const [command, count] of Object.entries(data.byCommand)) console.log(`  ${command}：${count} 条`)
    })
}
