import { readFileSync, mkdirSync, unlinkSync, existsSync, readdirSync, rmdirSync } from "node:fs"
import { join, basename, dirname, resolve, sep } from "node:path"
import { parseFrontmatter, stripFrontmatter } from "./parse"
import { listTaskFiles, dateFromFileName } from "./scan"
import { DONE_STATUSES } from "./types"
import { redactText } from "../privacy/redact"
import { writeFileAtomic } from "../write-atomic"
import type { ArchiveBlock, ArchiveResult, ArchiveOptions } from "./types"
import { normalizeCompleted, parseArchiveBlocks, renderBlock } from "./archive-block"
import { acquireArchiveLock, releaseArchiveLock } from "./lock"

// 删除空目录，并从父目录往上递归清理，直到 stopDir 或遇到非空目录
function removeEmptyDirs(dir: string, stopDir: string) {
  let current = resolve(dir)
  const stop = resolve(stopDir)
  while (current !== stop && current.startsWith(stop + sep)) {
    try {
      if (readdirSync(current).length > 0) break
      rmdirSync(current)
    } catch {
      break
    }
    current = dirname(current)
  }
}

// 解析归档文件里的任务块，返回 { block, completed } 数组（统一解析 + 渲染，块集合与 normalize 一致）
export function parseArchiveTasks(file: string): ArchiveBlock[] {
  const content = readFileSync(file, "utf8")
  const { blocks } = parseArchiveBlocks(content)
  return blocks.map((b) => ({ block: renderBlock(b), completed: b.completed }))
}

