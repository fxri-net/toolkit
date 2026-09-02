import { readFileSync } from "node:fs"
import { join, basename } from "node:path"
import { parseFrontmatter, stripFrontmatter } from "./parse"
import { listTaskFiles, dateFromFileName } from "./scan"
import type { Task } from "./types"

// 读取 active 目录下的任务列表
export function listTasks(tasksDir = ".tasks"): Task[] {
  const activeDir = join(tasksDir, "active")
  return listTaskFiles(activeDir).map((file) => {
    const content = readFileSync(file, "utf8")
    const fm = parseFrontmatter(content)
    const title =
      content
        .split(/\r?\n/)
        .find((l) => l.startsWith("# ") && !l.startsWith("#!"))
        ?.replace(/^#\s*/, "") || basename(file, ".md")
    return {
      file,
      name: basename(file, ".md"),
      date: dateFromFileName(file),
      title,
      frontmatter: fm as Task["frontmatter"],
      body: stripFrontmatter(content).trim(),
    }
  })
}

// 输出任务总览
export function printTasks(tasksDir = ".tasks"): void {
  const tasks = listTasks(tasksDir)
  if (tasks.length === 0) {
    console.log("当前无活跃任务")
    return
  }

  const order = ["进行中", "阻塞", "待办", "已完成", "已放弃", "未标注"]
  const grouped: Record<string, Task[]> = {}
  for (const t of tasks) {
    const key = order.includes(t.frontmatter.status) ? t.frontmatter.status : "未标注"
    ;(grouped[key] ||= []).push(t)
  }

  console.log("任务总览：\n")
  let total = 0
  for (const status of order) {
    const list = grouped[status] || []
    if (list.length === 0) continue
    total += list.length
    console.log(`【${status}】${list.length} 项`)
    for (const t of list) {
      console.log(`  ${t.date}  ${(t.frontmatter.owner || "未标注").padEnd(8)}  ${t.title}`)
    }
    console.log("")
  }
  console.log(`共 ${total} 个任务文件`)
}
