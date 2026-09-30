// skills 包内分发：把包内 <包根>/skills/ 安装到各 agent 的技能目录，消除 CLI 与 skills 两条供应链的版本漂移
// 两个面：全局面（默认软链到稳定锚点，升级时由 pnpm 重写，链接不随版本段失效）与项目面（仓库内落唯一真源副本 + 各候选目录薄壳）
// 链接创建失败自动降级为副本并写入状态文件
// 全局状态文件 ~/.agents/.toolkit-skills.json：记录本包写入的产物，供 status 报告副本漂移、remove 精确清理（绝不碰用户自装技能）
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs"
import type { Dirent } from "node:fs"
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { getConfigSection, getHomeDir } from "./config"
import { FALLBACK_SKILL_DIR, PROJECT_SKILL_DIRS, resolveProjectSkillDirs } from "./conventions/entry"
import { readTextFile } from "./read-text"
import { writeFileAtomic } from "./write-atomic"

// 本包名：从模块位置向上定位包根，npm / pnpm / yarn / bun 装的都通用，不依赖 pnpm root -g 之类猜路径
export const PKG_NAME = "@fxri/toolkit"
// 技能标识文件：目录内含该文件才计为一个技能
const SKILL_ENTRY = "SKILL.md"
// 主目标：上游 canonical 目录（多家 agent 共读），与下方表中 .agents/skills 条目同路径，靠去重合并
const CANONICAL_DIR = ".agents/skills"
// 主目标显示名：解析与反查共用一份，避免两处字面量漂移
const CANONICAL_LABEL = "canonical（多家 agent 共读）"
// 状态文件名：与上游 .skill-lock.json 分开命名，避免互相覆盖
export const SKILLS_STATE_FILE = ".toolkit-skills.json"
// 项目侧真源目录（仓库根相对、posix 分隔）：完整副本只此一份，其余候选目录放薄壳指向它
export const PROJECT_SOURCE_DIR = FALLBACK_SKILL_DIR

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
  // SKILL.md frontmatter metadata.version；未声明版本时为空串（兼容第三方技能）
  version: string
}

