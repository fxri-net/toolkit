// git 探测：忽略判定、仓库根判定、已跟踪判定与路径归一共用函数
// 独立成模块的原因：忽略判定被入口壳体检、本地配置层体检、init 三处共用；放在 conventions/ 下会让配置域反向依赖规范域
// 只依赖 node:child_process、node:fs 与 node:path，不引入任何业务模块，保证被任意域安全复用
import { spawnSync } from "node:child_process"
import { realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"

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

// 路径真实形态归一：取磁盘真实路径形态（展开 Windows 8.3 短名、折叠软链与大小写），使同一目录的不同书写形态可比
// 仅对绝对路径生效，相对路径与盘符相对路径原样返回，避免被按当前工作目录强行解读而改变语义
// 目标路径（或其最近存在的祖先）不可解析时回退原串，保证路径不存在等失败场景行为不变
export function canonicalPath(p: string): string {
  if (!isAbsolute(p)) return p
  let current = p
  const tail: string[] = []
  for (;;) {
    try {
      const real = realpathSync.native(current)
      return tail.length === 0 ? real : join(real, ...tail.reverse())
    } catch {
      const parent = dirname(current)
      // 已到根仍不可解析即回退原串，不再向上，避免死循环
      if (parent === current) return p
      tail.push(basename(current))
      current = parent
    }
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

// 批量列被 git 忽略的路径：--directory 让整体被忽略的子树折叠成一条，供目录遍历时整棵跳过
// 返回绝对路径集合（正斜杠），非 git 仓库或执行出错返回空集，调用方按「未忽略」继续
export function gitIgnoredDirs(cwd: string): Set<string> {
  const out = new Set<string>()
  const res = runGit(["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], cwd)
  if (res.status !== 0) return out
  for (const line of res.stdout.split("\0")) {
    if (!line) continue
    out.add(toPosix(resolve(cwd, line.replace(/\/$/, ""))))
  }
  return out
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

// 判目标路径是否位于仓库工作树内：两侧先取磁盘真实形态再归一比对，避免同一目录的两种书写形态（Windows 8.3 短名 / 软链）
// 相互失配而误归 outside-repo；按「相等或以根 + / 开头」比较，避免 /repo 误命中 /repo2
export function isInsideWorktree(absPath: string, root: string): boolean {
  const target = normalizePathForCompare(canonicalPath(absPath))
  const base = normalizePathForCompare(canonicalPath(root))
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

// 单条忽略规则：否定标记、目录限定与编译后的正则
// 单条忽略规则：目录限定与编译后的正则（`!` 前缀在编译时剥离，是否有否定由调用方按原行判断）
interface IgnoreRule {
  dirOnly: boolean
  re: RegExp
}

// 通配转正则：* 不跨目录、? 单字符、** 跨目录、[] 字符组，其余字符按字面转义
function globToRegExp(glob: string): string {
  let out = ""
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i]!
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        // **/ 可匹配零到多级目录，其余 ** 跨任意字符
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?"
          i += 2
        } else {
          out += ".*"
          i += 1
        }
      } else out += "[^/]*"
    } else if (ch === "?") out += "[^/]"
    else if (ch === "[") {
      const close = glob.indexOf("]", i + 1)
      if (close === -1) out += "\\["
      else {
        out += `[${glob.slice(i + 1, close).replace(/\\/g, "\\\\")}]`
        i = close
      }
    } else out += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
  }
  return out
}

// 编译单行规则：注释与空行返回 null；含斜杠或以斜杠开头即锚定到 .gitignore 所在目录
function compileIgnoreRule(line: string): IgnoreRule | null {
  let raw = line.replace(/\s+$/, "")
  if (raw === "" || raw.startsWith("#")) return null
  if (raw.startsWith("!")) raw = raw.slice(1)
  let dirOnly = false
  if (raw.endsWith("/")) {
    dirOnly = true
    raw = raw.replace(/\/+$/, "")
  }
  if (raw === "") return null
  const anchored = raw.includes("/")
  const body = globToRegExp(raw.replace(/^\/+/, ""))
  return { dirOnly, re: new RegExp(anchored ? `^${body}$` : `(^|/)${body}$`) }
}

// 返回最后命中该路径的规则行（保留 `!` 前缀，供调用方区分「被忽略」与「被显式取消忽略」）；无命中返回 null
export function lastIgnoreRule(lines: string[], relPath: string): string | null {
  const path = toPosix(relPath).replace(/^\.?\//, "")
  const segments = path.split("/")
  const dirs = segments.slice(0, -1).map((_segment, index) => segments.slice(0, index + 1).join("/"))
  const candidates = [...dirs, path]
  let hit: string | null = null
  for (const line of lines) {
    const rule = compileIgnoreRule(line)
    if (!rule) continue
    const targets = rule.dirOnly ? dirs : candidates
    if (targets.some((target) => rule.re.test(target))) hit = line
  }
  return hit
}

// 判路径是否被忽略规则命中：按 gitignore 语义逐条应用，后命中覆盖先命中；目录命中的规则同样忽略其下全部路径
// 用途：.gitignore 尚未纳入版本库（init 首跑）时也能按通配 / 目录 / 否定判定覆盖，不只认全名
export function isIgnoredByRules(lines: string[], relPath: string): boolean {
  const hit = lastIgnoreRule(lines, relPath)
  return hit !== null && !hit.trimStart().startsWith("!")
}
