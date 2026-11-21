// 任务文件写入：按模板建档与改字段，保持 frontmatter 键序与正文原样
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { userInfo } from "node:os"
import { basename, join } from "node:path"
import { skillsPackageDir } from "../skills/source/package"
import { ALL_STATUSES, type TaskStatus } from "./types"

// 归档态：进入后必须补 completed，离开时清空
const TERMINAL_STATUSES: readonly TaskStatus[] = ["已完成", "已放弃"]

// 本机默认负责人：优先 git user.name，失败回落系统用户名
export function defaultOwner(): string {
  try {
    const name = execFileSync("git", ["config", "user.name"], { encoding: "utf8" }).trim()
    if (name) return name
  } catch {
    // 非 git 仓库或未配置时回落系统用户名
  }
  return userInfo().username
}

// 当天日期：本地时区的 YYYYMMDD
export function todayStamp(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
}

// 任务简述：NFC、去跨平台非法字符与控制字符、空白折叠为短横线、截断 24 字符
export function taskSlug(title: string): string {
  return [...title.normalize("NFC").replace(/[\\/:*?"<>|]/g, " ")]
    .filter((char) => (char.codePointAt(0) ?? 0) >= 32)
    .join("")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 24)
}

// 模板读取：优先包内技能资产，缺失时用内置最小骨架
function readTemplate(): string {
  const file = join(skillsPackageDir(), "skills", "fxri-plan-task", "assets", "active-task-template.md")
  if (existsSync(file)) return readFileSync(file, "utf8")
  return [
    "---",
    "owner: <负责人>",
    "status: 待办",
    "created: <创建日>",
    "updated: <创建日>",
    "completed: ''",
    "depends_on: []",
    "scope: <影响范围>",
    "---",
    "",
    "# 任务标题",
    "",
    "> 计划位置：待排期；前置：无；后继：无",
    "",
    "## 背景",
    "",
    "## 实施方案",
    "",
    "## 影响范围",
    "",
    "## 验证方式",
    "",
    "## 回滚",
    "",
    "## 完成情况",
    "",
    "- 待开工后补",
    "",
  ].join("\n")
}

// 选项值渲染：字符串加引号（含特殊字符时），数组写 JSON
function renderValue(key: string, value: string | string[]): string {
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value === "") return "''"
  return /^[\w.\-\u4e00-\u9fa5]+$/.test(value) ? value : JSON.stringify(value)
}

// 写入文件：统一 UTF-8 无 BOM + LF
function writeFile(file: string, content: string): void {
  writeFileSync(file, content.replace(/\r\n/g, "\n"), { encoding: "utf8" })
}

export interface AddTaskInput {
  dir: string
  title: string
  owner?: string
  scope: string
  dependsOn?: string[]
  plan?: string
  dryRun?: boolean
  now?: Date
}

// 新建任务档：返回目标路径与内容；同名已存在时抛错
export function createTask(input: AddTaskInput): { file: string; content: string } {
  const now = input.now ?? new Date()
  const stamp = todayStamp(now)
  const owner = input.owner?.trim() || defaultOwner()
  const slug = taskSlug(input.title)
  if (!slug) throw new Error("任务标题无法生成合法简述")
  const monthDir = join(input.dir, "active", stamp.slice(0, 6))
  const file = join(monthDir, `${stamp}-${owner}-${slug}.md`)
  if (existsSync(file)) throw new Error(`任务档已存在：${file}`)

  let content = readTemplate()
    .replace("<负责人 git 用户名>", owner)
    .replace("<负责人>", owner)
    .replace("<创建日 YYYYMMDD，随每次修改同步>", stamp)
    .replace("<创建日 YYYYMMDD>", stamp)
    .replace("<创建日>", stamp)
    .replace("<影响范围>", input.scope)
    .replace("# 任务标题", `# ${input.title}`)
  // 计划位置行：显式给出时原样写入，否则标注待排期
  content = content.replace(/> 计划位置：.*$/m, input.plan?.trim() || "> 计划位置：待排期；前置：无；后继：无")
  // 依赖：替换空数组或模板占位
  content = content.replace(/^depends_on:.*$/m, `depends_on: ${JSON.stringify(input.dependsOn ?? [])}`)
  // 正文占位：换成自包含骨架
  content = content.replace(
    /（方案正文：[\s\S]*?）\n?/,
    [
      "## 背景",
      "",
      "（补充需求来源与现状）",
      "",
      "## 实施方案",
      "",
      "1. （待补）",
      "",
      "## 影响范围",
      "",
      "- 代码：（待补）",
      "",
      "## 验证方式",
      "",
      "- （待补）",
      "",
      "## 回滚",
      "",
      "单提交回退。",
      "",
      "## 完成情况",
      "",
      "- 待开工后补",
      "",
    ].join("\n"),
  )

  if (!input.dryRun) {
    mkdirSync(monthDir, { recursive: true })
    writeFile(file, content)
  }
  return { file, content }
}

export interface UpdateTaskInput {
  dir: string
  key: string
  status?: string
  owner?: string
  scope?: string
  dependsOn?: string[]
  completed?: string
  dryRun?: boolean
  now?: Date
}

// 在 active 下按文件名或唯一键查找任务档：命中不唯一时抛错
export function findActiveTask(dir: string, key: string): string {
  const root = join(dir, "active")
  const hits: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.name.endsWith(".md")) continue
      if (entry.name === `${key}.md` || entry.name.includes(key)) hits.push(full)
    }
  }
  if (existsSync(root)) walk(root)
  if (hits.length === 0) throw new Error(`未找到任务：${key}`)
  if (hits.length > 1) throw new Error(`任务关键字命中多个文件，请写完整文件名：${hits.map((file) => basename(file)).join("、")}`)
  return hits[0]!
}