// 技能版本双写位不一致条目：frontmatter 声明值与正文声明值（正文未声明时为空串）
export interface SkillVersionMismatch {
  name: string
  frontmatter: string
  body: string
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
  // 真源声明版本（与现场状态无关），供与旧会话上下文中已加载的技能内容比对
  version: string
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
  // 各技能真源版本，作为「会话上下文已过期」判定的磁盘基准值
  skillVersions: Record<string, string>
  // 版本双写位（frontmatter / 正文）不一致的技能，供软告警提示同步递增
  versionMismatches: SkillVersionMismatch[]
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
  // 目标显示名，与 install / status 报告同口径；表外目标（自定义 --dir）为 null，打印时回落路径
  label: string | null
  removed: string[]
  missing: string[]
  // 指向其他位置或内容与本包不一致，出于安全跳过，交人工确认
  skippedForeign: string[]
  // 清理后目标目录变为空并被一并回收（仅实际执行且目录确已清空时为真）
  dirReclaimed: boolean
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

// 链接锚点缓存：与包根同批解析，一次进程内不变
let cachedLinkRoot: string | undefined

// 从当前模块位置逐级向上找 name 为 @fxri/toolkit 的 package.json，得到包根绝对路径
function resolvePackageRoot(): string {
  if (cachedRoot) return cachedRoot
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const pkgFile = join(dir, "package.json")
    if (existsSync(pkgFile)) {
      try {
        const data = JSON.parse(readTextFile(pkgFile)) as { name?: unknown }
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

// 重置包根与链接锚点缓存（测试用：不改变结果，仅保证跨用例干净）
export function resetSkillsRootCache(): void {
  cachedRoot = undefined
  cachedLinkRoot = undefined
}

// 仅测试用：注入包根，使真源与链接锚点解析落在临时目录上
export function setPackageRootForTest(dir: string): void {
  cachedRoot = dir
  cachedLinkRoot = undefined
}

// 真源目录：包内 skills/
export function skillsSourceDir(): string {
  return join(resolvePackageRoot(), "skills")
}

// 包根目录（供 skills path 输出，便于委托上游安装器：pnpm dlx skills add "$(toolkit skills path)" -g）
export function skillsPackageDir(): string {
  return resolvePackageRoot()
}

// pnpm 稳定入口：从包根推出不随版本段漂移的入口目录
// pnpm 把包实体放在 <模块目录>/.pnpm/<包目录>/node_modules/<包名>，并在 <模块目录>/<包名> 建指向它的入口，
// 升级时只重写该入口；软链锚在入口上即跨版本存活。非 pnpm 布局（包实体即真实目录）返回空串
// 模块目录（.pnpm 所在层）随安装方式变化：项目内即 <项目>/node_modules，全局安装为 <pnpm 全局>/<global 段>（.pnpm 与 node_modules 并列），故按目录名判定并补 node_modules 层
export function pnpmStableEntry(pkgRoot: string): string {
  let dir = resolve(pkgRoot)
  for (;;) {
    const parent = dirname(dir)
    if (parent === dir) return ""
    if (basename(parent) === ".pnpm") {
      const container = dirname(parent)
      const moduleDir = basename(container) === "node_modules" ? container : join(container, "node_modules")
      return join(moduleDir, PKG_NAME)
    }
    dir = parent
  }
}

// 链接锚点：优先 pnpm 稳定入口，不可用则回落包根真源
// 必须校验候选的真实路径与包根一致——锚到别的版本或别的包上不会当场报错，只会在升级后断链
function resolveLinkRoot(): string {
  if (cachedLinkRoot) return cachedLinkRoot
  const root = resolvePackageRoot()
  let anchor = ""
  try {
    const candidate = pnpmStableEntry(root)
    if (candidate && existsSync(candidate) && pathKey(realpathSync(candidate)) === pathKey(realpathSync(root))) anchor = candidate
  } catch {
    // 探活失败（权限、竞态删除等）不作为锚点，静默回落真源
  }
  cachedLinkRoot = anchor || root
  return cachedLinkRoot
}

// 链接锚点目录：期望写进软链的目标（pnpm 布局下为稳定入口的 skills/，其余布局下即真源）
export function skillsLinkDir(): string {
  return join(resolveLinkRoot(), "skills")
}

// 读取技能真源版本：SKILL.md frontmatter 内 metadata.version（缩进键）；文件缺失、无 frontmatter 或未声明版本一律返回空串，不抛错
export function readSkillVersion(dir: string): string {
  try {
    const content = readTextFile(join(dir, SKILL_ENTRY))
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!frontmatter) return ""
    const matched = (frontmatter[1] ?? "").match(/^[ \t]+version:[ \t]*"?([^"\r\n]+?)"?[ \t]*$/m)
    return matched ? (matched[1] ?? "").trim() : ""
  } catch {
    return ""
  }
}

// 读取技能正文版本：正文首部 `> 本技能版本 x.y.z（…）` 声明值；文件缺失或未声明返回空串，不抛错
export function readSkillBodyVersion(dir: string): string {
  try {
    const content = readTextFile(join(dir, SKILL_ENTRY))
    const matched = content.match(/^>[ \t]*本技能版本[ \t]*([^ \t（(]+)/m)
    return matched ? (matched[1] ?? "").trim() : ""
  } catch {
    return ""
  }
}

// 版本双写位比对：frontmatter metadata.version 与正文「本技能版本」声明不一致的条目（含正文漏写，供软告警）
export function findSkillVersionMismatches(skills: PackageSkill[]): SkillVersionMismatch[] {
  const out: SkillVersionMismatch[] = []
  for (const skill of skills) {
    // 未声明 frontmatter 版本（兼容第三方技能）无从比对，跳过
    if (!skill.version) continue
    const body = readSkillBodyVersion(skill.dir)
    if (body !== skill.version) out.push({ name: skill.name, frontmatter: skill.version, body })
  }
  return out
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
    out.push({ name, dir, version: readSkillVersion(dir) })
  }
  return out
}

// 路径比较键：归一化 + Windows 下大小写不敏感（盘符/短名等书写差异不应被判成不同路径）
function pathKey(p: string): string {
  const n = normalize(resolve(p))
  return process.platform === "win32" ? n.toLowerCase() : n
}

// 剥离尾部分隔符：Windows junction 的 readlink 结果形如 C:\x\target\，直接比较会因尾部分隔符导致路径判定失配
function stripTailSep(p: string): string {
  const n = normalize(p)
  if (/^[a-zA-Z]:[\\/]$/.test(n)) return n
  return n.replace(/[\\/]+$/, "") || n
}

// 分类现场产物：不存在 / 链接且指向真源或同内容目录 / 链接但指向其他版本 / 悬空链接 / 实体目录 / 普通文件
type ExistingKind = "absent" | "link-ok" | "wrong" | "dangling" | "dir" | "file"

// 条目判型所需的最小结构：Dirent（readdirSync withFileTypes）与 Stats（lstatSync）均满足
interface EntryType {
  isSymbolicLink(): boolean
  isDirectory(): boolean
}

// entry：调用方已列出的目录条目，省略则此处现查一次（查不到即视为不存在）
// altSource：可接受的另一指向——升级迁移期链接可能指向稳定锚点或真源，两种都算正常
function classifyExisting(dest: string, source: string, entry?: EntryType, altSource = ""): ExistingKind {
  let dirent: EntryType
  if (entry) {
    dirent = entry
  } else {
    try {
      dirent = lstatSync(dest)
    } catch {
      return "absent"
    }
  }
  if (dirent.isSymbolicLink()) {
    let target = ""
    try {
      target = readlinkSync(dest)
    } catch {
      return "dangling"
    }
    const absTarget = stripTailSep(isAbsolute(target) ? target : resolve(dirname(dest), target))
    // 悬空优先判定：链接指向已不存在的位置（如指向已失效的旧版本段或已卸载的别处安装）时，
    // 无论指向何处都算悬空——此时无法判其内容归属，按「可自动清理」处理，避免误归入「指向别处」交人工
    if (!existsSync(absTarget)) return "dangling"
    const targetKey = pathKey(absTarget)
    if (targetKey !== pathKey(source) && !(altSource && targetKey === pathKey(altSource))) {
      // 路径不同不等于内容不同：链接锚在别的安装（如 pnpm 稳定入口）时路径天然不相等，
      // 只要其指向内容与真源逐字一致即视为正常，避免体检假警与自愈把健康链接重指到当前运行源
      const sameAsSource = sameDirContent(source, absTarget)
      const sameAsAlt = altSource !== "" && sameDirContent(altSource, absTarget)
      if (!sameAsSource && !sameAsAlt) return "wrong"
    }
    return "link-ok"
  }
  return dirent.isDirectory() ? "dir" : "file"
}

// 目录是否存在且为空（不存在 / 不可读按「非空」处理，避免误删有内容的目录）
function isEmptyDir(dir: string): boolean {
  try {
    return readdirSync(dir).length === 0
  } catch {
    return false
  }
}

// 两目录内容是否逐字一致（任一侧缺失即按不一致处理）
function sameDirContent(a: string, b: string): boolean {
  return existsSync(a) && existsSync(b) && dirsEqual(a, b)
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
    const data = JSON.parse(readTextFile(file)) as SkillsState
    if (!data || !Array.isArray(data.targets)) return null
    return data
  } catch {
    return null
  }
}

// 是否已装有全局技能：只读状态文件（任一目标登记了本包链接或副本即视为已安装），不做全量现场校验、不起进程
// 用途：init 的「下一步」据此前置判断是否提示 toolkit skills install，已装则不重复打扰
export function hasGlobalSkillsInstalled(): boolean {
  return (readSkillsState()?.targets ?? []).some((entry) => entry.links.length > 0 || entry.copies.length > 0)
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
  push(join(home, CANONICAL_DIR), CANONICAL_LABEL, "primary", true)
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

// 技能作用域：project 走项目侧（仓库内唯一真源副本 + 各候选目录薄壳），global 走全局（软链 / 副本到各 agent 全局目录）
export type SkillScope = "project" | "global"

// 真实形态归一：解析软链 / junction 后取真实路径，失败时退回 resolve 结果（现场路径形态须归一，避免同一目录多种写法被判成两处）
function realPath(p: string): string {
  try {
    return realpathSync.native(p)
  } catch {
    return resolve(p)
  }
}

// 判 sub 是否落在 root 之内（不含 root 自身）：比较时补分隔符，避免 /a/bc 被误判为 /a/b 之下
function isInside(sub: string, root: string): boolean {
  const sk = pathKey(stripTailSep(sub))
  const rk = pathKey(stripTailSep(root))
  return sk !== rk && sk.startsWith(rk.endsWith(sep) ? rk : rk + sep)
}

// 作用域判定：自 cwd 逐级向上，任一层含 package.json 且 CLI 包根落在其下 → 项目面（兼容 monorepo 子目录内执行）
// 源仓库（包根即项目根）恒走全局面：维护者靠全局技能自举，不把自身 skills/ 复制进自身仓库
// 判据取包根而非 cwd 单独判定，避免「全局 CLI 恰在项目目录内执行」被误判成项目面
export function detectSkillScope(cwd = process.cwd()): SkillScope {
  let pkgRoot: string
  try {
    pkgRoot = realPath(resolvePackageRoot())
  } catch {
    return "global"
  }
  let dir = resolve(cwd)
  for (;;) {
    if (existsSync(join(dir, "package.json"))) {
      const root = realPath(dir)
      if (pathKey(root) === pathKey(pkgRoot)) return "global"
      if (isInside(pkgRoot, root)) return "project"
    }
    const parent = dirname(dir)
    if (parent === dir) return "global"
    dir = parent
  }
}

// 项目侧目标：真源恒为 <repo>/.agents/skills；薄壳落在其余已存在的项目级技能目录
export interface ProjectTargets {
  // 项目根绝对路径
  root: string
  // 真源目录（仓库根相对、posix 分隔）
  sourceDir: string
  // 薄壳目录（仓库根相对、posix 分隔）
  shellDirs: string[]
  // 未命中的候选目录（仓库根相对、posix 分隔）：该 agent 目录尚不在库，需要时可按需补齐
  missingDirs: string[]
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
  const agent = AGENT_SKILL_DIRS.find((a) => pathKey(join(getHomeDir(), a.dir)) === key)
  return agent?.label ?? null
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
// linkTarget 为软链指向（稳定锚点），copySource 为副本内容来源（真源）——pnpm 布局下二者不是同一路径
function writeArtifact(linkTarget: string, copySource: string, dest: string, forceCopy: boolean): { mode: ArtifactMode; reason?: string } {
  if (forceCopy) {
    copyArtifact(copySource, dest)
    return { mode: "copy" }
  }
  try {
    mkdirSync(dirname(dest), { recursive: true })
    symlinkSync(linkTarget, dest, process.platform === "win32" ? "junction" : "dir")
    return { mode: "link" }
  } catch (e) {
    copyArtifact(copySource, dest)
    return { mode: "copy", reason: (e as Error).message }
  }
}

export interface InstallOptions {
  copy?: boolean
  dirs?: string[]
  dryRun?: boolean
  force?: boolean
}

// 安装：对每个可用目标逐个技能做幂等处理——指向正确（含同内容异地锚点）跳过、指向其他版本或悬空重建、非本包实体目录默认跳过（--force 覆盖）
export function installSkills(options: InstallOptions = {}): InstallReport {
  const skills = listPackageSkills()
  const targets = resolveSkillTargets(options.dirs ?? [])
  // 期望链接目标：锚点目录下逐技能一项；判型与写链都用它，保证链接指向跨版本存活的入口
  const linkDir = skillsLinkDir()
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
      const linkTarget = join(linkDir, skill.name)
      const kind = classifyExisting(dest, linkTarget)
      // 既有登记：本目标下该技能此前是否由本包以副本形式写入——决定 --force 与裸 install 的落点形态
      const recordedCopy = previousByDir.get(pathKey(target.dir))?.copies.includes(skill.name) ?? false
      if (kind === "link-ok") {
        result.skipped.push(skill.name)
        result.links.push(skill.name)
        continue
      }
      if (kind === "dir" && !options.force) {
        // 实体目录：若状态文件记载为本包副本则比对内容，否则视为用户自装技能不覆盖
        if (!recordedCopy) {
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
      // 落点形态沿用既有登记：已登记的副本仍是副本，--force 只解除冲突判定、不把副本翻回软链
      const useCopy = Boolean(options.copy) || (kind === "dir" && recordedCopy)
      if (options.dryRun) {
        if (kind === "absent") result.created.push(skill.name)
        else result.updated.push(skill.name)
        if (useCopy) result.copies.push(skill.name)
        else result.links.push(skill.name)
        continue
      }
      try {
        if (!(kind === "absent")) removeArtifact(dest)
        const written = writeArtifact(linkTarget, skill.dir, dest, useCopy)
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
    const result: RemoveResult = { dir: entry.dir, label: skillTargetLabel(entry.dir), removed: [], missing: [], skippedForeign: [], dirReclaimed: false }
    const names = [...new Set([...entry.links, ...entry.copies])]
    for (const name of names) {
      const dest = join(entry.dir, name)
      const source = join(skillsSourceDir(), name)
      // 链接锚点改造前后的两种指向都算本包产物，避免 autoLink 关闭时漏摘旧锚点链接；副本比对仍以真源为准
      const kind = classifyExisting(dest, source, undefined, join(skillsLinkDir(), name))
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
    // 清理后目标目录已空则一并回收，避免留下空壳目录（dryRun 不动现场；非空或不可读时跳过）
    // 仅在 isEmptyDir 为真时进入，故递归删除不会误删已存在的其他内容
    if (!options.dryRun && isEmptyDir(entry.dir)) {
      try {
        rmSync(entry.dir, { recursive: true, force: true })
        result.dirReclaimed = true
      } catch {
        // 回收失败不影响卸载结果：产物已清理，仅多留一个空目录
      }
    }
    results.push(result)
  }

  const nothingLeft = results.every((r) => r.skippedForeign.length === 0)
  const stateRemoved = !options.dryRun && !failed && nothingLeft
  if (stateRemoved) rmSync(stateFile, { force: true })
  return { stateFile, stateExists: true, targets: results, stateRemoved }
}

// 状态判定的技能名集合：包内全部技能名并上该目标的既有登记（含已不在包内的历史记录，如实呈现不丢）
function statusNames(skills: PackageSkill[], recorded?: StateEntry): string[] {
  return [...new Set([...skills.map((s) => s.name), ...(recorded ? [...recorded.links, ...recorded.copies] : [])])].sort()
}

// 逐技能判定现场状态：真源存在与否、现场形态、既有登记三者共同决定
function statusItems(dir: string, names: string[], versionByName: Map<string, string>, recorded?: StateEntry): SkillStatusItem[] {
  const items: SkillStatusItem[] = []
  for (const name of names) {
    const source = join(skillsSourceDir(), name)
    const dest = join(dir, name)
    // 链接接受稳定锚点与真源两种指向（新链接锚在入口、旧链接直指真源），只把指向别处且内容与真源不一致的判为错误；副本比对仍以真源为准
    const kind = classifyExisting(dest, join(skillsLinkDir(), name), undefined, source)
    let state: SkillItemState
    if (kind === "link-ok") state = "link"
    else if (kind === "dangling") state = "dangling"
    else if (kind === "wrong") state = "wrong"
    else if (kind === "file") state = "conflict"
    else if (kind === "dir") {
      // 实体目录按来源分流：状态文件登记为本包副本才叫漂移（裸 install 可刷新），
      // 未登记的同名目录属用户/上游产物，裸 install 会按冲突跳过、需 --force
      if (existsSync(source) && dirsEqual(source, dest)) state = "copy"
      else state = recorded?.copies.includes(name) ? "copy-drift" : "conflict"
    } else state = "missing"
    items.push({ name, state, version: versionByName.get(name) ?? "" })
  }
  return items
}

// 现场状态：目标目录存在或状态文件有记录时逐技能判定，供 status 报告悬空 / 指向其他版本 / 副本漂移 / 同名冲突
export function skillsStatus(): SkillsStatusReport {
  const skills = listPackageSkills()
  const targets = resolveSkillTargets([])
  const state = readSkillsState()
  const stateByDir = new Map<string, StateEntry>()
  for (const entry of state?.targets ?? []) stateByDir.set(pathKey(entry.dir), entry)
  const versionByName = new Map(skills.map((s) => [s.name, s.version]))

  const out: TargetStatus[] = []
  const pendingAgents: Array<{ dir: string; label: string }> = []
  // 已纳入报告的目录，用于循环后补报「状态文件登记但不在解析结果里」的目标
  const resolved = new Set<string>()
  for (const target of targets) {
    const recorded = stateByDir.get(pathKey(target.dir))
    if (!target.available && target.kind === "agent") {
      pendingAgents.push({ dir: target.dir, label: target.label })
      continue
    }
    // 主目标即使未创建也要报告（提示执行 install）；agent / custom 目标仅在目录已有内容或有本包记录时展开，
    // 空壳目录（如卸载后残留）与无记录目标不占版面无噪音
    if (target.kind !== "primary" && !recorded && (!target.dirExists || isEmptyDir(target.dir))) continue
    resolved.add(pathKey(target.dir))
    out.push({
      dir: target.dir,
      label: target.label,
      kind: target.kind,
      available: target.available,
      dirExists: target.dirExists,
      recorded: Boolean(recorded),
      items: statusItems(target.dir, statusNames(skills, recorded), versionByName, recorded),
    })
  }
  // 补报状态文件登记但本次未解析到的目标（如 --dir 安装后不再传参、agent 目录已被移除）：如实呈现，避免静默丢弃
  for (const entry of state?.targets ?? []) {
    if (resolved.has(pathKey(entry.dir))) continue
    out.push({
      dir: entry.dir,
      label: skillTargetLabel(entry.dir) ?? "自定义 --dir",
      kind: "custom",
      available: true,
      dirExists: existsSync(entry.dir),
      recorded: true,
      items: statusItems(entry.dir, statusNames(skills, entry), versionByName, entry),
    })
  }
  return {
    source: skillsSourceDir(),
    skills: skills.map((s) => s.name),
    skillVersions: Object.fromEntries(skills.map((s) => [s.name, s.version])),
    versionMismatches: findSkillVersionMismatches(skills),
    stateFile: skillsStateFile(),
    stateExists: Boolean(state),
    targets: out,
    pendingAgents,
  }
}

// 链接自愈（skills.autoLink，默认 true）：只对状态文件记载的链接做补链与修链
// 不含首次安装、不含升级副本；CI 环境跳过，任何失败静默（不阻塞用户命令）
// 现场被替换为实体目录/普通文件时默认清理重建；skills.autoLinkReplaceForeign=false 则一律不动
export function autoLinkSkills(): number {
  const section = getConfigSection("skills")
  if (section?.autoLink === false) return 0
  if (process.env.CI) return 0
  const state = readSkillsState()
  if (!state) return 0

  // 真源技能名集合：一次列目录替代循环内逐条探活，且只收真实存在（可解析）的名字
  const sourceRoot = skillsSourceDir()
  let sourceNames: Set<string>
  try {
    sourceNames = new Set(readdirSync(sourceRoot).filter((name) => existsSync(join(sourceRoot, name))))
  } catch {
    return 0
  }

  // 期望链接目标：稳定锚点（升级时锚点由 pnpm 重写，链接不随版本段失效）
  const linkDir = skillsLinkDir()
  const replaceForeign = section?.autoLinkReplaceForeign !== false
  const linkType = process.platform === "win32" ? "junction" : "dir"

  let repaired = 0
  const nextEntries: StateEntry[] = []
  for (const entry of state.targets) {
    // 一次列出现场条目及其类型，替代逐条 lstatSync（Windows junction 同样报为符号链接）
    let dirents: Dirent[]
    try {
      dirents = readdirSync(entry.dir, { withFileTypes: true })
    } catch {
      nextEntries.push(entry)
      continue
    }
    const present = new Map(dirents.map((d) => [d.name, d]))
    const links = entry.links.filter((name) => {
      // 已不在包内：剔除记录
      if (!sourceNames.has(name)) return false
      const linkTarget = join(linkDir, name)
      const dest = join(entry.dir, name)
      const dirent = present.get(name)
      const kind: ExistingKind = dirent ? classifyExisting(dest, linkTarget, dirent) : "absent"
      if (kind === "link-ok") return true
      // 非替换模式：现场是实体目录/普通文件时一律不动，记录照留（用户可显式 install --force 处置）
      if (!replaceForeign && (kind === "dir" || kind === "file")) return true
      // 悬空或指向其他版本（内容与真源不一致）：删链重建；实体目录/文件按开关先清理
      try {
        if (kind !== "absent") removeArtifact(dest)
        symlinkSync(linkTarget, dest, linkType)
        repaired += 1
        return true
      } catch {
        // 重建失败不改记账：本条仍是本包登记的产物，留着下次再试
        return true
      }
    })
    nextEntries.push({ ...entry, links, updatedAt: new Date().toISOString() })
  }
  if (repaired > 0) writeSkillsState(nextEntries)
  return repaired
}

// ===== 项目侧分发：仓库内唯一真源副本 + 各候选目录薄壳 =====

// 项目态归属账目录与文件名（仓库根相对、posix 分隔）
export const PROJECT_STATE_DIR = ".toolkit"
export const PROJECT_STATE_FILE = "state.json"
// 薄壳标记与版本：供版本分流（落后重写 / 同版跳过 / 超前不降级）与安全识别
const SKILL_SHELL_MARKER = "toolkit-skill-shell"
const SKILL_SHELL_VERSION = 1
const SKILL_SHELL_MARKER_RE = new RegExp(`<!--\\s*${SKILL_SHELL_MARKER}:\\s*v(\\d+)\\s*-->`)

// 仓库相对路径归一为 posix：写进归属账与报告，跨机器（Windows / POSIX）稳定
function toRepoRel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/")
}

// 读取技能描述：SKILL.md frontmatter 的 description 单行值；缺失返回空串（薄壳触发面由此派生，与真源一致）
export function readSkillDescription(dir: string): string {
  try {
    const content = readTextFile(join(dir, SKILL_ENTRY))
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!frontmatter) return ""
    const matched = (frontmatter[1] ?? "").match(/^description:[ \t]*"?([^"\r\n]+?)"?[ \t]*$/m)
    return matched ? (matched[1] ?? "").trim() : ""
  } catch {
    return ""
  }
}

// 读取薄壳标记版本：无标记返回 null
export function readSkillShellVersion(content: string): number | null {
  const matched = content.match(SKILL_SHELL_MARKER_RE)
  return matched ? Number(matched[1]) : null
}

// 薄壳内容：frontmatter 的 name 与父目录同名（Agent Skills 标准要求），description 派生自真源以保持触发面一致
// 正文不承载技能内容，只指向真源路径；内容变化（含真源描述变更）由字符串全等比对触发重写
export function buildSkillShell(name: string, sourceRel: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description || `本项目内技能 ${name} 的入口壳。`}`,
    "---",
    "",
    `<!-- ${SKILL_SHELL_MARKER}: v${SKILL_SHELL_VERSION} -->`,
    "<!-- 由 toolkit 生成，可安全删除；需要时重跑 toolkit init 或 pnpm install（prepare 钩子）即可补齐 -->",
    `本技能只是入口壳，不承载技能内容：内容以项目仓库根下 \`${sourceRel}/${name}/SKILL.md\` 为唯一真源，同目录的 \`references/\`、\`assets/\` 按需读取。`,
    "",
  ].join("\n")
}

// 项目态归属账：真源路径、真源技能名与各薄壳落点（均仓库根相对、posix 分隔，随 git 分发，跨机器稳定）
export interface ProjectShellEntry {
  dir: string
  names: string[]
}

export interface ProjectSkillsState {
  version: 1
  updatedAt: string
  source: string
  sourceNames: string[]
  shells: ProjectShellEntry[]
}

// 项目态账文件绝对路径：<repo>/.toolkit/state.json
export function projectStateFile(root: string): string {
  return join(root, PROJECT_STATE_DIR, PROJECT_STATE_FILE)
}

// 读取项目态账：不存在或损坏返回 null（按未安装过处理，不影响主流程）
export function readProjectState(root: string): ProjectSkillsState | null {
  const file = projectStateFile(root)
  if (!existsSync(file)) return null
  try {
    const data = JSON.parse(readTextFile(file)) as ProjectSkillsState
    if (!data || !Array.isArray(data.shells)) return null
    return data
  } catch {
    return null
  }
}

// 账体比对键：不看 updatedAt，避免每次 prepare 都改写文件（否则 git 工作区常年脏）
function projectStateBody(s: ProjectSkillsState): string {
  return JSON.stringify({ source: s.source, sourceNames: s.sourceNames, shells: s.shells })
}

// 写入项目态账：仅内容变化时落地，updatedAt 取实际写入时刻
function writeProjectState(root: string, body: { source: string; sourceNames: string[]; shells: ProjectShellEntry[] }): void {
  const prev = readProjectState(root)
  const next: ProjectSkillsState = { version: 1, updatedAt: new Date().toISOString(), ...body }
  if (prev && projectStateBody(prev) === projectStateBody(next)) return
  const file = projectStateFile(root)
  mkdirSync(dirname(file), { recursive: true })
  writeFileAtomic(file, `${JSON.stringify(next, null, 2)}\n`)
}

export interface ProjectInstallOptions {
  cwd?: string
  dirs?: string[]
  dryRun?: boolean
  force?: boolean
}

// 项目侧某目录的逐技能写入结果（真源目录与各薄壳目录共用同一结构）
export interface ProjectDirResult {
  dir: string
  created: string[]
  updated: string[]
  skipped: string[]
  conflicts: string[]
  failed: Array<{ name: string; reason: string }>
}

export interface ProjectInstallReport {
  root: string
  skills: string[]
  source: ProjectDirResult
  shells: ProjectDirResult[]
  // 未命中的候选目录（仓库根相对）：该 agent 目录尚不在库，需要时可按需补齐
  missingDirs: string[]
  // 落在仓库之外被剔除的 --dir 取值（按「降级不静默」告警，不静默丢弃）
  ignoredDirs: string[]
  stateFile: string
}

// 逐技能结果归档：按动作分派到对应清单
function recordAction(result: ProjectDirResult, action: "created" | "updated" | "skipped" | "conflict", name: string): void {
  if (action === "created") result.created.push(name)
  else if (action === "updated") result.updated.push(name)
  else if (action === "skipped") result.skipped.push(name)
  else result.conflicts.push(name)
}

// 真源副本写入：缺则建；内容一致跳过；有本包归属记录或 --force 时刷新（升级场景），否则视为他人同名技能交人工
function applySourceCopy(source: string, dest: string, recorded: boolean, force: boolean, dryRun: boolean): "created" | "updated" | "skipped" | "conflict" {
  if (!existsSync(dest)) {
    if (!dryRun) copyArtifact(source, dest)
    return "created"
  }
  if (dirsEqual(source, dest)) return "skipped"
  if (!recorded && !force) return "conflict"
  if (!dryRun) {
    removeArtifact(dest)
    copyArtifact(source, dest)
  }
  return "updated"
}

// 薄壳写入：缺则建；内容全等跳过；标记超前不降级覆盖；无标记视为他人产物（非 --force 不改）；否则就地重写
function applyShell(file: string, expected: string, force: boolean, dryRun: boolean): "created" | "updated" | "skipped" | "conflict" {
  const exists = existsSync(file)
  const actual = exists ? readTextFile(file) : ""
  const version = exists ? readSkillShellVersion(actual) : null
  let action: "created" | "updated" | "skipped" | "conflict"
  if (!exists) action = "created"
  else if (version !== null && version > SKILL_SHELL_VERSION) action = "skipped"
  else if (actual === expected) action = "skipped"
  else if (version === null && !force) action = "conflict"
  else action = "updated"
  if (!dryRun && (action === "created" || action === "updated")) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileAtomic(file, expected)
  }
  return action
}

