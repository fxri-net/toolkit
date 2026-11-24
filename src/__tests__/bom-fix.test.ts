// 归一化 --fix 去 BOM：只对带 BOM 的任务档写回，内容与换行风格不变
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, statSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fixArchive, checkArchive } from "../tasks/normalize"

const taskDir = () => mkdtempSync(join(tmpdir(), "fxts-tk-bom-"))
// 模拟 PowerShell 5 `Set-Content -Encoding UTF8` 产生的 UTF-8 BOM
const withBom = (text: string) => "\uFEFF" + text

describe("normalize --fix 去 BOM", () => {
  it("active 与 archive 的 BOM 均被剥离，正文内容不变", () => {
    const dir = taskDir()
    try {
      mkdirSync(join(dir, "active", "202611"), { recursive: true })
      mkdirSync(join(dir, "archive", "202611"), { recursive: true })
      const active = join(dir, "active", "202611", "20261120-唐启云-甲.md")
      writeFileSync(
        active,
        withBom("---\nowner: 唐启云\nstatus: 待办\ncreated: 20261120\nupdated: 20261120\ncompleted: ''\ndepends_on: []\nscope: x\n---\n\n# 甲\n\n正文\n"),
        "utf8",
      )
      const archive = join(dir, "archive", "202611", "20261119.md")
      writeFileSync(
        archive,
        withBom("# 20261119 归档\n\n## 20261119-唐启云-旧任务\n\n> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-11-19 10:00\n\n正文\n"),
        "utf8",
      )

      const res = fixArchive(dir)
      expect(res.bomFixed).toBe(2)
      expect(readFileSync(active, "utf8").startsWith("\uFEFF")).toBe(false)
      expect(readFileSync(archive, "utf8").startsWith("\uFEFF")).toBe(false)
      expect(readFileSync(active, "utf8")).toContain("# 甲")
      expect(readFileSync(active, "utf8")).toContain("status: 待办")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("无 BOM 的文件不被重写（mtime 不变）", () => {
    const dir = taskDir()
    try {
      mkdirSync(join(dir, "active", "202611"), { recursive: true })
      const file = join(dir, "active", "202611", "20261120-唐启云-乙.md")
      writeFileSync(file, "---\nowner: 唐启云\nstatus: 待办\ncreated: 20261120\nupdated: 20261120\ncompleted: ''\ndepends_on: []\nscope: x\n---\n\n# 乙\n", "utf8")
      const before = statSync(file).mtimeMs
      const res = fixArchive(dir)
      expect(res.bomFixed).toBe(0)
      expect(statSync(file).mtimeMs).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("CRLF 文件去 BOM 后仍保留 CRLF", () => {
    const dir = taskDir()
    try {
      mkdirSync(join(dir, "active", "202611"), { recursive: true })
      const file = join(dir, "active", "202611", "20261120-唐启云-丙.md")
      writeFileSync(file, withBom("---\r\nowner: 唐启云\r\nstatus: 待办\r\ncreated: 20261120\r\nupdated: 20261120\r\ncompleted: ''\r\ndepends_on: []\r\nscope: x\r\n---\r\n\r\n# 丙\r\n"), "utf8")
      fixArchive(dir)
      const text = readFileSync(file, "utf8")
      expect(text.startsWith("\uFEFF")).toBe(false)
      expect(text).toContain("\r\n")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("归档文件 BOM：只读检查报 fixable 问题，修复后消失", () => {
    const dir = taskDir()
    try {
      mkdirSync(join(dir, "archive", "202611"), { recursive: true })
      const archive = join(dir, "archive", "202611", "20261119.md")
      writeFileSync(
        archive,
        withBom("# 20261119 归档\n\n## 20261119-唐启云-旧任务\n\n> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-11-19 10:00\n\n正文\n"),
        "utf8",
      )
      const before = checkArchive(dir).filter((i) => i.message.includes("BOM"))
      expect(before).toHaveLength(1)
      expect(before[0]!.fixable).toBe(true)
      fixArchive(dir)
      expect(checkArchive(dir).some((i) => i.message.includes("BOM"))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
