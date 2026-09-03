// archive 归档归一化：检查历史归档块的元数据完整性、完成时间漂移、排序，并按需修复
// 供 tasks normalize --check（只读）与 --fix（补齐元数据 + 降序重排 + 漂移块迁移）使用
import { readFileSync, unlinkSync, existsSync, mkdirSync, rmdirSync } from "node:fs"
import { join, basename, dirname } from "node:path"
import { normalizeCompleted, parseArchiveBlocks, renderBlock, completeMetaLine, scanOrphanBlocks } from "./archive-block"
import { listTaskFiles } from "./scan"
import type { ArchiveBlockInfo } from "./archive-block"
import { acquireArchiveLock, releaseArchiveLock } from "./lock"
import { writeFileAtomic } from "../write-atomic"

// 归一化问题
export interface NormalizeIssue {
  file: string
  message: string
  fixable: boolean
}

// 归一化结果
export interface NormalizeResult {
  issues: NormalizeIssue[]
  fixed: number
}

// 元数据四字段
const META_FIELDS = ["负责人", "状态", "范围", "完成时间"]

// 判断元数据行是否含全部四字段
function metaComplete(line: string): boolean {
  return META_FIELDS.every((f) => line.includes(f))
}

// 只读检查 archive 目录，返回问题清单
export function checkArchive(tasksDir = ".tasks"): NormalizeIssue[] {
  const archiveDir = join(tasksDir, "archive")
  const files = listTaskFiles(archiveDir)
  const issues: NormalizeIssue[] = []
  for (const file of files) {
    const name = basename(file)
    const fileDate = name.replace(/\.md$/, "")
    const content = readFileSync(file, "utf8")
    const { blocks } = parseArchiveBlocks(content)

    // 归档文件所在月份目录与文件名日期前缀不一致（如 archive/202608/20260903.md）
    const dirMonth = basename(dirname(file))
    const nameDate = name.replace(/\.md$/, "")
    if (dirMonth && nameDate && dirMonth !== nameDate.slice(0, 6)) {
      issues.push({
        file: name,
        message: `归档文件位于 ${dirMonth} 月份目录，与文件名日期 ${nameDate.slice(0, 6)} 不一致`,
        fixable: false,
      })
    }

    // 疑似任务块（元数据缺「完成时间」被归入前一块正文），提示人工确认
    for (const title of scanOrphanBlocks(content)) {
      issues.push({
        file: name,
        message: `疑似任务块「${title}」元数据缺「完成时间」，已被归入前一块正文（需人工确认）`,
        fixable: false,
      })
    }

    // 排序检查：completed 定宽后是否降序
    for (let i = 1; i < blocks.length; i++) {
      const prev = normalizeCompleted(blocks[i - 1].completed)
      const cur = normalizeCompleted(blocks[i].completed)
      if (prev && cur && prev < cur) {
        issues.push({ file: name, message: "任务块未按完成时间降序排列", fixable: true })
        break
      }
    }

    for (const b of blocks) {
      if (!b.metaLine) {
        issues.push({
          file: name,
          message: `块「${b.title}」缺少元数据行（负责人/状态/范围/完成时间）`,
          fixable: !!b.completed,
        })
      } else if (!metaComplete(b.metaLine)) {
        issues.push({
          file: name,
          message: `块「${b.title}」元数据行不完整（缺负责人/状态/范围之一）`,
          fixable: !!b.completed,
        })
      }
      // 完成时间漂移：completed 日期与归档文件日期不一致
      const norm = normalizeCompleted(b.completed)
      const blockDate = norm.replace(/-/g, "").slice(0, 8)
      if (blockDate && fileDate && blockDate !== fileDate) {
        issues.push({
          file: name,
          message: `块「${b.title}」完成时间 ${norm} 与归档文件日期 ${fileDate} 不一致`,
          fixable: false,
        })
      }
    }
  }
  return issues
}

// 把漂移任务块迁移到与完成日期一致的目标归档文件（不存在则新建，已存在则合并降序）
function migrateArchiveBlock(tasksDir: string, block: ArchiveBlockInfo, targetDate: string): void {
  const monthDir = join(tasksDir, "archive", targetDate.slice(0, 6))
  const targetFile = join(monthDir, `${targetDate}.md`)
  mkdirSync(monthDir, { recursive: true })
  let header = `# ${targetDate} 归档\n\n> 本文件由 \`toolkit tasks archive\` 自动生成。`
  const target: ArchiveBlockInfo[] = []
  if (existsSync(targetFile)) {
    const parsed = parseArchiveBlocks(readFileSync(targetFile, "utf8"))
    if (parsed.header) header = parsed.header
    target.push(...parsed.blocks)
  }
  // 目标文件已存在同名块时告警（迁移会并入产生重复，供人工确认）
  if (target.some((b) => b.title === block.title)) {
    console.warn(`⚠️ 目标 ${targetDate}.md 已存在同名块「${block.title}」，迁移将产生重复`)
  }
  target.push(block)
  target.sort((a, b) => normalizeCompleted(b.completed).localeCompare(normalizeCompleted(a.completed)))
  const eol = existsSync(targetFile) && readFileSync(targetFile, "utf8").includes("\r\n") ? "\r\n" : "\n"
  const next = `${header}\n\n${target.map(renderBlock).join("\n\n---\n\n")}\n`.replace(/\n/g, eol)
  writeFileAtomic(targetFile, next)
  console.log(`  块「${block.title}」迁移 → ${targetDate}.md`)
}