// 项目侧安装：真源副本（仓库内唯一一份，入库）+ 各候选目录薄壳（指向真源）
// 真源只此一份，其余目录放薄壳引用，避免多份副本互相漂移
export function installProjectSkills(options: ProjectInstallOptions = {}): ProjectInstallReport {
  const cwd = options.cwd ?? process.cwd()
  const skills = listPackageSkills()
  const targets = resolveProjectTargets(cwd)
  const root = targets.root
  const previous = readProjectState(root)
  const recordedNames = new Set(previous?.sourceNames ?? [])

  // 额外薄壳目录：只接受落在仓库内的取值，库外取值剔除并回报（降级不静默）
  const ignoredDirs: string[] = []
  const extraShellDirs: string[] = []
  for (const raw of options.dirs ?? []) {
    const abs = resolve(cwd, raw)
    if (!isInside(abs, root)) {
      ignoredDirs.push(raw)
      continue
    }
    const rel = toRepoRel(root, abs)
    if (rel !== targets.sourceDir && !extraShellDirs.includes(rel)) extraShellDirs.push(rel)
  }
  const shellDirs = [...targets.shellDirs.filter((dir) => !extraShellDirs.includes(dir)), ...extraShellDirs]

  const source: ProjectDirResult = { dir: targets.sourceDir, created: [], updated: [], skipped: [], conflicts: [], failed: [] }
  const sourceAbs = join(root, targets.sourceDir)
  const sourceNames: string[] = []
  for (const skill of skills) {
    try {
      const action = applySourceCopy(skill.dir, join(sourceAbs, skill.name), recordedNames.has(skill.name), Boolean(options.force), Boolean(options.dryRun))
      recordAction(source, action, skill.name)
      if (action !== "conflict") sourceNames.push(skill.name)
    } catch (e) {
      source.failed.push({ name: skill.name, reason: (e as Error).message })
    }
  }

  const shells: ProjectDirResult[] = []
  const shellEntries: ProjectShellEntry[] = []
  for (const dir of shellDirs) {
    const result: ProjectDirResult = { dir, created: [], updated: [], skipped: [], conflicts: [], failed: [] }
    const names: string[] = []
    for (const skill of skills) {
      const expected = buildSkillShell(skill.name, targets.sourceDir, readSkillDescription(skill.dir))
      try {
        const action = applyShell(join(root, dir, skill.name, SKILL_ENTRY), expected, Boolean(options.force), Boolean(options.dryRun))
        recordAction(result, action, skill.name)
        if (action !== "conflict") names.push(skill.name)
      } catch (e) {
        result.failed.push({ name: skill.name, reason: (e as Error).message })
      }
    }
    shells.push(result)
    shellEntries.push({ dir, names })
  }

  if (!options.dryRun) writeProjectState(root, { source: targets.sourceDir, sourceNames, shells: shellEntries })

  return {
    root,
    skills: skills.map((s) => s.name),
    source,
    shells,
    missingDirs: targets.missingDirs,
    ignoredDirs,
    stateFile: toRepoRel(root, projectStateFile(root)),
  }
}

