// archive 归档归一化：检查历史归档块的元数据完整性、完成时间漂移、排序，并按需修复
// 供 tasks normalize --check（只读）与 --fix（补齐元数据 + 降序重排）使用
import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync } from "node:fs"
import { join, basename } from "node:path"
import { normalizeCompleted } from "./archive"
import { listTaskFiles } from "./scan"

// 归档块
interface Block {
  title: string
  metaLine: string | null
  completed: string
  body: string
}

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

// 从块标题提取负责人：形如 `20260903-唐启云-xxx` 取中段，否则返回空
function ownerFromTitle(title: string): string {
  const m = title.match(/^\d{8}-(.+?)-/)
  return m ? m[1] : ""
}

// 解析归档文件，返回文件头与块列表
function parseArchiveFile(content: string): { header: string; blocks: Block[] } {
  const pos = content.search(/\n## /)
  if (pos === -1) return { header: content, blocks: [] }
  const header = content.slice(0, pos + 1)
  const rest = content.slice(pos + 1)
  const blocks: Block[] = []
  for (const part of rest.split(/\n\n---\n\n/)) {
    const trimmed = part.trim()
    if (!trimmed.startsWith("## ")) continue
    const lines = trimmed.split("\n")
    const title = lines[0].replace(/^## /, "")
    let metaLine: string | null = null
    let completed = ""
    let bodyStart = 1
    for (let i = 1; i < lines.length; i++) {
      const t = lines[i].trim()
      if (t.startsWith("> ") && t.includes("完成时间")) {
        metaLine = lines[i]
        const m = t.match(/完成时间：(.+)$/)
        if (m) completed = m[1].trim()
        bodyStart = i + 1
        break
      }
    }
    blocks.push({ title, metaLine, completed, body: lines.slice(bodyStart).join("\n").trim() })
  }
  return { header, blocks }
}

// 生成规范的元数据行
function buildMetaLine(title: string, completed: string): string {
  const owner = ownerFromTitle(title) || "未标注"
  return `> 负责人：${owner}　状态：已完成　范围：-　完成时间：${normalizeCompleted(completed)}`
}

// 元数据四字段
const META_FIELDS = ["负责人", "状态", "范围", "完成时间"]

// 判断元数据行是否含全部四字段
function metaComplete(line: string): boolean {
  return META_FIELDS.every((f) => line.includes(f))
}

// 组装块文本（无元数据行且无完成时间时，保持无元数据行的原始结构）
function renderBlock(b: Block): string {
  const meta = b.metaLine ?? (b.completed ? buildMetaLine(b.title, b.completed) : null)
  return meta ? `## ${b.title}\n\n${meta}\n\n${b.body}` : `## ${b.title}\n\n${b.body}`
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
    const { blocks } = parseArchiveFile(content)

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

// 修复可自动修复的问题（补元数据 + 降序重排），返回修复数
export function fixArchive(tasksDir = ".tasks"): NormalizeResult {
  const archiveDir = join(tasksDir, "archive")
  const files = listTaskFiles(archiveDir)
  const issues: NormalizeIssue[] = []
  let fixed = 0

  // 获取排他锁，防止与归档、并发归一化修复互相覆盖（与 archive.ts 共用 .archive.lock）
  let lockFd: number | null = null
  const lockPath = join(tasksDir, ".archive.lock")
  try {
    lockFd = openSync(lockPath, "wx")
  } catch {
    console.warn("⚠️ 检测到归档锁，可能有并发写操作正在进行，本次已跳过修复")
    return { issues, fixed }
  }

  try {
    for (const file of files) {
      const name = basename(file)
      const fileDate = name.replace(/\.md$/, "")
      const content = readFileSync(file, "utf8")
      const { header, blocks } = parseArchiveFile(content)

      let changed = false
      // 补元数据行（缺行或不完整时，用完成时间 + 标题推导补齐四字段）
      for (const b of blocks) {
        if (b.completed && (!b.metaLine || !metaComplete(b.metaLine))) {
          b.metaLine = buildMetaLine(b.title, b.completed)
          changed = true
          fixed++
        }
        // 漂移仅报告不修复
        const norm = normalizeCompleted(b.completed)
        const blockDate = norm.replace(/-/g, "").slice(0, 8)
        if (blockDate && fileDate && blockDate !== fileDate) {
          issues.push({ file: name, message: `块「${b.title}」完成时间 ${norm} 与归档日期 ${fileDate} 不一致（需人工确认是否迁移）`, fixable: false })
        }
      }

      // 降序重排（仅对 completed 可解析的块；缺失 completed 的块保持末尾）
      const dated = blocks.filter((b) => b.completed)
      const undated = blocks.filter((b) => !b.completed)
      const sorted = [...dated].sort((a, b) => normalizeCompleted(b.completed).localeCompare(normalizeCompleted(a.completed)))
      if (JSON.stringify(sorted.map((b) => b.title)) !== JSON.stringify(dated.map((b) => b.title))) {
        blocks.splice(0, blocks.length, ...sorted, ...undated)
        changed = true
      }

      if (changed) {
        const next = header + blocks.map(renderBlock).join("\n\n---\n\n") + "\n"
        writeFileSync(file, next, "utf8")
      }
    }

    return { issues, fixed }
  } finally {
    // 释放排他锁
    if (lockFd !== null) {
      closeSync(lockFd)
      try {
        unlinkSync(lockPath)
      } catch {
        // 锁文件已被清理，忽略
      }
    }
  }
}
