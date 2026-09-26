// init 命令单测：骨架生成、重复执行幂等、.gitignore 追加与跳过
import { describe, it, expect, afterAll } from "vitest"
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { initWorkspace } from "../init"
import { todayCompact } from "../date"
import { CARRIER_MARKER, ENTRY_MARKER, HISTORY_TITLE } from "../conventions/format"
import { AGENTS_POINTER_END, AGENTS_POINTER_START, ENTRY_SHELL_NAME, FALLBACK_SKILL_DIR, SKILL_ENTRY } from "../conventions/entry"

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

describe("initWorkspace 规范载体骨架", () => {
  it("空目录生成 index.md（三节，首行为 v2 标记）与 history.md", () => {
    const { cwd } = track(runInDir("tk-init-conv-"))
    initWorkspace(".tasks", cwd)
    const index = readFileSync(join(cwd, ".tasks", "conventions", "index.md"), "utf8")
    expect(index.split(/\r?\n/, 1)[0]).toBe(CARRIER_MARKER)
    expect(index).toContain("## 一、端清单")
    expect(index).toContain("## 二、索引")
    expect(index).toContain("## 三、用法说明")
    expect(index).not.toContain("## 四、")
    const history = readFileSync(join(cwd, ".tasks", "conventions", "history.md"), "utf8")
    expect(history.split(/\r?\n/, 1)[0]).toBe(HISTORY_TITLE)
  })

  it("重复执行与已有索引均不覆盖", () => {
    const { cwd } = track(runInDir("tk-init-conv-keep-"))
    const index = join(cwd, ".tasks", "conventions", "index.md")
    mkdirSync(join(cwd, ".tasks", "conventions"), { recursive: true })
    writeFileSync(index, "custom", "utf8")
    initWorkspace(".tasks", cwd)
    expect(readFileSync(index, "utf8")).toBe("custom")
  })

  it("旧单文件 conventions.md 存在时不建空骨架（迁移由迁移流程接管）", () => {
    const { cwd } = track(runInDir("tk-init-conv-legacy-"))
    mkdirSync(join(cwd, ".tasks"), { recursive: true })
    writeFileSync(join(cwd, ".tasks", "conventions.md"), "# 旧规范\n", "utf8")
    initWorkspace(".tasks", cwd)
    expect(existsSync(join(cwd, ".tasks", "conventions"))).toBe(false)
  })

  it("已有 v1 载体时保持不动并在报告里提示可升级", () => {
    const { cwd } = track(runInDir("tk-init-conv-v1-"))
    const dir = join(cwd, ".tasks", "conventions")
    mkdirSync(dir, { recursive: true })
    const v1 =
      "# 项目协作规范索引\n\n## 二、索引\n\n| # | 规则 | 当前语义 | 归属 | 状态 | 确立来源任务 | 单一事实源 |\n| --- | --- | --- | --- | --- | --- | --- |\n| 1 | 甲 | 乙 | common | 生效 | t | common.md |\n"
    writeFileSync(join(dir, "index.md"), v1, "utf8")

    const report = initWorkspace(".tasks", cwd)
    expect(readFileSync(join(dir, "index.md"), "utf8")).toBe(v1)
    const kept = report.products.find((p) => p.target.endsWith("conventions/index.md"))
    expect(kept?.action).toBe("kept")
    expect(kept?.hint).toContain("toolkit conventions upgrade")
  })
})

describe("initWorkspace 技能入口层", () => {
  it("生成入口壳（无候选目录时回落 .agents/skills）并在 AGENTS.md 已存在时追加指针块", () => {
    const { cwd } = track(runInDir("tk-init-shell-"))
    writeFileSync(join(cwd, "AGENTS.md"), "# AGENTS\n", "utf8")

    const report = initWorkspace(".tasks", cwd)
    const shellFile = join(cwd, FALLBACK_SKILL_DIR, ENTRY_SHELL_NAME, SKILL_ENTRY)
    expect(existsSync(shellFile)).toBe(true)
    const shell = readFileSync(shellFile, "utf8")
    // frontmatter 置顶（Agent Skills 标准），形态标记退居其后
    expect(shell.split(/\r?\n/, 1)[0]).toBe("---")
    expect(shell).toContain(`name: ${ENTRY_SHELL_NAME}`)
    expect(shell).toContain(ENTRY_MARKER)
    const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8")
    expect(agents).toContain(AGENTS_POINTER_START)
    expect(agents).toContain(AGENTS_POINTER_END)
    expect(report.products.some((p) => p.action === "appended" && p.target === "AGENTS.md")).toBe(true)
  })

  it("已有项目级技能目录时优先落到该目录，不另造 .agents/", () => {
    const { cwd } = track(runInDir("tk-init-shelldir-"))
    // 候选目录存在与否是假现场输入，落点路径按约定拼装
    const skillDir = ".trae/skills"
    mkdirSync(join(cwd, skillDir), { recursive: true })

    const report = initWorkspace(".tasks", cwd)
    const rel = `${skillDir}/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}`
    expect(existsSync(join(cwd, rel))).toBe(true)
    expect(existsSync(join(cwd, FALLBACK_SKILL_DIR))).toBe(false)
    expect(report.products.some((p) => p.target === rel && p.action === "created")).toBe(true)
  })

  it("重复执行幂等：入口壳与指针块均保持不动", () => {
    const { cwd } = track(runInDir("tk-init-shelltwice-"))
    writeFileSync(join(cwd, "AGENTS.md"), "# AGENTS\n", "utf8")
    initWorkspace(".tasks", cwd)
    const agents = readFileSync(join(cwd, "AGENTS.md"), "utf8")

    const second = initWorkspace(".tasks", cwd)
    expect(readFileSync(join(cwd, "AGENTS.md"), "utf8")).toBe(agents)
    expect(second.products.filter((p) => p.action === "created")).toHaveLength(0)
  })

  it("AGENTS.md 不存在时不新建，指针块记为跳过", () => {
    const { cwd } = track(runInDir("tk-init-noagents-"))
    const report = initWorkspace(".tasks", cwd)
    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false)
    expect(report.products.find((p) => p.target === "AGENTS.md")?.action).toBe("skipped")
  })

  it("源仓库（package.json name 为 @fxri/toolkit）不生成入口壳与指针块", () => {
    const { cwd } = track(runInDir("tk-init-src-"))
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "@fxri/toolkit", version: "0.0.0" }), "utf8")
    writeFileSync(join(cwd, "AGENTS.md"), "# AGENTS\n", "utf8")

    const report = initWorkspace(".tasks", cwd)
    expect(existsSync(join(cwd, FALLBACK_SKILL_DIR))).toBe(false)
    expect(readFileSync(join(cwd, "AGENTS.md"), "utf8")).toBe("# AGENTS\n")
    expect(report.products.some((p) => p.action === "skipped" && p.target === "技能入口层")).toBe(true)
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
