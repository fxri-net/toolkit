// 作用域路径工具：展开 ~、取真实形态、定位 git 根与远端；不做目录遍历
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { canonicalPath } from "../git-ignore"

// 展开 ~ 前缀；其余原样返回
export function expandHome(input: string, home = homedir()): string {
  if (input === "~") return home
  if (input.startsWith("~/") || input.startsWith("~\\")) return join(home, input.slice(2))
  return input
}

// 把用户书写的路径归一为可比较的绝对路径：展开 ~、相对路径按 base 解析、取真实形态
export function resolveComparablePath(input: string, base = process.cwd(), home = homedir()): string {
  const expanded = expandHome(input, home)
  const absolute = isAbsolute(expanded) ? expanded : resolve(base, expanded)
  return canonicalPath(absolute)
}

// 向上查找 git 根：命中 .git（普通仓库目录或 worktree 文件）即返回，找不到返回 null
export function findGitRoot(start = process.cwd()): string | null {
  let current = resolve(start)
  for (;;) {
    if (existsSync(join(current, ".git"))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

// 归一 git 远端：去掉协议与用户、把 scp 形式的 `host:path` 改为 `host/path`、去掉尾部 .git
// 让 https / ssh / scp 三种写法都能用同一组 glob 匹配
export function normalizeRemote(url: string): string {
  let value = url.trim()
  value = value.replace(/^git\+/, "")
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
  value = value.replace(/^[^@/]+@/, "")
  const scpLike = /^([^/:]+):(.+)$/.exec(value)
  if (scpLike) value = `${scpLike[1]}/${scpLike[2]}`
  value = value.replace(/\.git$/, "").replace(/\/+$/, "")
  return value
}

// 读取 origin 远端：失败或超时返回 null，由调用方按未命中处理（不阻断判定）
export function readGitRemote(root: string, timeout = 1000): string | null {
  const result = spawnSync("git", ["config", "--get", "remote.origin.url"], { cwd: root, encoding: "utf8", timeout })
  if (result.status !== 0) return null
  const url = (result.stdout ?? "").trim()
  return url || null
}