// 改任务字段：只改 frontmatter 指定键，保留正文与未知字段
export function updateTask(input: UpdateTaskInput): { file: string; content: string; changes: string[] } {
  const file = findActiveTask(input.dir, input.key)
  const raw = readFileSync(file, "utf8")
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(raw)
  if (!match) throw new Error(`任务档缺少 frontmatter：${file}`)
  const lines = (match[2] ?? "").split(/\r?\n/)
  const stamp = todayStamp(input.now ?? new Date())
  const changes: string[] = []

  const set = (key: string, value: string): void => {
    const index = lines.findIndex((line) => line.startsWith(`${key}:`))
    if (index === -1) {
      lines.push(`${key}: ${value}`)
      return
    }
    if (lines[index] !== `${key}: ${value}`) {
      lines[index] = `${key}: ${value}`
      changes.push(key)
    }
  }

  // 校验状态并处理 completed 与终态约束
  if (input.status !== undefined) {
    if (!ALL_STATUSES.includes(input.status as TaskStatus)) throw new Error(`非法状态：${input.status}`)
    const terminal = TERMINAL_STATUSES.includes(input.status as TaskStatus)
    if (terminal && input.completed === undefined) {
      const existing = lines.find((line) => line.startsWith("completed:"))?.slice("completed:".length).trim().replace(/^['"]|['"]$/g, "")
      if (!existing) throw new Error(`状态改为「${input.status}」时须提供 --completed YYYY-MM-DD HH:mm`)
    }
    set("status", input.status)
    if (terminal) set("completed", renderValue("completed", input.completed ?? ""))
    else set("completed", "''")
  } else if (input.completed !== undefined) {
    set("completed", renderValue("completed", input.completed))
  }
  if (input.owner !== undefined) set("owner", renderValue("owner", input.owner))
  if (input.scope !== undefined) set("scope", renderValue("scope", input.scope))
  if (input.dependsOn !== undefined) set("depends_on", renderValue("depends_on", input.dependsOn))
  set("updated", stamp)

  const content = `${match[1]}${lines.join("\n")}${match[3]}${raw.slice(match[0].length)}`
  if (!input.dryRun) writeFile(file, content)
  return { file, content, changes }
}
