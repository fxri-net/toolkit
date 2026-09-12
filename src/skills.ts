// skills 包内分发：把包内 <包根>/skills/ 安装到各 agent 的全局技能目录，消除 CLI 与 skills 两条供应链的版本漂移
// 真源唯一（包内目录），目标默认软链到真源（升级随链接跟随）；链接创建失败自动降级为副本并写入状态文件
// 状态文件 ~/.agents/.toolkit-skills.json：记录本包写入的产物，供 status 报告副本漂移、remove 精确清理（绝不碰用户自装技能）
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync } from "node:fs"
import { dirname, isAbsolute, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { getConfigSection, getHomeDir } from "./config"
import { writeFileAtomic } from "./write-atomic"

// 本包名：从模块位置向上定位包根，npm / pnpm / yarn / bun 装的都通用，不依赖 pnpm root -g 之类猜路径
const PKG_NAME = "@fxri/toolkit"
// 技能标识文件：目录内含该文件才计为一个技能
const SKILL_ENTRY = "SKILL.md"
// 主目标：上游 canonical 目录（多家 agent 共读），与下方表中 .agents/skills 条目同路径，靠去重合并
const CANONICAL_DIR = ".agents/skills"
// 状态文件名：与上游 .skill-lock.json 分开命名，避免互相覆盖
export const SKILLS_STATE_FILE = ".toolkit-skills.json"

// 目标类型：primary 主目标 / agent 快照表内 agent 目录 / custom 用户 --dir 指定
export type TargetKind = "primary" | "agent" | "custom"
// 产物类型：link 软链（指向真源）/ copy 副本
export type ArtifactMode = "link" | "copy"

// 内置 agent 全局技能目录快照（来源：上游 vercel-labs/skills 的 agent 表，77 条可安装项）
// dir 相对用户 home；detect 为额外存在性判据（相对 home 或绝对路径），用于判定「该 agent 已安装」
export interface AgentEntry {
  name: string
  label: string
  dir: string
  detect?: string[]
}

export const AGENT_SKILL_DIRS: AgentEntry[] = [
  { name: "aider-desk", label: "AiderDesk", dir: ".aider-desk/skills" },
  { name: "amp", label: "Amp", dir: ".config/agents/skills", detect: [".config/amp"] },
  { name: "antigravity", label: "Antigravity", dir: ".gemini/antigravity/skills" },
  { name: "antigravity-cli", label: "Antigravity CLI", dir: ".gemini/antigravity-cli/skills" },
  { name: "astrbot", label: "AstrBot", dir: ".astrbot/data/skills", detect: [".astrbot"] },
  { name: "autohand-code", label: "Autohand Code CLI", dir: ".autohand/skills" },
  { name: "augment", label: "Augment", dir: ".augment/skills" },
  { name: "bob", label: "IBM Bob", dir: ".bob/skills" },
  { name: "claude-code", label: "Claude Code", dir: ".claude/skills" },
  { name: "openclaw", label: "OpenClaw", dir: ".openclaw/skills", detect: [".openclaw", ".clawdbot", ".moltbot"] },
  { name: "cline", label: "Cline", dir: CANONICAL_DIR, detect: [".cline"] },
  { name: "codearts-agent", label: "CodeArts Agent", dir: ".codeartsdoer/skills" },
  { name: "codebuddy", label: "CodeBuddy", dir: ".codebuddy/skills" },
  { name: "codemaker", label: "Codemaker", dir: ".codemaker/skills" },
  { name: "codestudio", label: "Code Studio", dir: ".codestudio/skills" },
  { name: "codex", label: "Codex", dir: ".codex/skills", detect: [".codex", "/etc/codex"] },
  { name: "command-code", label: "Command Code", dir: ".commandcode/skills" },
  { name: "continue", label: "Continue", dir: ".continue/skills" },
  { name: "cortex", label: "Cortex Code", dir: ".snowflake/cortex/skills" },
  { name: "crush", label: "Crush", dir: ".config/crush/skills" },
  { name: "cursor", label: "Cursor", dir: ".cursor/skills" },
  { name: "deepagents", label: "Deep Agents", dir: ".deepagents/agent/skills", detect: [".deepagents"] },
  { name: "devin", label: "Devin for Terminal", dir: ".config/devin/skills" },
  { name: "dexto", label: "Dexto", dir: CANONICAL_DIR, detect: [".dexto"] },
  { name: "droid", label: "Droid", dir: ".factory/skills" },
  { name: "firebender", label: "Firebender", dir: ".firebender/skills" },
  { name: "forgecode", label: "ForgeCode", dir: ".forge/skills" },
  { name: "fx", label: "fx", dir: ".fx/skills" },
  { name: "gemini-cli", label: "Gemini CLI", dir: ".gemini/skills" },
  { name: "github-copilot", label: "GitHub Copilot", dir: ".copilot/skills" },
  { name: "goose", label: "Goose", dir: ".config/goose/skills" },
  { name: "grok", label: "Grok Build", dir: ".grok/skills" },
  { name: "hermes-agent", label: "Hermes Agent", dir: ".hermes/skills" },
  { name: "inference-sh", label: "inference.sh", dir: ".inferencesh/skills" },
  { name: "jazz", label: "Jazz", dir: ".jazz/skills" },
  { name: "junie", label: "Junie", dir: ".junie/skills" },
  { name: "iflow-cli", label: "iFlow CLI", dir: ".iflow/skills" },
  { name: "kilo", label: "Kilo Code", dir: ".kilo/skills", detect: [".kilo", ".kilocode"] },
  { name: "kimchi", label: "Kimchi", dir: ".config/kimchi/harness/skills", detect: [".config/kimchi"] },
  { name: "kimi-code-cli", label: "Kimi Code CLI", dir: CANONICAL_DIR, detect: [".kimi-code", ".kimi"] },
  { name: "kiro-cli", label: "Kiro CLI", dir: ".kiro/skills" },
  { name: "kode", label: "Kode", dir: ".kode/skills" },
  { name: "lingma", label: "Lingma", dir: ".lingma/skills" },
  { name: "loaf", label: "Loaf", dir: CANONICAL_DIR, detect: [".loaf"] },
  { name: "mcpjam", label: "MCPJam", dir: ".mcpjam/skills" },
  { name: "minimax-code", label: "MiniMax Code", dir: ".minimax/skills", detect: [".minimax", "/Applications/MiniMax Code.app"] },
  { name: "mistral-vibe", label: "Mistral Vibe", dir: ".vibe/skills" },
  { name: "moxby", label: "Moxby", dir: ".moxby/skills" },
  { name: "mux", label: "Mux", dir: ".mux/skills" },
  { name: "opencode", label: "OpenCode", dir: ".config/opencode/skills" },
  { name: "openhands", label: "OpenHands", dir: ".openhands/skills" },
  { name: "ona", label: "Ona", dir: ".ona/skills" },
  { name: "pi", label: "Pi", dir: ".pi/agent/skills" },
  { name: "posit-assistant", label: "Posit Assistant", dir: ".posit/assistant/skills", detect: [".posit/assistant", ".positai"] },
  { name: "qoder", label: "Qoder", dir: ".qoder/skills" },
  { name: "qoder-cn", label: "Qoder CN", dir: ".qoder-cn/skills" },
  { name: "qwen-code", label: "Qwen Code", dir: ".qwen/skills" },
  { name: "replit", label: "Replit", dir: ".config/agents/skills" },
  { name: "reasonix", label: "Reasonix", dir: ".reasonix/skills" },
  { name: "rovodev", label: "Rovo Dev", dir: ".rovodev/skills" },
  { name: "roo", label: "Roo Code", dir: ".roo/skills" },
  { name: "sarvam-code", label: "Sarvam Code", dir: CANONICAL_DIR, detect: [".sarvam"] },
  { name: "tabnine-cli", label: "Tabnine CLI", dir: ".tabnine/agent/skills", detect: [".tabnine"] },
  { name: "terramind", label: "Terramind", dir: ".terramind/skills" },
  { name: "tinycloud", label: "Tinycloud", dir: ".tinycloud/skills" },
  { name: "trae", label: "Trae", dir: ".trae/skills" },
  { name: "trae-cn", label: "Trae CN", dir: ".trae-cn/skills" },
  { name: "warp", label: "Warp", dir: CANONICAL_DIR, detect: [".warp"] },
  { name: "windsurf", label: "Windsurf", dir: ".codeium/windsurf/skills" },
  { name: "zed", label: "Zed", dir: CANONICAL_DIR, detect: [".config/zed"] },
  { name: "zcode", label: "ZCode", dir: ".zcode/skills", detect: [".zcode", "/Applications/ZCode.app"] },
  { name: "zencoder", label: "Zencoder", dir: ".zencoder/skills" },
  { name: "zenflow", label: "Zenflow", dir: ".zencoder/skills" },
  { name: "neovate", label: "Neovate", dir: ".neovate/skills" },
  { name: "pochi", label: "Pochi", dir: ".pochi/skills" },
  { name: "adal", label: "AdaL", dir: ".adal/skills" },
  { name: "universal", label: "Universal", dir: ".config/agents/skills" },
]

// 包内技能（含 SKILL.md 的目录才算）
export interface PackageSkill {
  name: string
  dir: string
}

// 解析后的目标目录
export interface SkillTarget {
  dir: string
  label: string
  kind: TargetKind
  // 是否可作为写入目标：主目标与 --dir 恒真；agent 目录要求其配置目录已存在，避免凭空造目录
  available: boolean
  dirExists: boolean
}

// 单个技能的现场状态
export type SkillItemState = "link" | "dangling" | "wrong" | "copy" | "copy-drift" | "missing" | "conflict"

export interface SkillStatusItem {
  name: string
  state: SkillItemState
}

export interface TargetStatus {
  dir: string
  label: string
  kind: TargetKind
  available: boolean
  dirExists: boolean
  recorded: boolean
  items: SkillStatusItem[]
}

export interface SkillsStatusReport {
  source: string
  skills: string[]
  stateFile: string
  stateExists: boolean
  targets: TargetStatus[]
  pendingAgents: Array<{ dir: string; label: string }>
}

export interface TargetInstallResult {
  dir: string
  label: string
  kind: TargetKind
  created: string[]
  updated: string[]
  skipped: string[]
  conflicts: string[]
  failed: Array<{ name: string; reason: string }>
  // 链接创建失败后降级为副本的记录（含失败原因，不静默）
  degraded: Array<{ name: string; reason: string }>
  // 本次运行后该目标下本包产物的最终形态，用于写入状态文件
  links: string[]
  copies: string[]
}

export interface InstallReport {
  source: string
  skills: string[]
  targets: TargetInstallResult[]
  skippedTargets: Array<{ dir: string; label: string }>
  stateFile: string
}

export interface RemoveResult {
  dir: string
  label: string
  removed: string[]
  missing: string[]
  // 指向其他位置或内容与本包不一致，出于安全跳过，交人工确认
  skippedForeign: string[]
}

export interface SkillsRemoveReport {
  stateFile: string
  stateExists: boolean
  targets: RemoveResult[]
  stateRemoved: boolean
}

// 状态文件条目：按目标目录记录本包写入的链接与副本
export interface StateEntry {
  dir: string
  updatedAt: string
  links: string[]
  copies: string[]
}

export interface SkillsState {
  version: 1
  updatedAt: string
  targets: StateEntry[]
}

// 包根定位结果缓存（一次进程内不变）
let cachedRoot: string | undefined

// 从当前模块位置逐级向上找 name 为 @fxri/toolkit 的 package.json，得到包根绝对路径
function resolvePackageRoot(): string {
  if (cachedRoot) return cachedRoot
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const pkgFile = join(dir, "package.json")
    if (existsSync(pkgFile)) {
      try {
        const data = JSON.parse(readFileSync(pkgFile, "utf8").replace(/^\uFEFF/, "")) as { name?: unknown }
        if (data.name === PKG_NAME) {
          cachedRoot = dir
          return dir
        }
      } catch {
        // 非法 JSON 视为非目标包，继续向上
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`未能从模块位置向上定位 ${PKG_NAME} 的包根目录`)
}

// 重置包根缓存（测试用：不改变结果，仅保证跨用例干净）
export function resetSkillsRootCache(): void {
  cachedRoot = undefined
}

// 真源目录：包内 skills/
export function skillsSourceDir(): string {
  return join(resolvePackageRoot(), "skills")
}

// 包根目录（供 skills path 输出，便于委托上游安装器：pnpm dlx skills add "$(toolkit skills path)" -g）
export function skillsPackageDir(): string {
  return resolvePackageRoot()
}

// 列出包内技能（含 SKILL.md 的目录），按名称排序
export function listPackageSkills(): PackageSkill[] {
  const root = skillsSourceDir()
  if (!existsSync(root)) return []
  const out: PackageSkill[] = []
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name)
    try {
      if (!lstatSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    if (!existsSync(join(dir, SKILL_ENTRY))) continue
    out.push({ name, dir })
  }
  return out
}

// 路径比较键：归一化 + Windows 下大小写不敏感（盘符/短名等书写差异不应被判成不同路径）
function pathKey(p: string): string {
  const n = normalize(resolve(p))
  return process.platform === "win32" ? n.toLowerCase() : n
}

// 剥离尾部分隔符：Windows junction 的 readlink 结果形如 C:\x\target\，直接比较会误判为「指向错误」
function stripTailSep(p: string): string {
  const n = normalize(p)
  if (/^[a-zA-Z]:[\\/]$/.test(n)) return n
  return n.replace(/[\\/]+$/, "") || n
}

// 分类现场产物：不存在 / 链接且指向真源 / 链接但指向别处 / 悬空链接 / 实体目录 / 普通文件
type ExistingKind = "absent" | "link-ok" | "wrong" | "dangling" | "dir" | "file"

function classifyExisting(dest: string, source: string): ExistingKind {
  let lst
  try {
    lst = lstatSync(dest)
  } catch {
    return "absent"
  }
  if (lst.isSymbolicLink()) {
    let target = ""
    try {
      target = readlinkSync(dest)
    } catch {
      return "dangling"
    }
    const absTarget = stripTailSep(isAbsolute(target) ? target : resolve(dirname(dest), target))
    if (pathKey(absTarget) !== pathKey(source)) return "wrong"
    // 链接指向正确但要区分悬空（真源缺失时 existsSync 为 false，而 lstat 仍认它是链接）
    return existsSync(dest) ? "link-ok" : "dangling"
  }
  return lst.isDirectory() ? "dir" : "file"
}

// 递归比对两个目录内容是否一致（用于副本幂等判断与漂移检测），任何读取失败按「不一致」处理
function dirsEqual(a: string, b: string): boolean {
  let aNames: string[]
  let bNames: string[]
  try {
    aNames = readdirSync(a).sort()
    bNames = readdirSync(b).sort()
  } catch {
    return false
  }
  if (aNames.length !== bNames.length || aNames.some((n, i) => n !== bNames[i])) return false
  for (const name of aNames) {
    const pa = join(a, name)
    const pb = join(b, name)
    let sa
    let sb
    try {
      sa = statSync(pa)
      sb = statSync(pb)
    } catch {
      return false
    }
    if (sa.isDirectory() !== sb.isDirectory()) return false
    if (sa.isDirectory()) {
      if (!dirsEqual(pa, pb)) return false
    } else {
      try {
        if (!readFileSync(pa).equals(readFileSync(pb))) return false
      } catch {
        return false
      }
    }
  }
  return true
}

// 状态文件路径：~/.agents/.toolkit-skills.json
export function skillsStateFile(): string {
  return join(getHomeDir(), ".agents", SKILLS_STATE_FILE)
}

// 读取状态文件：不存在或损坏一律返回 null（按未安装过处理，不影响主流程）
export function readSkillsState(): SkillsState | null {
  const file = skillsStateFile()
  if (!existsSync(file)) return null
  try {
    const data = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as SkillsState
    if (!data || !Array.isArray(data.targets)) return null
    return data
  } catch {
    return null
  }
}

// 写入状态文件：原子写入，避免半截 JSON
function writeSkillsState(targets: StateEntry[]): void {
  const file = skillsStateFile()
  mkdirSync(dirname(file), { recursive: true })
  const state: SkillsState = { version: 1, updatedAt: new Date().toISOString(), targets }
  writeFileAtomic(file, `${JSON.stringify(state, null, 2)}\n`)
}

// 解析目标三层：主目标 canonical → 快照表中「已安装」的 agent 全局技能目录 → --dir 兜底；同路径去重
export function resolveSkillTargets(extraDirs: string[] = []): SkillTarget[] {
  const home = getHomeDir()
  const out: SkillTarget[] = []
  const seen = new Set<string>()
  const push = (dir: string, label: string, kind: TargetKind, available: boolean) => {
    const abs = resolve(dir)
    const key = pathKey(abs)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ dir: abs, label, kind, available, dirExists: existsSync(abs) })
  }
  push(join(home, CANONICAL_DIR), "canonical（多家 agent 共读）", "primary", true)
  for (const agent of AGENT_SKILL_DIRS) {
    // 判据：技能目录的父目录（即 agent 配置目录）存在，或任一 detect 路径存在
    const configDir = join(home, dirname(agent.dir))
    const available =
      existsSync(configDir) || (agent.detect ?? []).some((d) => existsSync(isAbsolute(d) ? d : join(home, d)))
    push(join(home, agent.dir), agent.label, "agent", available)
  }
  for (const dir of extraDirs) push(dir, "自定义 --dir", "custom", true)
  return out
}

