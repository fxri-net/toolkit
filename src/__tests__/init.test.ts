// init 命令单测：骨架生成、重复执行幂等、.gitignore 追加与跳过
import { describe, it, expect, afterAll } from "vitest"
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { initWorkspace } from "../init"
import { todayCompact } from "../date"

// 临时目录中执行 init 并清理
function runInDir(prefix = "tk-init-"): { cwd: string; gitignore: () => string } {
  const cwd = mkdtempSync(join(tmpdir(), prefix))
  return {
    cwd,
    gitignore: () => readFileSync(join(cwd, ".gitignore"), "utf8"),
  }
}

// 各用例独立建临时目录，结束后统一清理
const dirs: string[] = []
function track<T extends { cwd: string }>(result: T): T {
  dirs.push(result.cwd)
  return result
}

describe("initWorkspace 骨架生成", () => {
  it("空目录生成 active/{当月}/、archive/ 与 .gitignore 片段", () => {
    const { cwd } = track(runInDir("tk-init-empty-"))
    initWorkspace(".tasks", cwd)
    const month = todayCompact().slice(0, 6)
    expect(existsSync(join(cwd, ".tasks", "active", month))).toBe(true)
    expect(existsSync(join(cwd, ".tasks", "archive"))).toBe(true)
    expect(existsSync(join(cwd, ".gitignore"))).toBe(true)
    expect(readFileSync(join(cwd, ".gitignore"), "utf8")).toContain(".archive.lock")
  })

  it("重复执行幂等：目录与 .gitignore 内容不变", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-twice-"))
    initWorkspace(".tasks", cwd)
    const before = gitignore()
    initWorkspace(".tasks", cwd)
    expect(gitignore()).toBe(before)
    expect(gitignore().match(/\.archive\.lock/g)).toHaveLength(1)
  })

  it("自定义 --dir：在指定目录生成骨架", () => {
    const { cwd } = track(runInDir("tk-init-dir-"))
    const month = todayCompact().slice(0, 6)
    initWorkspace("work", cwd)
    expect(existsSync(join(cwd, "work", "active", month))).toBe(true)
    expect(existsSync(join(cwd, "work", "archive"))).toBe(true)
  })

  it("绝对路径 --dir：任务区生成到项目外指定目录", () => {
    const { cwd } = track(runInDir("tk-init-abs-"))
    const outer = mkdtempSync(join(tmpdir(), "tk-init-outer-"))
    track({ cwd: outer })
    const month = todayCompact().slice(0, 6)
    initWorkspace(outer, cwd)
    expect(existsSync(join(outer, "active", month))).toBe(true)
    expect(existsSync(join(outer, "archive"))).toBe(true)
    // .gitignore 片段仍写入项目内
    expect(existsSync(join(cwd, ".gitignore"))).toBe(true)
  })
})

describe("initWorkspace .gitignore 处理", () => {
  it("已有 .gitignore 且结尾无换行：追加片段并保留原内容", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-append-"))
    writeFileSync(join(cwd, ".gitignore"), "node_modules", "utf8")
    initWorkspace(".tasks", cwd)
    const content = gitignore()
    expect(content.startsWith("node_modules")).toBe(true)
    expect(content).toContain("# @fxri/toolkit")
    expect(content).toContain(".archive.lock")
  })

  it("片段已存在（CRLF 风格）时跳过追加", () => {
    const { cwd, gitignore } = track(runInDir("tk-init-skip-"))
    writeFileSync(join(cwd, ".gitignore"), "node_modules\r\n.archive.lock\r\n", "utf8")
    initWorkspace(".tasks", cwd)
    expect(gitignore()).toBe("node_modules\r\n.archive.lock\r\n")
  })

  it(".tasks 已存在时保留现有内容不覆盖", () => {
    const { cwd } = track(runInDir("tk-init-keep-"))
    mkdirSync(join(cwd, ".tasks", "active"), { recursive: true })
    writeFileSync(join(cwd, ".tasks", "active", "keep.md"), "keep", "utf8")
    initWorkspace(".tasks", cwd)
    expect(readFileSync(join(cwd, ".tasks", "active", "keep.md"), "utf8")).toBe("keep")
  })
})

// 清理全部临时目录
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})
