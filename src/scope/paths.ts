// 作用域路径工具：展开 ~、按字符串口径归一、定位 git 根与远端；不做目录遍历
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { normalizePathForCompare } from "../git-ignore"

// 展开 ~ 前缀；其余原样返回
export function expandHome(input: string, home = homedir()): string {
  if (input === "~") return home
  if (input.startsWith("~/") || input.startsWith("~\\")) return join(home, input.slice(2))
  return input
}

// 归一为绝对路径：展开 ~、相对路径按 base 解析，只做词法归一——不解析符号链接，避免结论随宿主漂移
export function resolveComparablePath(input: string, base = process.cwd(), home = homedir()): string {
  const expanded = expandHome(input, home)
  return isAbsolute(expanded) ? resolve(expanded) : resolve(base, expanded)
}

// 规则匹配口径：绝对路径再统一分隔符、大小写并去尾斜杠——同一份规则在三平台得到同一结论
export function normalizeRulePath(input: string, base = process.cwd(), home = homedir()): string {
  return normalizePathForCompare(resolveComparablePath(input, base, home))
}

// 字面路径判定：re: 正则或含通配符的规则不是真实路径，存在性检查应跳过
export function isLiteralPath(rule: string): boolean {
  return !rule.startsWith("re:") && !/[*?]/.test(rule)
}

// 目录覆盖规则：裸路径补 /**，已含通配符或 re: 正则原样保留，避免重复追加
export function toTreePattern(input: string): string {
  const value = input.trim().replace(/[\\/]+$/, "")
  if (!value || value.startsWith("re:") || /[*?]/.test(value)) return input
  return `${value}/**`
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

// 判定基准：项目根优先——git 根优先，其次向上最近的含 .tasks 的目录，都没有则回落起点
export function findProjectRoot(start = process.cwd()): string {
  const gitRoot = findGitRoot(start)
  if (gitRoot) return gitRoot
  let current = resolve(start)
  const origin = current
  for (;;) {
    if (existsSync(join(current, ".tasks"))) return current
    const parent = dirname(current)
    if (parent === current) return origin
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