// 删除现场产物：链接只摘链（不碰真源）、副本整目录删除
function removeArtifact(dest: string): void {
  rmSync(dest, { recursive: true, force: true })
}

// 以副本形式写入（调用前需确保 dest 不存在，否则会复制到 dest 内部）
function copyArtifact(source: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(source, dest, { recursive: true })
}

// 写入产物：默认软链（Windows 用 junction，免管理员、免开发者模式）；链接失败降级副本并回传原因
function writeArtifact(source: string, dest: string, forceCopy: boolean): { mode: ArtifactMode; reason?: string } {
  if (forceCopy) {
    copyArtifact(source, dest)
    return { mode: "copy" }
  }
  try {
    mkdirSync(dirname(dest), { recursive: true })
    symlinkSync(source, dest, process.platform === "win32" ? "junction" : "dir")
    return { mode: "link" }
  } catch (e) {
    copyArtifact(source, dest)
    return { mode: "copy", reason: (e as Error).message }
  }
}

export interface InstallOptions {
  copy?: boolean
  dirs?: string[]
  dryRun?: boolean
  force?: boolean
}

// 安装：对每个可用目标逐个技能做幂等处理——指向正确跳过、指向错误或悬空重建、非本包实体目录默认跳过（--force 覆盖）
export function installSkills(options: InstallOptions = {}): InstallReport {
  const skills = listPackageSkills()
  const targets = resolveSkillTargets(options.dirs ?? [])
  const previous = readSkillsState()
  const previousByDir = new Map<string, StateEntry>()
  for (const entry of previous?.targets ?? []) previousByDir.set(pathKey(entry.dir), entry)

  const results: TargetInstallResult[] = []
  const skippedTargets: Array<{ dir: string; label: string }> = []
  const nextEntries: StateEntry[] = []

  for (const target of targets) {
    // 目标不可用（agent 未安装）只报告不创建，避免在用户机器上凭空造目录；历史记录由下方 carried 保留
    if (!target.available) {
      skippedTargets.push({ dir: target.dir, label: target.label })
      continue
    }
    const result: TargetInstallResult = {
      dir: target.dir,
      label: target.label,
      kind: target.kind,
      created: [],
      updated: [],
      skipped: [],
      conflicts: [],
      failed: [],
      degraded: [],
      links: [],
      copies: [],
    }
    for (const skill of skills) {
      const dest = join(target.dir, skill.name)
      const kind = classifyExisting(dest, skill.dir)
      if (kind === "link-ok") {
        result.skipped.push(skill.name)
        result.links.push(skill.name)
        continue
      }
      if (kind === "dir" && !options.force) {
        // 实体目录：若状态文件记载为本包副本则比对内容，否则视为用户自装技能不覆盖
        const old = previousByDir.get(pathKey(target.dir))
        const mine = old?.copies.includes(skill.name) ?? false
        if (!mine) {
          result.conflicts.push(skill.name)
          continue
        }
        if (dirsEqual(skill.dir, dest)) {
          result.skipped.push(skill.name)
          result.copies.push(skill.name)
          continue
        }
      }
      if (kind === "file" && !options.force) {
        result.conflicts.push(skill.name)
        continue
      }
      if (options.dryRun) {
        if (kind === "absent") result.created.push(skill.name)
        else result.updated.push(skill.name)
        if (options.copy) result.copies.push(skill.name)
        else result.links.push(skill.name)
        continue
      }
      try {
        if (!(kind === "absent")) removeArtifact(dest)
        const written = writeArtifact(skill.dir, dest, Boolean(options.copy))
        if (kind === "absent") result.created.push(skill.name)
        else result.updated.push(skill.name)
        if (written.mode === "link") {
          result.links.push(skill.name)
        } else {
          result.copies.push(skill.name)
          if (written.reason) result.degraded.push({ name: skill.name, reason: written.reason })
        }
      } catch (e) {
        result.failed.push({ name: skill.name, reason: (e as Error).message })
      }
    }
    results.push(result)
    if (!options.dryRun) {
      nextEntries.push({ dir: target.dir, updatedAt: new Date().toISOString(), links: result.links, copies: result.copies })
    }
  }

  if (!options.dryRun) {
    // 本次真正写入的目标取新记录；未参与本次运行的历史目标原样保留，卸载时仍能清理旧产物
    const written = new Set(results.map((r) => pathKey(r.dir)))
    const carried = (previous?.targets ?? []).filter((entry) => !written.has(pathKey(entry.dir)))
    const all = [...nextEntries, ...carried].filter((entry) => entry.links.length > 0 || entry.copies.length > 0)
    if (all.length > 0) writeSkillsState(all)
  }

  return { source: skillsSourceDir(), skills: skills.map((s) => s.name), targets: results, skippedTargets, stateFile: skillsStateFile() }
}