// 归档：任务级，将「已完成/已放弃」的任务按完成时间归组排序后写入归档文件
export function archiveTasks(tasksDir = ".tasks", redact = true, options: ArchiveOptions = {}): ArchiveResult {
  const { dryRun = false, warn = true } = options
  const activeDir = join(tasksDir, "active")
  const archiveDir = join(tasksDir, "archive")
  const warnings: string[] = []
  const files = listTaskFiles(activeDir)
  if (files.length === 0) {
    console.log("当前无活跃任务，无需归档")
    return { archived: 0, skipped: [], warnings }
  }

  // 收集本次可归档的任务（状态已终结且带完成时间）
  const doneTasks: Array<{ file: string; name: string; owner: string; status: string; scope: string; completed: string; body: string }> = []
  const skipped: string[] = []
  for (const file of files) {
    const content = readFileSync(file, "utf8")
    const fm = parseFrontmatter(content)
    if (!DONE_STATUSES.includes(fm.status as never)) continue
    const completed = normalizeCompleted(fm.completed || "")
    if (!completed) {
      skipped.push(basename(file, ".md"))
      console.log(`跳过 ${basename(file, ".md")}：缺少 completed 完成时间`)
      continue
    }
    doneTasks.push({
      file,
      name: basename(file, ".md"),
      owner: fm.owner || "未标注",
      status: fm.status || "未标注",
      scope: fm.scope || "-",
      completed,
      body: stripFrontmatter(content).trim(),
    })
  }

  if (doneTasks.length === 0) {
    console.log("本次无可归档任务")
    return { archived: 0, skipped, warnings }
  }

  // 软告警：完成时间与创建日不一致（日期漂移）
  if (warn) {
    for (const t of doneTasks) {
      const completedDate = t.completed.replace(/-/g, "").slice(0, 8)
      const createdDate = dateFromFileName(t.file)
      if (createdDate && completedDate !== createdDate) {
        warnings.push(`任务「${t.name}」完成时间 ${t.completed} 与创建日 ${createdDate} 不一致，请确认 completed 是否填错`)
      }
    }
  }

  // 按完成时间日期（YYYYMMDD）分组
  const byDate: Record<string, typeof doneTasks> = {}
  for (const t of doneTasks) {
    const date = t.completed.replace(/-/g, "").slice(0, 8)
    ;(byDate[date] ||= []).push(t)
  }

  // 非预演时获取排他锁（陈旧锁自动清理），防止并发归档互相覆盖
  let lockFd: number | null = null
  if (!dryRun) {
    lockFd = acquireArchiveLock(tasksDir)
    if (lockFd === null) {
      const msg = "检测到归档锁 .archive.lock，可能有并发归档正在进行，本次已跳过"
      console.warn(`⚠️ ${msg}`)
      return { archived: 0, skipped, warnings: [...warnings, msg] }
    }
  }

  try {
    let archivedOk = 0
    const failures: string[] = []
    for (const [date, newTasks] of Object.entries(byDate)) {
      const monthDir = join(archiveDir, date.slice(0, 6))
      const archiveFile = join(monthDir, `${date}.md`)

      // 合并已有归档任务 + 本次新任务；文件已存在时保留其自定义 header（不覆盖导入/手写引言）
      // 排序键统一定宽规范化后按完成时间降序（最新在前）
      let header = `# ${date} 归档\n\n> 本文件由 \`toolkit tasks archive\` 自动生成。`
      const all: ArchiveBlock[] = []
      if (existsSync(archiveFile)) {
        const parsed = parseArchiveBlocks(readFileSync(archiveFile, "utf8"))
        if (parsed.header) header = parsed.header
        for (const b of parsed.blocks) all.push({ block: renderBlock(b), completed: b.completed })
      }

      // 软告警：归档文件已存在同名任务（疑似重复归档）
      if (warn) {
        const existingNames = new Set(all.map((b) => b.block.match(/^## (.+)/)?.[1] ?? ""))
        for (const t of newTasks) {
          if (existingNames.has(t.name)) {
            warnings.push(`归档文件已存在同名任务「${t.name}」，疑似重复归档`)
          }
        }
      }

      all.push(
        ...newTasks.map((t) => ({
          block: `## ${t.name}\n\n> 负责人：${t.owner}　状态：${t.status}　范围：${t.scope}　完成时间：${t.completed}\n\n${redactText(t.body, redact)}`,
          completed: t.completed,
        })),
      )
      for (const item of all) item.completed = normalizeCompleted(item.completed)
      all.sort((a, b) => b.completed.localeCompare(a.completed))

      // 预演模式：只打印将要写入的内容，不落盘、不删除 active
      if (dryRun) {
        console.log(`[预演] 将归档 ${newTasks.length} 个任务 → ${date}.md`)
        for (const t of newTasks) console.log(`[预演]   - ${t.name}`)
        continue
      }

      // 单日归档写盘 + 清理 active；失败时记入 failures 并继续处理其余日期，收尾统一汇总（K5）
      try {
        mkdirSync(monthDir, { recursive: true })
        writeFileAtomic(archiveFile, `${header}\n\n${all.map((t) => t.block).join("\n\n---\n\n")}\n`)

        // 删除本次已归档的 active 文件
        for (const t of newTasks) unlinkSync(t.file)
        // 清理空目录（active/年月/ 及其上层 active/）
        removeEmptyDirs(dirname(newTasks[0].file), tasksDir)
        console.log(`已归档 ${newTasks.length} 个任务 → ${date}.md`)
        archivedOk++
      } catch (e) {
        failures.push(`${date}.md：${(e as Error).message}`)
      }
    }

    // 软告警输出（不阻断）
    for (const w of warnings) console.warn(`⚠️ ${w}`)

    if (failures.length > 0) {
      console.error(`归档失败 ${failures.length} 个日期文件（active 未删除，可重试）：`)
      for (const f of failures) console.error(`  - ${f}`)
    }
    if (dryRun) console.log(`[预演] 共 ${doneTasks.length} 个任务可归档（未落盘）`)
    else console.log(`共归档 ${archivedOk} 个任务${failures.length > 0 ? `，失败 ${failures.length} 个` : ""}`)
    return { archived: dryRun ? doneTasks.length : archivedOk, skipped, warnings }
  } finally {
    // 释放归档锁
    if (lockFd !== null) {
      try {
        releaseArchiveLock(tasksDir, lockFd)
      } catch {
        // 锁文件已被清理，忽略
      }
    }
  }
}
