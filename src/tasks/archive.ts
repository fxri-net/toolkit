import { readFileSync, mkdirSync, unlinkSync, existsSync, readdirSync, rmdirSync } from "node:fs"
import { join, basename, dirname, resolve, sep } from "node:path"
import { parseFrontmatter, stripFrontmatter } from "./parse"
import { listTaskFiles, dateFromFileName } from "./scan"
import { DONE_STATUSES } from "./types"
import { redactText } from "../privacy/redact"
import { isBeyondTzFuture } from "../date"
import { writeFileAtomic } from "../write-atomic"
import type { ArchiveBlock, ArchiveResult, ArchiveOptions } from "./types"
import { normalizeCompleted, isRecognizableCompleted, parseArchiveBlocks, renderBlock, renderArchiveFile } from "./archive-block"
import type { ArchiveBlockInfo } from "./archive-block"
import { acquireArchiveLock, releaseArchiveLock } from "./lock"

// 删除空目录，并从父目录往上递归清理，直到 stopDir 或遇到非空目录（archive/normalize 共用，供错月迁移后清空目录）
export function removeEmptyDirs(dir: string, stopDir: string) {
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
    // 统一换行为 LF：正文可能携带 CRLF（Windows 编辑器写入），若不归一，写盘时 `\n → eol` 会把已有 `\r\n` 二次转换成 `\r\r\n`
    const content = readFileSync(file, "utf8").replace(/\r\n?/g, "\n")
    const fm = parseFrontmatter(content)
    if (!DONE_STATUSES.includes(fm.status as never)) continue
    const raw = (fm.completed || "").trim()
    // 完成时间缺失或无法识别（自由文本既非日期也非日期+时分）时不归档：避免按垃圾串切片生成非法归档路径
    if (!isRecognizableCompleted(raw)) {
      skipped.push(basename(file, ".md"))
      console.log(
        raw
          ? `跳过 ${basename(file, ".md")}：completed「${raw}」无法识别为日期或日期+时分`
          : `跳过 ${basename(file, ".md")}：缺少 completed 完成时间`,
      )
      continue
    }
    doneTasks.push({
      file,
      name: basename(file, ".md"),
      owner: fm.owner || "未标注",
      status: fm.status || "未标注",
      scope: fm.scope || "-",
      completed: normalizeCompleted(raw),
      body: stripFrontmatter(content).trim(),
    })
  }

  if (doneTasks.length === 0) {
    console.log("本次无可归档任务")
    return { archived: 0, skipped, warnings }
  }

  // 软告警：完成时间与创建日不一致（日期漂移）、晚于系统时间（时间源错误）、恰为零点整（疑似只填日期被补零）；
  // 同类问题合并为一条，避免任务多时逐条刷屏
  if (warn) {
    const drift: string[] = []
    const future: string[] = []
    const midnight: string[] = []
    for (const t of doneTasks) {
      const completedDate = t.completed.replace(/-/g, "").slice(0, 8)
      const createdDate = dateFromFileName(t.file)
      if (createdDate && completedDate !== createdDate) {
        drift.push(`${t.name}（完成时间 ${t.completed}，创建日 ${createdDate}）`)
      }
      // 未来时间检测：写入时刻晚于系统时间说明时间源有误，归档前最后一道关口提醒；留跨时区容差（详见 src/date.ts）避免 UTC 运行环境误报
      if (isBeyondTzFuture(t.completed)) {
        future.push(`${t.name}（完成时间 ${t.completed}）`)
      } else if (t.completed.endsWith(" 00:00")) {
        // 零点整检测：恰为 00:00 通常是只填日期被自动补零的特征（真实午夜收工属少量误报），归档前最后一道关口提醒
        midnight.push(`${t.name}（完成时间 ${t.completed}）`)
      }
    }
    if (drift.length > 0) {
      warnings.push(`完成时间与创建日不一致、请确认 completed 是否填错的 ${drift.length} 个任务：${drift.join("；")}`)
    }
    if (future.length > 0) {
      warnings.push(`完成时间晚于当前系统时间、疑似时间源错误的 ${future.length} 个任务：${future.join("；")}`)
    }
    if (midnight.length > 0) {
      warnings.push(`完成时间恰为零点整、疑似只填了日期被补零的 ${midnight.length} 个任务：${midnight.join("；")}`)
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
      // 块集合由 renderArchiveFile 统一去重（同标题以本次新任务为准）并按完成时间降序排列
      const raw = existsSync(archiveFile) ? readFileSync(archiveFile, "utf8") : ""
      let header = `# ${date} 归档\n\n> 本文件由 \`toolkit tasks archive\` 自动生成。`
      const all: ArchiveBlockInfo[] = []
      if (raw) {
        const parsed = parseArchiveBlocks(raw)
        if (parsed.header) header = parsed.header
        all.push(...parsed.blocks)
      }

      // 软告警：归档文件已存在同名任务（本次写入会覆盖同名块，提示确认是否重复归档）；同名多个合并为一条
      if (warn) {
        const existingNames = new Set(all.map((b) => b.title))
        const dups = newTasks.filter((t) => existingNames.has(t.name)).map((t) => t.name)
        if (dups.length > 0) {
          warnings.push(`归档文件已存在同名任务，疑似重复归档、本次以新内容覆盖同名块的 ${dups.length} 个任务：${dups.join("、")}`)
        }
      }

      all.push(
        ...newTasks.map((t) => ({
          title: t.name,
          metaLine: `> 负责人：${t.owner}　状态：${t.status}　范围：${t.scope}　完成时间：${t.completed}`,
          completed: t.completed,
          body: redactText(t.body, redact),
        })),
      )

      // 预演模式：只打印将要写入的内容，不落盘、不删除 active
      if (dryRun) {
        console.log(`[预演] 将归档 ${newTasks.length} 个任务 → ${date}.md`)
        for (const t of newTasks) console.log(`[预演]   - ${t.name}`)
        continue
      }

      // 单日归档写盘 + 清理 active；失败时记入 failures 并继续处理其余日期，收尾统一汇总
      try {
        mkdirSync(monthDir, { recursive: true })
        // 保留原文件换行风格（LF/CRLF），避免 Windows 仓库追加新块产生混合换行与 diff 噪音
        const eol = raw.includes("\r\n") ? "\r\n" : "\n"
        writeFileAtomic(archiveFile, renderArchiveFile(header, all, eol))

        // 删除本次已归档的 active 文件
        for (const t of newTasks) unlinkSync(t.file)
        // 清理空目录（active/年月/ 及其上层 active/）
        const first = newTasks[0]
        if (first) removeEmptyDirs(dirname(first.file), tasksDir)
        console.log(`已归档 ${newTasks.length} 个任务 → ${date}.md`)
        // 计数口径为「任务数」（一个日期文件可含多个任务块）
        archivedOk += newTasks.length
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