// 卸载：只处理状态文件记载的本包产物；链接（含悬空）直接摘除，副本内容与真源一致才删，其余交人工确认
export function removeSkills(options: { dryRun?: boolean } = {}): SkillsRemoveReport {
  const state = readSkillsState()
  const stateFile = skillsStateFile()
  if (!state) return { stateFile, stateExists: false, targets: [], stateRemoved: false }

  const results: RemoveResult[] = []
  let failed = false
  for (const entry of state.targets) {
    const result: RemoveResult = { dir: entry.dir, label: entry.dir, removed: [], missing: [], skippedForeign: [] }
    const names = [...new Set([...entry.links, ...entry.copies])]
    for (const name of names) {
      const dest = join(entry.dir, name)
      const source = join(skillsSourceDir(), name)
      const kind = classifyExisting(dest, source)
      if (kind === "absent") {
        result.missing.push(name)
        continue
      }
      if (kind === "wrong") {
        result.skippedForeign.push(name)
        continue
      }
      if (kind === "file") {
        result.skippedForeign.push(name)
        continue
      }
      if (kind === "dir" && !dirsEqual(source, dest)) {
        result.skippedForeign.push(name)
        continue
      }
      if (options.dryRun) {
        result.removed.push(name)
        continue
      }
      try {
        removeArtifact(dest)
        result.removed.push(name)
      } catch {
        failed = true
        result.skippedForeign.push(name)
      }
    }
    results.push(result)
  }

  const nothingLeft = results.every((r) => r.skippedForeign.length === 0)
  const stateRemoved = !options.dryRun && !failed && nothingLeft
  if (stateRemoved) rmSync(stateFile, { force: true })
  return { stateFile, stateExists: true, targets: results, stateRemoved }
}

