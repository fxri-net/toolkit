// 暂存区校验：active 任务档默认不入库（不写 .gitignore，保持 git status 可见）
// 性能口径：未传 --staged 不进入；非 git 仓库不启动 git；命中仓库时只调用一次 git diff
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { findGitRoot } from "../scope/paths"
import { isInside } from "../skills/source/paths"

export const ALLOW_ACTIVE_TASKS_ENV = "FX_TOOLKIT_ALLOW_ACTIVE_TASKS"

export interface StagedActiveIssue {
  // 仓库根相对路径（正斜杠）
  file: string
  message: string
}

// 暂存区内的 active 任务档：放行变量、非 git 或 git 不可用时返回空数组
export function checkStagedActiveTasks(options: { taskDir: string; cwd?: string }): StagedActiveIssue[] {
  if (process.env[ALLOW_ACTIVE_TASKS_ENV] === "1") return []
  const cwd = options.cwd ?? process.cwd()
  const root = findGitRoot(cwd)
  if (!root) return []
  let output: string
  try {
    output = execFileSync("git", ["-c", "core.quotepath=false", "diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return []
  }
  const activeDir = resolve(cwd, options.taskDir, "active")
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => isInside(resolve(root, file), activeDir))
    .map((file) => ({
      file,
      message: "active 任务档默认不入库：先归档（toolkit task archive）再提交；确需提交用 FX_TOOLKIT_ALLOW_ACTIVE_TASKS=1 放行",
    }))
}
