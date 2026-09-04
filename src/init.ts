// init 命令实现：生成 .tasks/ 骨架与 .gitignore 片段，重复执行幂等（已存在一律跳过不覆盖）
import { existsSync, readFileSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { writeFileAtomic } from "./write-atomic"
import { todayCompact } from "./date"

// init 时输出的后续步骤提示（getting-started / guide 链接与文档站同源）
export const INIT_LINKS = {
  site: "https://fxri-net.github.io/toolkit/",
  gettingStarted: "https://fxri-net.github.io/toolkit/getting-started",
  guide: "https://fxri-net.github.io/toolkit/guide",
}

// .gitignore 追加片段：排他锁是运行时文件不入库，任务目录其余内容必须入库
const GITIGNORE_SNIPPET = "\n# @fxri/toolkit 归档排他锁（运行时文件，不入库）\n.archive.lock\n"

// 初始化项目任务区：创建 .tasks/active/{YYYYMM}/、.tasks/archive/ 与 .gitignore 片段
// dir 为任务目录（默认 .tasks，支持绝对路径或 ../ 相对路径指向项目外），cwd 为仓库根（.gitignore 所在目录）
export function initWorkspace(dir = ".tasks", cwd = process.cwd()): void {
  const month = todayCompact().slice(0, 6)
  // resolve：dir 为绝对路径（项目外独立仓库）时直接使用，相对路径时基于 cwd 解析
  const root = resolve(cwd, dir)
  mkdirSync(join(root, "active", month), { recursive: true })
  mkdirSync(join(root, "archive"), { recursive: true })
  appendGitignore(cwd)
}

// 向 .gitignore 追加忽略片段；片段已存在（含人工提前手写）或文件存在但无写权限时跳过
export function appendGitignore(cwd: string): void {
  const file = join(cwd, ".gitignore")
  if (!existsSync(file)) {
    // 无 .gitignore：直接创建并写入片段
    writeFileAtomic(file, GITIGNORE_SNIPPET)
    return
  }
  const raw = readFileSync(file, "utf8")
  if (raw.includes(".archive.lock")) return
  // 统一 LF 处理后追加，保留原换行风格
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  const base = raw.endsWith("\n") || raw === "" ? raw : raw + eol
  writeFileAtomic(file, base + GITIGNORE_SNIPPET.replace(/\n/g, eol).replace(/^\r?\n/, ""))
}