// 现场状态：目标目录存在或状态文件有记录时逐技能判定，供 status 报告悬空 / 指向错误 / 副本漂移
export function skillsStatus(): SkillsStatusReport {
  const skills = listPackageSkills()
  const targets = resolveSkillTargets([])
  const state = readSkillsState()
  const stateByDir = new Map<string, StateEntry>()
  for (const entry of state?.targets ?? []) stateByDir.set(pathKey(entry.dir), entry)

  const out: TargetStatus[] = []
  const pendingAgents: Array<{ dir: string; label: string }> = []
  for (const target of targets) {
    const recorded = stateByDir.get(pathKey(target.dir))
    if (!target.available && target.kind === "agent") {
      pendingAgents.push({ dir: target.dir, label: target.label })
      continue
    }
    // 主目标即使未创建也要报告（提示执行 install）；agent 目标仅在目录已存在或有本包记录时展开
    if (target.kind !== "primary" && !target.dirExists && !recorded) continue
    const names = [...new Set([...skills.map((s) => s.name), ...(recorded ? [...recorded.links, ...recorded.copies] : [])])].sort()
    const items: SkillStatusItem[] = []
    for (const name of names) {
      const source = join(skillsSourceDir(), name)
      const dest = join(target.dir, name)
      const kind = classifyExisting(dest, source)
      let state: SkillItemState
      if (kind === "link-ok") state = "link"
      else if (kind === "dangling") state = "dangling"
      else if (kind === "wrong") state = "wrong"
      else if (kind === "file") state = "conflict"
      else if (kind === "dir") state = existsSync(source) && dirsEqual(source, dest) ? "copy" : "copy-drift"
      else state = "missing"
      items.push({ name, state })
    }
    out.push({ dir: target.dir, label: target.label, kind: target.kind, available: target.available, dirExists: target.dirExists, recorded: Boolean(recorded), items })
  }
  return { source: skillsSourceDir(), skills: skills.map((s) => s.name), stateFile: skillsStateFile(), stateExists: Boolean(state), targets: out, pendingAgents }
}

