// 归档块解析与归一化单测：normalizeCompleted 补位、分隔符清理、孤儿块扫描、漂移迁移与排序
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { normalizeCompleted, parseArchiveBlocks, scanOrphanBlocks } from "../tasks/archive-block"
import { checkArchive, fixArchive } from "../tasks/normalize"
import { archiveTasks } from "../tasks/archive"

// 建临时任务目录
function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tk-tasks-"))
  mkdirSync(join(dir, "archive"), { recursive: true })
  return dir
}

describe("normalizeCompleted", () => {
  it("定宽补位与纯日期补 00:00", () => {
    expect(normalizeCompleted("2026-9-3")).toBe("2026-09-03 00:00")
    expect(normalizeCompleted("2026-09-03")).toBe("2026-09-03 00:00")
    expect(normalizeCompleted("2026-09-03T8:05:22")).toBe("2026-09-03 08:05")
    expect(normalizeCompleted("2026-09-03 08:05")).toBe("2026-09-03 08:05")
    expect(normalizeCompleted("乱写的")).toBe("乱写的")
  })
})

describe("parseArchiveBlocks", () => {
  const src = [
    "# 20260903 归档",
    "",
    "## 20260903-唐启云-a",
    "",
    "> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-03 10:00",
    "",
    "a 正文",
    "",
    "---",
    "",
    "---",
    "",
    "## 20260903-唐启云-b",
    "",
    "> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-03 09:00",
    "",
    "b 正文",
    "",
    "---",
    "",
  ].join("\n")

  it("块尾分隔符不残留（A8）", () => {
    const { blocks } = parseArchiveBlocks(src)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].body).not.toMatch(/^---/)
    expect(blocks[0].body).not.toMatch(/---\s*$/)
    expect(blocks[0].body).toContain("a 正文")
  })

  it("疑似任务块扫描（A5）", () => {
    const withOrphan = src.replace(
      "b 正文",
      "b 正文\n\n## 20260903-唐启云-orphan\n\n> 负责人：唐启云　状态：已完成　范围：x\n\n无完成时间的孤儿块",
    )
    const orphans = scanOrphanBlocks(withOrphan)
    expect(orphans).toEqual(["20260903-唐启云-orphan"])
  })
})

describe("checkArchive / fixArchive（漂移迁移 A2 + 排序）", () => {
  it("只读检出排序与漂移，--fix 迁移到对应日期文件且修复后归一化 0 漂移", () => {
    const dir = makeDir()
    const month = join(dir, "archive", "202609")
    mkdirSync(month, { recursive: true })
    const content = [
      "# 20260903 归档",
      "",
      "## 20260903-唐启云-early",
      "",
      "> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-03 09:00",
      "",
      "early 正文",
      "",
      "---",
      "",
      "## 20260903-唐启云-drift",
      "",
      "> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-05 08:00",
      "",
      "drift 正文",
      "",
      "---",
      "",
      "## 20260903-唐启云-late",
      "",
      "> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-03 10:00",
      "",
      "late 正文",
      "",
    ].join("\n")
    writeFileSync(join(month, "20260903.md"), content, "utf8")

    const before = checkArchive(dir)
    expect(before.some((i) => i.message.includes("未按完成时间降序"))).toBe(true)
    expect(before.some((i) => i.message.includes("与归档文件日期 20260903 不一致"))).toBe(true)

    const res = fixArchive(dir)
    expect(res.fixed).toBeGreaterThan(0)

    // 漂移块迁到 20260905.md
    expect(existsSync(join(month, "20260905.md"))).toBe(true)
    const after = checkArchive(dir)
    expect(after.some((i) => i.message.includes("不一致"))).toBe(false)
    expect(after.some((i) => i.message.includes("未按完成时间降序"))).toBe(false)

    // 20260903.md 内按降序且无重复分隔符
    const text = readFileSync(join(month, "20260903.md"), "utf8")
    const titlePos = text.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("## "))
    expect(titlePos).toEqual(["## 20260903-唐启云-late", "## 20260903-唐启云-early"])
    expect(text).not.toContain("---\n\n---")
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("orphan 仅报告不自动修复", () => {
  it("checkArchive 报告孤儿块，fix 后仍在", () => {
    const dir = makeDir()
    const month = join(dir, "archive", "202609")
    mkdirSync(month, { recursive: true })
    const content = [
      "# 20260903 归档",
      "",
      "## 20260903-唐启云-a",
      "",
      "> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-03 10:00",
      "",
      "a 正文",
      "",
      "## 20260903-唐启云-orphan",
      "",
      "> 负责人：唐启云　状态：已完成　范围：x",
      "",
      "无完成时间",
      "",
    ].join("\n")
    writeFileSync(join(month, "20260903.md"), content, "utf8")
    expect(checkArchive(dir).some((i) => i.message.includes("疑似任务块"))).toBe(true)
    fixArchive(dir)
    expect(checkArchive(dir).some((i) => i.message.includes("疑似任务块"))).toBe(true)
    expect(readdirSync(month).includes("20260903.md")).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("archiveTasks 锁与 header（E1/E2）", () => {
  // 建含已完成 active 任务的任务目录
  function withDone(): { dir: string; date: string } {
    const dir = makeDir()
    mkdirSync(join(dir, "active", "202609"), { recursive: true })
    writeFileSync(
      join(dir, "active", "202609", "20260904-唐启云-done.md"),
      "---\nowner: 唐启云\nstatus: 已完成\ncreated: 20260904\nupdated: 20260904\ncompleted: '2026-09-04 09:00'\ndepends_on: []\nscope: 测\n---\n\n# done\n",
      "utf8",
    )
    return { dir, date: "2026-09-04" }
  }

  it("归档合并保留自定义 header（E1）", () => {
    const { dir } = withDone()
    const month = join(dir, "archive", "202609")
    mkdirSync(month, { recursive: true })
    writeFileSync(
      join(month, "20260904.md"),
      "# custom 头部\n\n> 手工引言，归档时不可覆盖。\n\n## 20260904-唐启云-old\n\n> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-04 08:00\n\nold\n",
      "utf8",
    )
    const res = archiveTasks(dir)
    expect(res.archived).toBe(1)
    const text = readFileSync(join(month, "20260904.md"), "utf8")
    expect(text.startsWith("# custom 头部")).toBe(true)
    expect(text).toContain("手工引言")
    expect(text).toContain("## 20260904-唐启云-done")
    rmSync(dir, { recursive: true, force: true })
  })

  it("陈旧归档锁自动接管（E2）", () => {
    const { dir } = withDone()
    const lock = join(dir, ".archive.lock")
    writeFileSync(lock, "stale", "utf8")
    const old = new Date(Date.now() - 11 * 60 * 1000)
    utimesSync(lock, old, old)
    const res = archiveTasks(dir)
    expect(res.archived).toBe(1)
    expect(existsSync(lock)).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it("并发新鲜锁仍跳过（E2）", () => {
    const { dir } = withDone()
    writeFileSync(join(dir, ".archive.lock"), "fresh", "utf8")
    const res = archiveTasks(dir)
    expect(res.archived).toBe(0)
    expect(res.warnings.some((w) => w.includes("归档锁"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})
