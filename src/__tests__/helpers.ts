// 测试夹具公共 helper（N5）：临时任务目录、active 任务文件、归档块文件生成，
// 供各 spec 复用，避免每个测试文件重复实现 mkdtemp + 手拼 frontmatter/归档块
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// 创建随机临时目录并返回路径
export function tempDir(prefix = "tk-"): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

// 建含 active/ + archive/ 骨架的 .tasks 目录
export function makeTasksDir(prefix = "tk-tasks-"): string {
  const dir = tempDir(prefix)
  mkdirSync(join(dir, "active"), { recursive: true })
  mkdirSync(join(dir, "archive"), { recursive: true })
  return dir
}

// active 任务文件可覆盖字段（缺省即合法默认值）
export interface ActiveFixture {
  owner?: string
  status?: string
  created?: string
  updated?: string
  completed?: string
  dependsOn?: string
  scope?: string
  title?: string
  body?: string
}

// 写 active 任务文件到 {created 前六位}/ 月份子目录，返回文件绝对路径
export function writeActiveTask(dir: string, name: string, cfg: ActiveFixture = {}): string {
  const created = cfg.created ?? "20260903"
  const month = created.slice(0, 6)
  const p = join(dir, "active", month, name)
  mkdirSync(join(dir, "active", month), { recursive: true })
  const content = [
    "---",
    `owner: ${cfg.owner ?? "唐启云"}`,
    `status: ${cfg.status ?? "待办"}`,
    `created: ${created}`,
    `updated: ${cfg.updated ?? created}`,
    `completed: ${cfg.completed ? `'${cfg.completed}'` : "''"}`,
    `depends_on: ${cfg.dependsOn ?? "[]"}`,
    `scope: ${cfg.scope ?? "测"}`,
    "---",
    "",
    `# ${cfg.title ?? name}`,
  ].join("\n")
  writeFileSync(p, content + (cfg.body ? `\n\n${cfg.body}\n` : "\n"), "utf8")
  return p
}

// 归档任务块可覆盖字段
export interface ArchiveBlockFixture {
  title: string
  completed: string
  owner?: string
  status?: string
  scope?: string
  body?: string
}

// 写归档文件（落 {YYYYMM}/ 月份子目录），date 形如 2026-08-31，返回文件绝对路径
export function writeArchiveFile(dir: string, date: string, blocks: ArchiveBlockFixture[]): string {
  const d = date.replace(/-/g, "")
  const file = join(dir, "archive", d.slice(0, 6), `${d}.md`)
  mkdirSync(join(dir, "archive", d.slice(0, 6)), { recursive: true })
  const header = `# ${d} 归档`
  const parts = blocks.map(
    (b) =>
      `## ${b.title}\n\n> 负责人：${b.owner ?? "唐启云"}　状态：${b.status ?? "已完成"}　范围：${b.scope ?? "-"}　完成时间：${b.completed}\n\n${b.body ?? ""}`,
  )
  writeFileSync(file, `${header}\n\n${parts.join("\n\n---\n\n")}\n`, "utf8")
  return file
}