// 修复可自动修复的问题（补元数据 + 漂移迁移 + 降序重排），返回修复数
export function fixArchive(tasksDir = ".tasks"): NormalizeResult {
  const archiveDir = join(tasksDir, "archive")
  const files = listTaskFiles(archiveDir)
  const issues: NormalizeIssue[] = []
  let fixed = 0

  // 获取排他锁，防止与归档、并发归一化修复互相覆盖（与 archive.ts 共用 .archive.lock，陈旧锁自动清理）
  let lockFd: number | null = null
  lockFd = acquireArchiveLock(tasksDir)
  if (lockFd === null) {
    console.warn("⚠️ 检测到归档锁，可能有并发写操作正在进行，本次已跳过修复")
    return { issues, fixed }
  }

  try {
    for (const file of files) {
      const name = basename(file)
      const fileDate = name.replace(/\.md$/, "")
      const content = readFileSync(file, "utf8")
      const { header, blocks } = parseArchiveBlocks(content)

      const actions: string[] = []
      let changed = false
      // 补元数据行（缺行或不完整时，保留原行已有字段，仅补缺失项，避免改错状态）
      for (const b of blocks) {
        if (b.completed && (!b.metaLine || !metaComplete(b.metaLine))) {
          b.metaLine = completeMetaLine(b.title, b.completed, b.metaLine)
          actions.push(`补元数据「${b.title}」`)
          changed = true
          fixed++
        }
      }

      // 完成时间漂移迁移：把块迁到与 completed 日期一致的归档文件（原文件日期不再匹配的块全部迁出）
      const keep: ArchiveBlockInfo[] = []
      let migrated = 0
      for (const b of blocks) {
        const bd = b.completed ? normalizeCompleted(b.completed).replace(/-/g, "").slice(0, 8) : ""
        if (bd && bd !== fileDate) {
          migrateArchiveBlock(tasksDir, b, bd)
          migrated++
          changed = true
        } else {
          keep.push(b)
        }
      }
      if (migrated > 0) {
        actions.push(`迁移 ${migrated} 个漂移块`)
        fixed += migrated
      }

      // 降序重排（仅对 completed 可解析的块；缺失 completed 的块保持末尾）；顺序确需调整时计一次修复
      const dated = keep.filter((b) => b.completed)
      const undated = keep.filter((b) => !b.completed)
      const sorted = [...dated].sort((a, b) => normalizeCompleted(b.completed).localeCompare(normalizeCompleted(a.completed)))
      const needSort = JSON.stringify(sorted.map((b) => b.title)) !== JSON.stringify(dated.map((b) => b.title))
      if (needSort) {
        keep.splice(0, keep.length, ...sorted, ...undated)
        actions.push("降序重排")
        fixed++
        changed = true
      }

      // 冗余分隔符（`---` 空行对）检测：存在则随本次重写一并清理，计一次修复
      const hasDupSep = /^---\s*\r?\n\r?\n---/m.test(content)
      if (hasDupSep) {
        actions.push("清理冗余分隔符")
        fixed++
      }

      const eol = content.includes("\r\n") ? "\r\n" : "\n"
      if (blocks.length > 0 && keep.length === 0) {
        // 块全部迁走后删除空归档文件并尝试清理空目录
        if (existsSync(file)) unlinkSync(file)
        try {
          rmdirSync(dirname(file))
        } catch {
          // 目录非空（当月还有其他日期文件），忽略
        }
        actions.push("删除空归档文件")
        changed = true
      } else if (changed || hasDupSep) {
        // 文件头与首个任务块之间补空行分隔（header 已去掉末尾空行）；保留原文件行尾，避免 CRLF 文件整文件 diff
        const next = ((header ? header + "\n\n" : "") + keep.map(renderBlock).join("\n\n---\n\n") + "\n").replace(/\n/g, eol)
        writeFileAtomic(file, next)
      }
      if (actions.length > 0) console.log(`  ${name}: ${actions.join("、")}`)
    }

    return { issues, fixed }
  } finally {
    // 释放排他锁
    if (lockFd !== null) {
      try {
        releaseArchiveLock(tasksDir, lockFd)
      } catch {
        // 锁文件已被清理，忽略
      }
    }
  }
}
