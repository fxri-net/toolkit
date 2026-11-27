// 技能真源与现场（targets）：自 source.ts 按职责拆分，逻辑逐字未改
import { existsSync } from "node:fs"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { getHomeDir } from "../../config"
import { PROJECT_SKILL_DIRS, resolveProjectSkillDirs } from "../../conventions/entry"
import { AGENT_SKILL_DIRS, CANONICAL_DIR, CANONICAL_LABEL, CANONICAL_TARGET_NAME, LEGACY_SKILL_DIRS, PROJECT_SOURCE_DIR, type AgentEntry, type ProjectTargets, type SkillScope, type SkillTarget, type TargetKind } from "../types"
import { pnpmStableEntry, resolvePackageRoot } from "./package"
import { pathKey, realPath, isInside } from "./paths"
import { findProjectRoot, isHomeDirectory } from "../../scope/paths"


function envAbsoluteDir(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value && isAbsolute(value) ? value : undefined
}

// 解析 agent 全局技能目录：dirEnv 命中时用其值替换 dir 首段（如 XDG_CONFIG_HOME 替换 .config）
function resolveAgentDir(agent: AgentEntry): string {
  const override = agent.dirEnv ? envAbsoluteDir(agent.dirEnv) : undefined
  if (!override) return join(getHomeDir(), agent.dir)
  return join(override, ...agent.dir.split("/").slice(1))
}

// 解析 agent 探测路径：detect 中与 dir 同首段的相对路径随 dirEnv 迁移；detectEnv 把变量值（可加后缀）作为绝对路径补齐
function resolveAgentDetectPaths(agent: AgentEntry): string[] {
  const home = getHomeDir()
  const override = agent.dirEnv ? envAbsoluteDir(agent.dirEnv) : undefined
  const base = agent.dir.split("/")[0] ?? ""
  const paths: string[] = []
  for (const d of agent.detect ?? []) {
    if (override && (d === base || d.startsWith(`${base}/`))) paths.push(join(override, d.slice(base.length)))
    else paths.push(isAbsolute(d) ? d : join(home, d))
  }
  for (const [name, suffix] of Object.entries(agent.detectEnv ?? {})) {
    const value = envAbsoluteDir(name)
    if (value) paths.push(suffix ? join(value, suffix) : value)
  }
  return paths
}

// 解析目标三层：主目标 canonical → 快照表中「已安装」的 agent 全局技能目录 → --dir 兜底；同路径去重
export function resolveSkillTargets(extraDirs: string[] = []): SkillTarget[] {
  const out: SkillTarget[] = []
  const seen = new Set<string>()
  const push = (name: string, dir: string, label: string, kind: TargetKind, available: boolean) => {
    const abs = resolve(dir)
    const key = pathKey(abs)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name, dir: abs, label, kind, available, dirExists: existsSync(abs) })
  }
  push(CANONICAL_TARGET_NAME, join(getHomeDir(), CANONICAL_DIR), CANONICAL_LABEL, "primary", true)
  for (const agent of AGENT_SKILL_DIRS) {
    // 判据：技能目录的父目录（即 agent 配置目录）存在，或任一探测路径存在
    const dir = resolveAgentDir(agent)
    const available = existsSync(dirname(dir)) || resolveAgentDetectPaths(agent).some((p) => existsSync(p))
    push(agent.name, dir, agent.label, "agent", available)
  }
  for (const dir of extraDirs) push("", dir, "自定义 --dir", "custom", true)
  return out
}

// 目标选择解析结果：invalid 为未知目标名，unavailable 为已知但本机未检测到的 agent
export interface ResolvedTargets {
  targets: SkillTarget[]
  invalid: string[]
  unavailable: string[]
}

