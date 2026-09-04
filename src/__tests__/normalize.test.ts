// 归档块解析与归一化单测：normalizeCompleted 补位、分隔符清理、孤儿块扫描、漂移迁移与排序
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { normalizeCompleted, parseArchiveBlocks, renderBlock, scanOrphanBlocks } from "../tasks/archive-block"
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

describe("元数据补全保留原状态（F7）", () => {
  it("缺负责人但带 状态/范围 的块修复后状态不变", () => {
    const dir = makeDir()
    const month = join(dir, "archive", "202609")
    mkdirSync(month, { recursive: true })
    const content = [
      "# 20260903 归档",
      "",
      "## 20260903-唐启云-giveup",
      "",
      "> 状态：已放弃　范围：内容　完成时间：2026-09-03 10:00",
      "",
      "正文",
      "",
    ].join("\n")
    writeFileSync(join(month, "20260903.md"), content, "utf8")
    fixArchive(dir)
    const text = readFileSync(join(month, "20260903.md"), "utf8")
    expect(text).toContain("状态：已放弃")
    expect(text).not.toContain("状态：已完成")
    expect(text).toContain("负责人：唐启云")
    expect(text).toContain("范围：内容")
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("月份目录不一致（E9/K4）", () => {
  it("checkArchive 检出放错月份目录的归档文件", () => {
    const dir = makeDir()
    mkdirSync(join(dir, "archive", "202608"), { recursive: true })
    writeFileSync(
      join(dir, "archive", "202608", "20260903.md"),
      "# 20260903 归档\n\n## 20260903-唐启云-a\n\n> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-03 10:00\n\na\n",
      "utf8",
    )
    expect(checkArchive(dir).some((i) => i.message.includes("月份目录"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("--fix 把放错月份目录的文件移到正确月份目录（K4）", () => {
    const dir = makeDir()
    mkdirSync(join(dir, "archive", "202608"), { recursive: true })
    const content =
      "# 20260903 归档\n\n## 20260903-唐启云-a\n\n> 负责人：唐启云　状态：已完成　范围：x　完成时间：2026-09-03 10:00\n\na\n"
    writeFileSync(join(dir, "archive", "202608", "20260903.md"), content, "utf8")
    const res = fixArchive(dir)
    expect(res.fixed).toBeGreaterThan(0)
    expect(existsSync(join(dir, "archive", "202609", "20260903.md"))).toBe(true)
    expect(existsSync(join(dir, "archive", "202608", "20260903.md"))).toBe(false)
    expect(checkArchive(dir).some((i) => i.message.includes("月份目录"))).toBe(false)
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

describe("未来时间检测", () => {
  // 建含远期未来完成时间的归档块（固定 2099 年，不随执行时间漂移）
  function withFutureArchive(): string {
    const dir = makeDir()
    const month = join(dir, "archive", "209901")
    mkdirSync(month, { recursive: true })
    writeFileSync(
      join(month, "20990101.md"),
      "# 20990101 归档\n\n## 20990101-唐启云-a\n\n> 负责人：唐启云　状态：已完成　范围：x　完成时间：2099-01-01 00:00\n\na\n",
      "utf8",
    )
    return dir
  }

  it("checkArchive 检出未来时间且标记不可自动修复，fix 后保留原值", () => {
    const dir = withFutureArchive()
    const hits = checkArchive(dir).filter((i) => i.message.includes("晚于当前系统时间"))
    expect(hits).toHaveLength(1)
    expect(hits[0]?.fixable).toBe(false)
    fixArchive(dir)
    // 未来时间不可自动修复：fix 后仍被检出，等待人工核实
    expect(checkArchive(dir).some((i) => i.message.includes("晚于当前系统时间"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("archiveTasks 归档未来时间任务产生软告警", () => {
    const dir = makeDir()
    mkdirSync(join(dir, "active", "209901"), { recursive: true })
    writeFileSync(
      join(dir, "active", "209901", "20990101-唐启云-future.md"),
      "---\nowner: 唐启云\nstatus: 已完成\ncreated: 20990101\nupdated: 20990101\ncompleted: '2099-01-01 00:00'\ndepends_on: []\nscope: 测\n---\n\n# future\n",
      "utf8",
    )
    const res = archiveTasks(dir)
    expect(res.archived).toBe(1)
    expect(res.warnings.some((w) => w.includes("晚于当前系统时间"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("换行风格回归", () => {
  // 建已完成 active 任务，正文行尾写死 CRLF（模拟 Windows 编辑器写入）
  function withCrlfBody(): string {
    const dir = makeDir()
    mkdirSync(join(dir, "active", "202609"), { recursive: true })
    const fm = "---\nowner: 唐启云\nstatus: 已完成\ncreated: 20260904\nupdated: 20260904\ncompleted: '2026-09-04 09:00'\ndepends_on: []\nscope: 测\n---\n\n# done\n\n正文第一行\n\n正文第二行\n"
    writeFileSync(join(dir, "active", "202609", "20260904-唐启云-crlf.md"), fm.replace(/\n/g, "\r\n"), "utf8")
    return dir
  }

  it("归档 CRLF 源文件不产生双重 CR（写入 LF 风格归档）", () => {
    const dir = withCrlfBody()
    const res = archiveTasks(dir)
    expect(res.archived).toBe(1)
    const text = readFileSync(join(dir, "archive", "202609", "20260904.md"), "utf8")
    // LF 风格归档文件中不允许出现任何 CR（正文 CRLF 已被归一，写盘仅按 eol 转换一次）
    expect(text).not.toMatch(/\r/)
    expect(text).toContain("正文第一行")
    rmSync(dir, { recursive: true, force: true })
  })

  it("解析已污染的双重 CR 归档文件，渲染后剥离孤立 CR", () => {
    const dir = makeDir()
    const month = join(dir, "archive", "202609")
    mkdirSync(month, { recursive: true })
    // 历史污染样本：块分隔与正文行尾均为 \r\r\n
    const polluted = "# 20260904 归档\r\r\n\r\r\n## 20260904-唐启云-a\r\r\n\r\r\n> 负责人：唐启云　状态：已完成　范围：测　完成时间：2026-09-04 08:00\r\r\n\r\r\n正文行\r\r\n"
    writeFileSync(join(month, "20260904.md"), polluted, "utf8")
    const { header, blocks } = parseArchiveBlocks(readFileSync(join(month, "20260904.md"), "utf8"))
    expect(header).toBe("# 20260904 归档")
    expect(blocks).toHaveLength(1)
    // 渲染结果不应再携带孤立 CR，写回后即为干净行尾
    expect(renderBlock(blocks[0]!)).not.toMatch(/\r/)
    rmSync(dir, { recursive: true, force: true })
  })
})