// ===== 项目侧体检与卸载 =====

// 项目侧逐项状态：真源只此一份、薄壳只认本包标记，故比全局态更薄（无软链相关的悬空 / 指向其他版本）
export type ProjectItemState = "ready" | "drift" | "conflict" | "missing"

export interface ProjectSkillItem {
  name: string
  state: ProjectItemState
  // 真源声明版本，与全局 status 同口径供「会话上下文已过期」判定
  version: string
}

// 项目侧单目录状态：kind 区分真源目录（完整副本）与薄壳目录（指向真源）
export interface ProjectDirStatus {
  dir: string
  kind: "source" | "shell"
  items: ProjectSkillItem[]
}

export interface ProjectStatusReport {
  root: string
  sourceDir: string
  skills: string[]
  skillVersions: Record<string, string>
  versionMismatches: SkillVersionMismatch[]
  stateFile: string
  stateExists: boolean
  dirs: ProjectDirStatus[]
  // 未命中的候选目录（仓库根相对）：该 agent 目录尚不在库，需要时可按需补齐
  missingDirs: string[]
}

// 单薄壳状态判定：缺 → missing；无标记 → conflict（他人同名产物）；标记超前 → ready（不降级）；否则与期望逐字比对
function shellItemState(file: string, skill: PackageSkill, sourceDir: string): ProjectItemState {
  if (!existsSync(file)) return "missing"
  let actual: string
  try {
    actual = readTextFile(file)
  } catch {
    return "conflict"
  }
  const version = readSkillShellVersion(actual)
  if (version === null) return "conflict"
  if (version > SKILL_SHELL_VERSION) return "ready"
  return actual === buildSkillShell(skill.name, sourceDir, readSkillDescription(skill.dir)) ? "ready" : "drift"
}

