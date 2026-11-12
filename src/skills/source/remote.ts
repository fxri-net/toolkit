// 技能真源与现场（remote）：自 source.ts 按职责拆分，逻辑逐字未改
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { getHomeDir } from "../../config"
import { resolveCacheEntry } from "../../cache"
import { BUILTIN_SOURCE, type SkillItem } from "../types"
import { assertSkillAliases, listPackageSkills, resolveLocalSource, type SkillSource } from "./metadata"
import { packageVersion, skillsLinkDir, skillsPackageDir } from "./package"


export interface RemoteSpec {
  url: string
  ref?: string
}

// 判断输入是否为远程地址（本地盘符路径不在此列）
function isRemoteSpec(spec: string): boolean {
  return /^(?:https?:\/\/|ssh:\/\/|git@|github:|file:\/\/)/.test(spec.trim())
}

// 解析远程地址：github: 简写展开、#ref 拆分、常见写法归一
export function parseRemoteSpec(spec: string): RemoteSpec {
  const hash = spec.lastIndexOf("#")
  const rawUrl = hash > 0 ? spec.slice(0, hash) : spec
  const ref = hash > 0 ? spec.slice(hash + 1).trim() : ""
  let url = rawUrl.trim()
  if (url.startsWith("github:")) url = `https://github.com/${url.slice("github:".length)}`
  if (!/^(?:https?:\/\/|ssh:\/\/|git@|file:\/\/)/.test(url)) throw new Error(`无法识别的技能来源：${spec}`)
  // 常见写法归一为同一来源标识：去末尾斜杠与 .git 后缀（file:// 保留原路径形态）
  if (!url.startsWith("file://")) url = url.replace(/\/+$/, "").replace(/\.git$/, "")
  if (url.startsWith("http://")) console.warn(`⚠️ 远程来源使用明文 HTTP：${url}，建议改用 HTTPS`)
  return { url, ref: ref || undefined }
}

// 统一来源入口：本地路径优先，其余按远程地址克隆到缓存后再复用本地解析
export function resolveSource(spec: string, options: { name?: string; temporary?: boolean; dryRun?: boolean } = {}): SkillSource {
  if (isRemoteSpec(spec)) return resolveRemoteSource(spec, options)
  return resolveLocalSource(spec, options)
}

// 刷新远程来源缓存：未缓存则克隆，已缓存则 fetch + checkout；本地来源由调用方直接重读
export function refreshRemoteSource(spec: string): void {
  if (!isRemoteSpec(spec)) return
  const parsed = parseRemoteSpec(spec)
  const dest = remoteCacheDir(parsed)
  if (!existsSync(dest)) cloneRemote(parsed, dest)
  else refreshRemote(dest, parsed)
}

// 远程来源缓存目录：地址 + ref 派生稳定标识，统一落在用户级缓存 ~/.toolkit/cache/skill-sources
// 旧版 ~/.agents/.toolkit-sources 在首次访问时惰性迁移
function remoteCacheDir(spec: RemoteSpec): string {
  const key = createHash("sha256").update(`${spec.url}@${spec.ref ?? ""}`).digest("hex").slice(0, 16)
  return resolveCacheEntry(join("skill-sources", key), join(getHomeDir(), ".agents", ".toolkit-sources", key), "dir")
}

// 仓库名：地址最后一段去 .git 后缀，作为 manifest 未声明 name 时的来源名
function remoteRepoName(url: string): string {
  const cleaned = url.replace(/\/+$/, "").replace(/\.git$/, "")
  return cleaned.split(/[/:]/).filter(Boolean).pop() ?? "remote"
}

// git 命令执行：失败带上 stderr，git 缺失单独归因
function runGit(args: string[]): void {
  const result = spawnSync("git", args, { encoding: "utf8" })
  if (result.error) throw new Error(`git 不可用：${result.error.message}`)
  if (result.status !== 0) throw new Error(`git ${args[0]} 失败：${(result.stderr || result.stdout || "").trim()}`)
}

// 克隆远程来源：分支 / 标签走 clone --branch，提交 SHA 走 init + fetch
function cloneRemote(spec: RemoteSpec, dest: string): void {
  const tmp = `${dest}.tmp-${process.pid}-${Date.now().toString(36)}`
  mkdirSync(dirname(dest), { recursive: true, mode: 0o700 })
  try {
    if (spec.ref && /^[0-9a-f]{40}$/i.test(spec.ref)) {
      mkdirSync(tmp, { recursive: true })
      runGit(["init", "-q", tmp])
      runGit(["-C", tmp, "remote", "add", "origin", spec.url])
      runGit(["-C", tmp, "fetch", "--depth", "1", "origin", spec.ref])
      runGit(["-C", tmp, "checkout", "-q", "FETCH_HEAD"])
    } else {
      const args = ["clone", "--depth", "1"]
      if (spec.ref) args.push("--branch", spec.ref)
      args.push(spec.url, tmp)
      runGit(args)
    }
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    renameSync(tmp, dest)
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true })
    throw e
  }
}