// 按名字解析本次写入目标：names 省略或为空数组时沿用全部可用目标（主目标 + 已检测 agent + --dir）
// 显式指定时只写选中项；本机未检测到的 agent 不凭空造目录，单列为 unavailable 由调用方告警
export function resolveTargetsByName(names: string[] | undefined, extraDirs: string[] = []): ResolvedTargets {
  const all = resolveSkillTargets(extraDirs)
  const custom = all.filter((target) => target.kind === "custom")
  if (!names || names.length === 0) {
    return { targets: all.filter((target) => target.available || target.kind === "custom"), invalid: [], unavailable: [] }
  }
  const byName = new Map(all.filter((target) => target.name).map((target) => [target.name, target]))
  const targets: SkillTarget[] = []
  const invalid: string[] = []
  const unavailable: string[] = []
  for (const name of names) {
    const target = byName.get(name)
    if (!target) {
      invalid.push(name)
      continue
    }
    if (!target.available) {
      unavailable.push(name)
      continue
    }
    targets.push(target)
  }
  // --dir 始终一次性写入，不参与长期选择
  targets.push(...custom)
  // 同路径去重（显式名字与 --dir 可能指向同一目录）
  const seen = new Set<string>()
  return {
    targets: targets.filter((target) => {
      const key = pathKey(target.dir)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
    invalid,
    unavailable,
  }
}

// 全部可选目标名：主目标 canonical + 已检测 agent（用于 --all-agents 与目标选择默认值）
export function availableTargetNames(): string[] {
  return resolveSkillTargets()
    .filter((target) => target.name && target.available)
    .map((target) => target.name)
}

// 解析本机已安装的 canonical 共读 agent：只按 detect 判定
// 不能复用 available：canonical 条目的配置目录是 ~/.agents，该目录恒存在，会把全部共读 agent 误报为已安装
export function resolveCanonicalReaders(): Array<{ name: string; label: string }> {
  return AGENT_SKILL_DIRS.filter(
    (agent) => agent.viaCanonical && resolveAgentDetectPaths(agent).some((p) => existsSync(p)),
  ).map((agent) => ({ name: agent.name, label: agent.label }))
}

// 真实形态归一：解析软链 / junction 后取真实路径，失败时退回 resolve 结果

export function detectSkillScope(cwd = process.cwd()): SkillScope {
  let pkgRoot: string
  try {
    pkgRoot = realPath(resolvePackageRoot())
  } catch {
    return "global"
  }
  const start = safeRealPath(resolve(cwd))
  // 用户主目录不作为项目根：全局 CLI 常装在 home 下，不能因此把 home 判成项目面
  if (isHomeDirectory(start)) return "global"
  // 位于包内（源仓库或包目录）恒按全局面
  if (pathKey(start) === pathKey(pkgRoot) || isInside(start, pkgRoot)) return "global"
  // 只按 CLI 安装位置判定：包所在 node_modules 的父目录即项目根，cwd 位于其内才判项目面
  // 不依赖 package.json / 任何语言清单，非 Node 项目同样适用
  const installRoot = resolveInstallRoot(pkgRoot)
  if (installRoot) {
    const root = safeRealPath(installRoot)
    if (!isHomeDirectory(root) && (pathKey(start) === pathKey(root) || isInside(start, root))) return "project"
  } else {
    // 无 node_modules（Yarn PnP 等）：改看包根是否位于当前项目根内；全局缓存型安装的包根在项目外，仍判全局面
    const root = safeRealPath(findProjectRoot(start))
    if (!isHomeDirectory(root) && (pathKey(pkgRoot) === pathKey(root) || isInside(pkgRoot, root))) return "project"
  }
  return "global"
}

// CLI 安装根：沿包根向上找到最近的 node_modules，其父目录即安装根；包根不在 node_modules 下返回 null
// pnpm 布局优先取稳定入口，避免把 .pnpm 下的实体目录当成安装根
function resolveInstallRoot(pkgRoot: string): string | null {
  let dir = pnpmStableEntry(pkgRoot) || pkgRoot
  for (;;) {
    const parent = dirname(dir)
    if (parent === dir) return null
    if (basename(dir) === "node_modules") return parent
    dir = parent
  }
}

// 真实路径解析：目录不存在或权限不足时回落原路径，避免作用域判定因单次解析失败而中断
function safeRealPath(dir: string): string {
  try {
    return realPath(dir)
  } catch {
    return dir
  }
}

// 解析项目侧目标：复用项目级候选目录解析（只写已存在目录，不凭空造），真源本身不放薄壳
export function resolveProjectTargets(cwd = process.cwd()): ProjectTargets {
  const root = resolve(cwd)
  const shellDirs = resolveProjectSkillDirs(root).filter((rel) => rel !== PROJECT_SOURCE_DIR)
  const missingDirs = PROJECT_SKILL_DIRS.filter((rel) => rel !== PROJECT_SOURCE_DIR && !shellDirs.includes(rel))
  return { root, sourceDir: PROJECT_SOURCE_DIR, shellDirs, missingDirs }
}

// 反查目标显示名：canonical 优先（多家 agent 共读，须先于 agent 循环判定），其次内置快照表；表外目标（自定义 --dir）返回 null
export function skillTargetLabel(dir: string): string | null {
  const key = pathKey(resolve(dir))
  if (key === pathKey(join(getHomeDir(), CANONICAL_DIR))) return CANONICAL_LABEL
  const agent = AGENT_SKILL_DIRS.find((a) => pathKey(resolveAgentDir(a)) === key)
  return agent?.label ?? null
}

// 反查历史落点显示名：非历史落点返回 null
export function legacySkillDirLabel(dir: string): string | null {
  const key = pathKey(resolve(dir))
  const legacy = LEGACY_SKILL_DIRS.find((l) => pathKey(resolve(join(getHomeDir(), l.dir))) === key)
  return legacy?.label ?? null
}

// 状态文件里的目标类型：主目标 / 表内 agent / 表外自定义
export function classifyTargetKind(dir: string): TargetKind {
  const key = pathKey(resolve(dir))
  if (key === pathKey(join(getHomeDir(), CANONICAL_DIR))) return "primary"
  return AGENT_SKILL_DIRS.some((a) => pathKey(resolveAgentDir(a)) === key) ? "agent" : "custom"
}

// 目标稳定标识：主目标固定 primary，其余按类型 + 绝对路径派生
export function targetId(dir: string, kind: TargetKind): string {
  return kind === "primary" ? "primary" : `${kind}:${resolve(dir)}`
}

