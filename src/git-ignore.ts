// git 探测：忽略判定、仓库根判定、已跟踪判定与路径归一共用函数
// 独立成模块的原因：忽略判定被入口壳体检、本地配置层体检、init 三处共用；放在 conventions/ 下会让配置域反向依赖规范域
// 只依赖 node:child_process 与 node:path，不引入任何业务模块，保证被任意域安全复用
import { spawnSync } from "node:child_process"
import { basename, dirname } from "node:path"

// 本地配置文件忽略判定：四态（已忽略 / 已跟踪 / 未忽略 / 不适用两态）+ 一诊断态
export type LocalConfigIgnoreState = "ignored" | "tracked" | "not-ignored" | "not-a-repo" | "outside-repo" | "unavailable"

// 本地配置忽略判定结果：unavailable 携带 stderr 摘要供诊断，其余态无附加信息
export interface LocalConfigIgnore {
  state: LocalConfigIgnoreState
  detail?: string
}

// 仓库探针结果：repo 携带仓库根绝对路径；no-a-repo 与 unavailable 区分「不适用」与「真实故障」
export type RepoProbe = { kind: "repo"; root: string } | { kind: "not-a-repo" } | { kind: "unavailable"; detail: string }

// 单文件忽略探针结果
export type IgnoreProbe = { state: "ignored" | "not-ignored" | "not-a-repo" | "outside-repo" } | { state: "unavailable"; detail: string }

// git 调用结果：status 归一为数字（子进程无法启动为 -1），stdout / stderr 容错为空串
interface GitResult {
  status: number
  stdout: string
  stderr: string
}

// 统一 git 调用出口：把 spawnSync 的 null status、缺失的 stdout / stderr 与同步抛错统一归一到 GitResult
// 子进程在测试中被 mock 时不会带 stdout / stderr，故一律用空串兜底，避免调用方解构崩溃
function runGit(args: string[], cwd: string, input?: string): GitResult {
  try {
    const res = spawnSync("git", args, { cwd, ...(input === undefined ? {} : { input }), encoding: "utf8" })
    return { status: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" }
  } catch (err) {
    return { status: -1, stdout: "", stderr: err instanceof Error ? err.message : String(err) }
  }
}

// 判单个文件是否被 git 忽略：以文件所在目录为 cwd 执行，只看退出码不看输出
// exit 0 有命中 / 1 无命中（已跟踪文件也返回 1，故须先经 isTracked 区分）/ 128 及其他错误按 stderr 细分归因
export function checkIgnore(absPath: string): IgnoreProbe {
  const res = runGit(["check-ignore", "--quiet", "--", toPosix(absPath)], dirname(absPath))
  if (res.status === 0) return { state: "ignored" }
  if (res.status === 1) return { state: "not-ignored" }
  if (/not a git repository/i.test(res.stderr)) return { state: "not-a-repo" }
  if (/outside repository/i.test(res.stderr)) return { state: "outside-repo" }
  return { state: "unavailable", detail: res.stderr.trim() || `git check-ignore 退出码 ${res.status}` }
}

// 批量判路径是否被 git 忽略：一次 git check-ignore --stdin -z 判定全部落点，免去逐条各起一个子进程
// 返回被忽略的路径集合（入参原样回填，调用方据此 O(1) 查询）；非 git 仓库或执行出错按「均未忽略」处理
export function gitIgnoredSet(cwd: string, rels: string[]): Set<string> {
  const ignored = new Set<string>()
  if (rels.length === 0) return ignored
  const res = runGit(["check-ignore", "--stdin", "-z"], cwd, rels.map((r) => `${r}\0`).join(""))
  // exit 0 有命中 / 1 无命中，均属正常；其余（128 非仓库等）视为未忽略
  if (res.status !== 0 && res.status !== 1) return ignored
  for (const line of res.stdout.split("\0")) {
    if (line) ignored.add(line)
  }
  return ignored
}

// 判本地配置文件在所属仓库中的忽略状态：仓库探针 → 工作树归属 → 是否已跟踪 → 忽略规则，逐级归因
// 已跟踪须先于忽略判定：已跟踪文件写进忽略规则也不生效，check-ignore 只会返回「未忽略」，不单独识别会误判
export function inspectLocalConfigIgnore(absPath: string, cwd: string): LocalConfigIgnore {
  const repo = probeRepo(cwd)
  if (repo.kind === "not-a-repo") return { state: "not-a-repo" }
  if (repo.kind === "unavailable") return { state: "unavailable", detail: repo.detail }
  if (!isInsideWorktree(absPath, repo.root)) return { state: "outside-repo" }
  const tracked = isTracked(absPath)
  if (tracked === undefined) return { state: "unavailable", detail: "git ls-files 执行失败" }
  if (tracked) return { state: "tracked" }
  const ignore = checkIgnore(absPath)
  if (ignore.state === "unavailable") return { state: "unavailable", detail: ignore.detail }
  return { state: ignore.state }
}

// 判目标路径是否位于仓库工作树内：两侧归一后按「相等或以根 + / 开头」比较，避免 /repo 误命中 /repo2
export function isInsideWorktree(absPath: string, root: string): boolean {
  const target = normalizePathForCompare(absPath)
  const base = normalizePathForCompare(root)
  return target === base || target.startsWith(`${base}/`)
}

// 判文件是否已被 git 跟踪：返回 undefined 表判定不可用（git 执行失败），供上层归入诊断态
export function isTracked(absPath: string): boolean | undefined {
  const res = runGit(["ls-files", "--error-unmatch", "--", basename(absPath)], dirname(absPath))
  if (res.status === 0) return true
  if (res.status === 1) return false
  return undefined
}

// 比较用路径归一：分隔符转正斜杠、去尾部斜杠、盘符大小写统一
// git rev-parse 在 Windows 返回正斜杠路径、盘符大小写也可能与 Node path.resolve 不同，不归一必失配
export function normalizePathForCompare(p: string): string {
  return toPosix(p).replace(/\/+$/, "").toLowerCase()
}

// 探测 cwd 所属 git 仓库根：非仓库与执行不可用分别归因，供上层区分「不适用」与「真实故障」
export function probeRepo(cwd: string): RepoProbe {
  const res = runGit(["rev-parse", "--show-toplevel"], cwd)
  if (res.status === 0) {
    const root = res.stdout.trim()
    // 子进程被 mock 或 git 异常返回空根路径时无法定位仓库，归诊断态而非误报某一具体态
    if (!root) return { kind: "unavailable", detail: "git rev-parse 未返回仓库根路径" }
    return { kind: "repo", root }
  }
  if (/not a git repository/i.test(res.stderr)) return { kind: "not-a-repo" }
  return { kind: "unavailable", detail: res.stderr.trim() || `git rev-parse 退出码 ${res.status}` }
}

// 路径分隔符归一为正斜杠：git 输出恒为正斜杠，Node path 在 Windows 为反斜杠，比较或传参前须统一
export function toPosix(p: string): string {
  return p.replace(/\\/g, "/")
}