// 链接自愈（skills.autoLink，默认 true）：只对状态文件记载的链接做补链与修链
// 不含首次安装、不含升级副本；CI 环境跳过，任何失败静默（不阻塞用户命令）
export function autoLinkSkills(): number {
  const section = getConfigSection("skills")
  if (section?.autoLink === false) return 0
  if (process.env.CI) return 0
  const state = readSkillsState()
  if (!state) return 0

  let repaired = 0
  const nextEntries: StateEntry[] = []
  for (const entry of state.targets) {
    if (!existsSync(entry.dir)) {
      nextEntries.push(entry)
      continue
    }
    const links = entry.links.filter((name) => {
      const source = join(skillsSourceDir(), name)
      if (!existsSync(source)) return false
      const dest = join(entry.dir, name)
      const kind = classifyExisting(dest, source)
      if (kind === "link-ok") return true
      // 悬空或指向错误：重建链接；失败则本轮放弃该条，留在状态里下次再试
      try {
        if (kind !== "absent") removeArtifact(dest)
        symlinkSync(source, dest, process.platform === "win32" ? "junction" : "dir")
        repaired += 1
        return true
      } catch {
        return false
      }
    })
    nextEntries.push({ ...entry, links, updatedAt: new Date().toISOString() })
  }
  if (repaired > 0) writeSkillsState(nextEntries)
  return repaired
}
