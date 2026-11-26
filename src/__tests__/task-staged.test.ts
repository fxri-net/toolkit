// active 任务暂存检查：任务目录配置感知、放行变量、暂存删除与重命名不误报
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ALLOW_ACTIVE_TASKS_ENV, checkStagedActiveTasks } from "../tasks/staged"

const dirs: string[] = []

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
}

function put(root: string, rel: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), "x\n", "utf8")
}

// 带初始提交的 git 仓库：后续可 reset / rm --cached
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "fxts-tk-task-staged-"))
  dirs.push(root)
  git(root, ["init", "-q"])
  git(root, ["config", "user.email", "test@example.com"])
  git(root, ["config", "user.name", "test"])
  put(root, "README.md")
  git(root, ["add", "."])
  git(root, ["commit", "-q", "-m", "init"])
  return root
}

afterEach(() => {
  delete process.env[ALLOW_ACTIVE_TASKS_ENV]
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("active 任务暂存检查", () => {
  it("按任务目录配置命中 active，只暂存代码时不报", () => {
    const root = repo()
    put(root, "work/tasks/active/a.md")
    put(root, "src/a.ts")
    git(root, ["add", "."])
    expect(checkStagedActiveTasks({ cwd: root, taskDir: "work/tasks" }).map((item) => item.file)).toEqual([
      "work/tasks/active/a.md",
    ])

    git(root, ["reset", "-q"])
    git(root, ["add", "src/a.ts"])
    expect(checkStagedActiveTasks({ cwd: root, taskDir: "work/tasks" })).toEqual([])
  })

  it("默认 .tasks 布局同样生效", () => {
    const root = repo()
    put(root, ".tasks/active/b.md")
    git(root, ["add", "."])
    expect(checkStagedActiveTasks({ cwd: root, taskDir: ".tasks" }).map((item) => item.file)).toEqual([".tasks/active/b.md"])
  })

  it("放行变量与非 git 目录都返回空", () => {
    const root = repo()
    put(root, ".tasks/active/c.md")
    git(root, ["add", "."])
    process.env[ALLOW_ACTIVE_TASKS_ENV] = "1"
    expect(checkStagedActiveTasks({ cwd: root, taskDir: ".tasks" })).toEqual([])
    delete process.env[ALLOW_ACTIVE_TASKS_ENV]

    const outside = mkdtempSync(join(tmpdir(), "fxts-tk-task-staged-nogit-"))
    dirs.push(outside)
    expect(checkStagedActiveTasks({ cwd: outside, taskDir: ".tasks" })).toEqual([])
  })

  it("已跟踪 active 的暂存删除与改名到 archive 不误报", () => {
    const root = repo()
    put(root, ".tasks/active/legacy.md")
    put(root, ".tasks/active/renamed.md")
    git(root, ["add", "."])
    git(root, ["commit", "-q", "-m", "legacy"])

    rmSync(join(root, ".tasks/active/legacy.md"))
    mkdirSync(join(root, ".tasks/archive"), { recursive: true })
    git(root, ["mv", ".tasks/active/renamed.md", ".tasks/archive/renamed.md"])
    git(root, ["add", "-A"])
    expect(checkStagedActiveTasks({ cwd: root, taskDir: ".tasks" })).toEqual([])
  })
})
