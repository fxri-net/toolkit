import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs"
import { join, basename } from "node:path"
import { parseFrontmatter, stripFrontmatter } from "./parse"
import { listTaskFiles } from "./scan"
import { DONE_STATUSES } from "./types"
import type { ArchiveBlock, ArchiveResult } from "./types"

// 解析归档文件里的任务块，返回 { block, completed } 数组
export function parseArchiveTasks(file: string): ArchiveBlock[] {
  const content = readFileSync(file, "utf8")
  const tasks: ArchiveBlock[] = []
  const re = /## (.+?)\n\n> [^\n]*完成时间：([^\n]+)\n\n([\s\S]*?)(?=\n\n---\n\n## |$)/g
  let m
  while ((m = re.exec(content))) {
    tasks.push({ block: m[0].trim(), completed: m[2].trim() })
  }
  return tasks
}

// 归档：任务级，将「已完成/已放弃」的任务按完成时间归组排序后写入归档文件
export function archiveTasks(tasksDir = ".tasks"): ArchiveResult {
  const activeDir = join(tasksDir, "active")
  const archiveDir = join(tasksDir, "archive")
  const files = listTaskFiles(activeDir)
  if (files.length === 0) {
    console.log("当前无活跃任务，无需归档")
    return { archived: 0, skipped: [] }
  }

  // 收集本次可归档的任务（状态已终结且带完成时间）
  const doneTasks: Array<{ file: string; name: string; owner: string; status: string; scope: string; completed: string; body: string }> = []
  const skipped: string[] = []
  for (const file of files) {
    const content = readFileSync(file, "utf8")
    const fm = parseFrontmatter(content)
    if (!DONE_STATUSES.includes(fm.status as never)) continue
    const completed = fm.completed
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
    return { archived: 0, skipped }
  }

  // 按完成时间日期（YYYYMMDD）分组
  const byDate: Record<string, typeof doneTasks> = {}
  for (const t of doneTasks) {
    const date = t.completed.replace(/-/g, "").slice(0, 8)
    ;(byDate[date] ||= []).push(t)
  }

  for (const [date, newTasks] of Object.entries(byDate)) {
    const monthDir = join(archiveDir, date.slice(0, 6))
    mkdirSync(monthDir, { recursive: true })
    const archiveFile = join(monthDir, `${date}.md`)

    // 合并已有归档任务 + 本次新任务，按完成时间排序
    const all: ArchiveBlock[] = existsSync(archiveFile) ? parseArchiveTasks(archiveFile) : []
    all.push(
      ...newTasks.map((t) => ({
        block: `## ${t.name}\n\n> 负责人：${t.owner}　状态：${t.status}　范围：${t.scope}　完成时间：${t.completed}\n\n${t.body}`,
        completed: t.completed,
      })),
    )
    all.sort((a, b) => a.completed.localeCompare(b.completed))

    writeFileSync(
      archiveFile,
      `# ${date} 归档\n\n> 本文件由 \`toolkit tasks archive\` 自动生成。\n\n${all.map((t) => t.block).join("\n\n---\n\n")}\n`,
      "utf8",
    )

    // 删除本次已归档的 active 文件
    for (const t of newTasks) unlinkSync(t.file)
    console.log(`已归档 ${newTasks.length} 个任务 → ${date}.md`)
  }

  console.log(`共归档 ${doneTasks.length} 个任务`)
  return { archived: doneTasks.length, skipped }
}