// 项目侧体检：真源副本与各薄壳目录逐技能判定，供人工决定是否重跑 install / init
export function projectSkillsStatus(cwd = process.cwd()): ProjectStatusReport {
  const skills = listPackageSkills()
  const targets = resolveProjectTargets(cwd)
  const root = targets.root
  const state = readProjectState(root)
  const recordedSource = new Set(state?.sourceNames ?? [])
  const versionByName = new Map(skills.map((s) => [s.name, s.version]))

  // 真源目录：缺失 / 内容与包内真源逐字一致 / 有归属记录但被改动（漂移） / 无记录的同名目录（冲突）
  const sourceItems: ProjectSkillItem[] = skills.map((s) => {
    const dest = join(root, targets.sourceDir, s.name)
    let st: ProjectItemState
    if (!existsSync(dest)) st = "missing"
    else if (dirsEqual(s.dir, dest)) st = "ready"
    else st = recordedSource.has(s.name) ? "drift" : "conflict"
    return { name: s.name, state: st, version: versionByName.get(s.name) ?? "" }
  })
  const dirs: ProjectDirStatus[] = [{ dir: targets.sourceDir, kind: "source", items: sourceItems }]

  const recordedByDir = new Map((state?.shells ?? []).map((e) => [e.dir, new Set(e.names)]))
  for (const dir of targets.shellDirs) {
    const recorded = recordedByDir.get(dir) ?? new Set<string>()
    const items: ProjectSkillItem[] = skills.map((s) => {
      const file = join(root, dir, s.name, SKILL_ENTRY)
      let st = shellItemState(file, s, targets.sourceDir)
      // 无标记但本包曾登记：视为被外部改动（漂移）而非陌生同名产物，便于区分「需重写」与「需人工确认」
      if (st === "conflict" && recorded.has(s.name)) st = "drift"
      return { name: s.name, state: st, version: versionByName.get(s.name) ?? "" }
    })
    dirs.push({ dir, kind: "shell", items })
  }

  return {
    root,
    sourceDir: targets.sourceDir,
    skills: skills.map((s) => s.name),
    skillVersions: Object.fromEntries(skills.map((s) => [s.name, s.version])),
    versionMismatches: findSkillVersionMismatches(skills),
    stateFile: toRepoRel(root, projectStateFile(root)),
    stateExists: Boolean(state),
    dirs,
    missingDirs: targets.missingDirs,
  }
}

