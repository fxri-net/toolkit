// 任务扫描：链接月份目录跳过扫描并软告警，避免读写任务区外的同名文件
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { listTaskFiles } from "../tasks/scan"
import { validateTasks } from "../tasks/validate"
import { checkArchive } from "../tasks/normalize"

const dirs: string[] = []
const linkType = process.platform === "win32" ? "junction" : "dir"

// 最小合规任务档：日期与文件名一致，避免叠加命名告警
function task(date: string, title: string): string {
  return `---\nowner: 唐启云\nstatus: 待办\ncreated: ${date}\nupdated: ${date}\ncompleted: ''\ndepends_on: []\nscope: 测\n---\n\n# ${title}\n`
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("任务扫描跳过链接月份目录", () => {
  it("active 链接月份目录不被列出，并给出软告警", () => {
    const root = tempDir("fxts-tk-scan-link-")
    const external = tempDir("fxts-tk-scan-external-")
    writeFileSync(join(external, "20260101-唐启云-外部.md"), task("20260101", "外部"), "utf8")
    mkdirSync(join(root, "active", "202602"), { recursive: true })
    writeFileSync(join(root, "active", "202602", "20260201-唐启云-正常.md"), task("20260201", "正常"), "utf8")
    symlinkSync(external, join(root, "active", "202601"), linkType)

    const files = listTaskFiles(join(root, "active"))
    expect(files.some((file) => file.includes("外部"))).toBe(false)
    expect(files.some((file) => file.includes("正常"))).toBe(true)

    const warns = validateTasks(root).issues.filter((issue) => issue.level === "warn").map((issue) => issue.message)
    expect(warns.some((message) => message.includes("active 月份目录为链接"))).toBe(true)
  })

  it("archive 链接月份目录在归一化检查中给出软告警", () => {
    const root = tempDir("fxts-tk-scan-archive-")
    const external = tempDir("fxts-tk-scan-archive-external-")
    writeFileSync(join(external, "20260101.md"), "# 20260101 归档\n", "utf8")
    mkdirSync(join(root, "archive"), { recursive: true })
    symlinkSync(external, join(root, "archive", "202601"), linkType)

    const issues = checkArchive(root)
    expect(issues.some((issue) => issue.message.includes("归档月份目录为链接"))).toBe(true)
    expect(issues.some((issue) => issue.file.includes("20260101.md"))).toBe(false)
  })

  it("普通月份目录与任务文件不受影响", () => {
    const root = tempDir("fxts-tk-scan-normal-")
    mkdirSync(join(root, "active", "202602"), { recursive: true })
    writeFileSync(join(root, "active", "202602", "20260201-唐启云-正常.md"), task("20260201", "正常"), "utf8")

    expect(listTaskFiles(join(root, "active"))).toHaveLength(1)
    expect(validateTasks(root).issues.filter((issue) => issue.message.includes("月份目录为链接"))).toHaveLength(0)
  })
})