// 缓存刷新：失败保留旧缓存并告警，不阻断安装
function refreshRemote(cacheDir: string, spec: RemoteSpec): void {
  const ref = spec.ref ?? "HEAD"
  const fetched = spawnSync("git", ["-C", cacheDir, "fetch", "--depth", "1", "origin", ref], { encoding: "utf8" })
  if (fetched.status !== 0) {
    console.warn(`⚠️ 远程来源刷新失败，使用本地缓存：${spec.url}`)
    return
  }
  const checked = spawnSync("git", ["-C", cacheDir, "checkout", "-q", "FETCH_HEAD"], { encoding: "utf8" })
  if (checked.status !== 0) console.warn(`⚠️ 远程来源检出失败，使用本地缓存：${spec.url}`)
}

// 解析远程来源：缓存命中直接复用；dry-run 不写持久缓存
export function resolveRemoteSource(spec: string, options: { name?: string; temporary?: boolean; dryRun?: boolean } = {}): SkillSource {
  const remote = parseRemoteSpec(spec)
  const cacheDir = remoteCacheDir(remote)
  let root: string
  if (existsSync(cacheDir)) {
    refreshRemote(cacheDir, remote)
    root = cacheDir
  } else if (options.dryRun) {
    root = mkdtempSync(join(tmpdir(), "toolkit-src-"))
    process.once("exit", () => rmSync(root, { recursive: true, force: true }))
    cloneRemote(remote, root)
  } else {
    cloneRemote(remote, cacheDir)
    root = cacheDir
  }
  const local = resolveLocalSource(root, { name: options.name, temporary: options.temporary })
  const name = options.name || (local.name === basename(root) ? remoteRepoName(remote.url) : local.name)
  return { ...local, name, url: remote.url, ref: remote.ref }
}

// 内置来源：包内 skills/
export function resolveBuiltinSource(): SkillSource {
  const skills = listPackageSkills()
  assertSkillAliases(BUILTIN_SOURCE, skills)
  return {
    name: BUILTIN_SOURCE,
    kind: "builtin",
    root: skillsPackageDir(),
    version: packageVersion(),
    temporary: false,
    skills,
  }
}

// 来源 → 统一技能条目：内置源链接锚在 pnpm 稳定入口，外部来源直指技能真源目录
export function sourceSkillItems(source: SkillSource): SkillItem[] {
  return source.skills.map((skill) => ({
    ...skill,
    source: source.name,
    sourceKind: source.kind,
    sourceRoot: source.root,
    sourceUrl: source.url,
    sourceRef: source.ref,
    temporary: source.temporary,
    linkTarget: source.kind === "builtin" ? join(skillsLinkDir(), skill.name) : skill.dir,
  }))
}

// 跨来源同名检查：同名技能会共用落点与状态条目，直接报错而非静默覆盖
// 曾用名同样参与唯一性检查：别名与现用名或其他别名重复时，改名迁移会产生歧义
export function assertUniqueSkillNames(items: SkillItem[]): void {
  const seen = new Map<string, string>()
  for (const item of items) {
    const previous = seen.get(item.name)
    if (previous !== undefined) throw new Error(`技能名冲突：${item.name}（来源 ${previous} / ${item.source}）`)
    seen.set(item.name, item.source)
  }
  const names = new Set(items.map((item) => item.name))
  const aliasOwners = new Map<string, string>()
  for (const item of items) {
    for (const old of item.previousNames) {
      if (names.has(old)) throw new Error(`技能曾用名与现用名冲突：${old}（来源 ${item.source} 的技能 ${item.name}）`)
      const owner = aliasOwners.get(old)
      if (owner !== undefined) throw new Error(`技能曾用名冲突：${old}（${owner} / ${item.name}）`)
      aliasOwners.set(old, item.name)
    }
  }
}

// 依赖展开：按 requires 递归补全技能名；缺失依赖单独回报，由调用方告警
export function expandSkillRequires(items: SkillItem[], names: string[]): { names: string[]; missing: string[] } {
  const byName = new Map(items.map((item) => [item.name, item]))
  const result = new Set(names)
  const missing = new Set<string>()
  const visit = (name: string): void => {
    const item = byName.get(name)
    if (!item) return
    for (const dep of item.requires) {
      if (!byName.has(dep)) {
        missing.add(dep)
        continue
      }
      if (result.has(dep)) continue
      result.add(dep)
      visit(dep)
    }
  }
  for (const name of names) visit(name)
  return { names: [...result], missing: [...missing] }
}