// 项目侧单目录卸载结果
export interface ProjectRemoveResult {
  dir: string
  kind: "source" | "shell"
  removed: string[]
  missing: string[]
  // 内容与真源不一致或非本包产物（如薄壳标记缺失），出于安全跳过，交人工确认
  skippedForeign: string[]
}

export interface ProjectRemoveReport {
  root: string
  stateFile: string
  stateExists: boolean
  sourceDir: string
  dirs: ProjectRemoveResult[]
  // 清理后变为空并被一并回收的目录（仓库根相对）
  reclaimed: string[]
  stateRemoved: boolean
}

// 项目侧卸载：只清理项目态账记载的产物——真源副本内容与包内真源一致才删，薄壳带本包标记才删，其余交人工
export function removeProjectSkills(options: { cwd?: string; dryRun?: boolean } = {}): ProjectRemoveReport {
  const cwd = options.cwd ?? process.cwd()
  const targets = resolveProjectTargets(cwd)
  const root = targets.root
  const file = projectStateFile(root)
  const stateFile = toRepoRel(root, file)
  const state = readProjectState(root)
  if (!state) return { root, stateFile, stateExists: false, sourceDir: targets.sourceDir, dirs: [], reclaimed: [], stateRemoved: false }

  const sourceByName = new Map(listPackageSkills().map((s) => [s.name, s.dir]))
  const dirs: ProjectRemoveResult[] = []
  const reclaimed: string[] = []
  let failed = false

  const source: ProjectRemoveResult = { dir: targets.sourceDir, kind: "source", removed: [], missing: [], skippedForeign: [] }
  for (const name of state.sourceNames) {
    const dest = join(root, targets.sourceDir, name)
    if (!existsSync(dest)) {
      source.missing.push(name)
      continue
    }
    const src = sourceByName.get(name)
    if (!src || !dirsEqual(src, dest)) {
      source.skippedForeign.push(name)
      continue
    }
    if (options.dryRun) {
      source.removed.push(name)
      continue
    }
    try {
      removeArtifact(dest)
      source.removed.push(name)
    } catch {
      failed = true
      source.skippedForeign.push(name)
    }
  }
  dirs.push(source)

  for (const entry of state.shells) {
    const result: ProjectRemoveResult = { dir: entry.dir, kind: "shell", removed: [], missing: [], skippedForeign: [] }
    for (const name of entry.names) {
      const skillDir = join(root, entry.dir, name)
      const shellFile = join(skillDir, SKILL_ENTRY)
      if (!existsSync(shellFile)) {
        result.missing.push(name)
        continue
      }
      let actual = ""
      try {
        actual = readTextFile(shellFile)
      } catch {
        result.skippedForeign.push(name)
        continue
      }
      if (readSkillShellVersion(actual) === null) {
        result.skippedForeign.push(name)
        continue
      }
      if (options.dryRun) {
        result.removed.push(name)
        continue
      }
      try {
        removeArtifact(skillDir)
        result.removed.push(name)
      } catch {
        failed = true
        result.skippedForeign.push(name)
      }
    }
    dirs.push(result)
  }

  // 目录回收：真源目录与薄壳目录清空后一并回收（仅在 isEmptyDir 为真时递归删，避免误删其他内容）
  if (!options.dryRun) {
    for (const dir of [targets.sourceDir, ...state.shells.map((e) => e.dir)]) {
      const abs = join(root, dir)
      if (!existsSync(abs) || !isEmptyDir(abs)) continue
      try {
        rmSync(abs, { recursive: true, force: true })
        reclaimed.push(dir)
      } catch {
        // 回收失败不影响卸载结果：产物已清理，仅多留一个空目录
      }
    }
  }

  const nothingLeft = dirs.every((r) => r.skippedForeign.length === 0)
  const stateRemoved = !options.dryRun && !failed && nothingLeft
  if (stateRemoved) rmSync(file, { force: true })
  return { root, stateFile, stateExists: true, sourceDir: targets.sourceDir, dirs, reclaimed, stateRemoved }
}
