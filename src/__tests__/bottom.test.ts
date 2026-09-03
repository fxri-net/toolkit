// 底层模块直接单测（T-9）：原子写、目录扫描、展示路径
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeFileAtomic } from "../write-atomic"
import { listTaskFiles, dateFromFileName } from "../tasks/scan"
import { displayRel } from "../tasks/paths"

describe("writeFileAtomic", () => {
  it("写入内容并原子替换，不残留临时文件", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-wa-"))
    const file = join(dir, "a.md")
    writeFileAtomic(file, "hello")
    expect(readFileSync(file, "utf8")).toBe("hello")
    writeFileAtomic(file, "world")
    expect(readFileSync(file, "utf8")).toBe("world")
    expect(readdirSync(dir).filter((f) => f.includes(".tmp-"))).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("scan.listTaskFiles", () => {
  it("收集一层年月子目录与根目录的 .md，忽略更深层与非 .md", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-scan-"))
    mkdirSync(join(dir, "202609", "deep"), { recursive: true })
    writeFileSync(join(dir, "root.md"), "x", "utf8")
    writeFileSync(join(dir, "202609", "a.md"), "x", "utf8")
    writeFileSync(join(dir, "202609", "deep", "b.md"), "x", "utf8")
    writeFileSync(join(dir, "202609", "c.txt"), "x", "utf8")
    const files = listTaskFiles(dir).map((f) => f.split(/[\\/]/).pop() ?? f)
    expect(files).toContain("root.md")
    expect(files).toContain("a.md")
    expect(files).not.toContain("b.md")
    expect(files).not.toContain("c.txt")
    rmSync(dir, { recursive: true, force: true })
  })

  it("目录不存在返回空数组", () => {
    expect(listTaskFiles(join(tmpdir(), "tk-absent-" + Date.now()))).toEqual([])
  })

  it("dateFromFileName 提取 8 位日期前缀", () => {
    expect(dateFromFileName(join("a", "20260903-唐启云-x.md"))).toBe("20260903")
    expect(dateFromFileName("无日期.md")).toBe("")
  })
})

describe("paths.displayRel", () => {
  it("返回相对 tasksDir 且统一 / 分隔（跨平台路径安全）", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-path-"))
    const tasks = join(dir, ".tasks")
    const file = join(tasks, "active", "202609", "a.md")
    expect(displayRel(tasks, file)).toBe("active/202609/a.md")
    rmSync(dir, { recursive: true, force: true })
  })
})
