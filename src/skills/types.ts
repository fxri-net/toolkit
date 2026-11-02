// 技能分发的公共类型与常量：模块间共享的契约集中在此，避免各处重复声明导致口径漂移
import { FALLBACK_SKILL_DIR } from "../conventions/entry"

// 本包名：从模块位置向上定位包根，npm / pnpm / yarn / bun 装的都通用，不依赖 pnpm root -g 之类猜路径
export const PKG_NAME = "@fxri/toolkit"
// 技能标识文件：目录内含该文件才计为一个技能
export const SKILL_ENTRY = "SKILL.md"
// 主目标：上游 canonical 目录（多家 agent 共读），与下方表中 .agents/skills 条目同路径，靠去重合并
export const CANONICAL_DIR = ".agents/skills"
// 主目标显示名：解析与反查共用一份，避免两处字面量漂移
export const CANONICAL_LABEL = "canonical（多家 agent 共读）"
// 主目标稳定名：写入 skillsInstall.targets 时代表 canonical 目录
export const CANONICAL_TARGET_NAME = "canonical"
// 历史落点：Codex / Pi 改为 canonical 共读前的全局分发目录；升级前的产物与状态登记可能仍留在用户机器上
export const LEGACY_SKILL_DIRS: Array<{ dir: string; label: string }> = [
  { dir: ".codex/skills", label: "Codex（历史落点）" },
  { dir: ".pi/agent/skills", label: "Pi（历史落点）" },
]
// 状态文件名：与上游 .skill-lock.json 分开命名，避免互相覆盖
export const SKILLS_STATE_FILE = ".toolkit-skills.json"
// 状态文件格式标识与当前 schema 版本：单文件新结构，不做旧版兼容（旧结构读取时一次性导入）
export const STATE_FORMAT = "fxri.toolkit.skills-state"
export const STATE_SCHEMA_VERSION = 1
// 内置技能来源名：本任务只支持包内源，外部来源由后续能力扩展
export const BUILTIN_SOURCE = "toolkit"
// 项目侧真源目录（仓库根相对、posix 分隔）：完整副本只此一份，其余候选目录放薄壳指向它
export const PROJECT_SOURCE_DIR = FALLBACK_SKILL_DIR
// 项目态归属账目录与文件名（仓库根相对、posix 分隔）
export const PROJECT_STATE_DIR = ".toolkit"
export const PROJECT_STATE_FILE = "state.json"

// 目标类型：primary 主目标 / agent 快照表内 agent 目录 / custom 用户 --dir 指定
export type TargetKind = "primary" | "agent" | "custom"
// 产物类型：link 软链（指向真源）/ copy 副本 / shell 项目面入口薄壳
export type ArtifactMode = "link" | "copy"
// 状态文件里的产物模式：项目面薄壳单列 shell
export type StateMode = ArtifactMode | "shell"
// 技能分层：core 必装、不可取消；optional 可选，缺省按 optional 处理
export type SkillTier = "core" | "optional"

// 内置 agent 全局技能目录快照（来源：上游 vercel-labs/skills 的 agent 表，77 条可安装项；另补本地核实的 DeepSeek Harness）
// dir 相对用户 home；dirEnv 指定改写 dir 首段的环境变量（如 CLAUDE_CONFIG_DIR）；detect 为额外存在性判据（相对 home 或绝对路径）
// detectEnv 为仅用于探测的环境变量：键为变量名、值为相对变量值的路径后缀（空串表示变量值本身）
// viaCanonical 标记该 agent 全局读取的就是 canonical 目录：共享主目标、无需单独写入，status 需单列呈现
export interface AgentEntry {
  name: string
  label: string
  dir: string
  dirEnv?: string
  detect?: string[]
  detectEnv?: Record<string, string>
  viaCanonical?: boolean
}

export const AGENT_SKILL_DIRS: AgentEntry[] = [
  { name: "aider-desk", label: "AiderDesk", dir: ".aider-desk/skills" },
  { name: "amp", label: "Amp", dir: ".config/agents/skills", dirEnv: "XDG_CONFIG_HOME", detect: [".config/amp"] },
  { name: "antigravity", label: "Antigravity", dir: ".gemini/antigravity/skills" },
  { name: "antigravity-cli", label: "Antigravity CLI", dir: ".gemini/antigravity-cli/skills" },
  { name: "astrbot", label: "AstrBot", dir: ".astrbot/data/skills", detect: [".astrbot"] },
  { name: "autohand-code", label: "Autohand Code CLI", dir: ".autohand/skills", dirEnv: "AUTOHAND_HOME" },
  { name: "augment", label: "Augment", dir: ".augment/skills" },
  { name: "bob", label: "IBM Bob", dir: ".bob/skills" },
  { name: "claude-code", label: "Claude Code", dir: ".claude/skills", dirEnv: "CLAUDE_CONFIG_DIR" },
  { name: "openclaw", label: "OpenClaw", dir: ".openclaw/skills", detect: [".openclaw", ".clawdbot", ".moltbot"] },
  { name: "cline", label: "Cline", dir: CANONICAL_DIR, viaCanonical: true, detect: [".cline"] },
  { name: "codearts-agent", label: "CodeArts Agent", dir: ".codeartsdoer/skills" },
  { name: "codebuddy", label: "CodeBuddy", dir: ".codebuddy/skills" },
  { name: "codemaker", label: "Codemaker", dir: ".codemaker/skills" },
  { name: "codestudio", label: "Code Studio", dir: ".codestudio/skills" },
  { name: "codex", label: "Codex", dir: CANONICAL_DIR, viaCanonical: true, detect: [".codex", "/etc/codex"], detectEnv: { CODEX_HOME: "" } },
  { name: "command-code", label: "Command Code", dir: ".commandcode/skills" },
  { name: "continue", label: "Continue", dir: ".continue/skills" },
  { name: "cortex", label: "Cortex Code", dir: ".snowflake/cortex/skills" },
  { name: "crush", label: "Crush", dir: ".config/crush/skills" },
  { name: "cursor", label: "Cursor", dir: ".cursor/skills" },
  { name: "deepagents", label: "Deep Agents", dir: ".deepagents/agent/skills", detect: [".deepagents"] },
  { name: "deepseek-harness", label: "DeepSeek Harness", dir: CANONICAL_DIR, viaCanonical: true, detect: [".dsh"] },
  { name: "devin", label: "Devin for Terminal", dir: ".config/devin/skills", dirEnv: "XDG_CONFIG_HOME" },
  { name: "dexto", label: "Dexto", dir: CANONICAL_DIR, viaCanonical: true, detect: [".dexto"] },
  { name: "droid", label: "Droid", dir: ".factory/skills" },
  { name: "firebender", label: "Firebender", dir: ".firebender/skills" },
  { name: "forgecode", label: "ForgeCode", dir: ".forge/skills" },
  // fx 例外：上游虽读 canonical，但其自身仍保留 .fx/skills 根，落点照本地实现，勿按漂移处理
  { name: "fx", label: "fx", dir: ".fx/skills" },
  { name: "gemini-cli", label: "Gemini CLI", dir: ".gemini/skills" },
  { name: "github-copilot", label: "GitHub Copilot", dir: ".copilot/skills" },
  { name: "goose", label: "Goose", dir: ".config/goose/skills", dirEnv: "XDG_CONFIG_HOME" },
  { name: "grok", label: "Grok Build", dir: ".grok/skills", dirEnv: "GROK_HOME" },
  { name: "hermes-agent", label: "Hermes Agent", dir: ".hermes/skills", dirEnv: "HERMES_HOME" },
  { name: "inference-sh", label: "inference.sh", dir: ".inferencesh/skills" },
  { name: "jazz", label: "Jazz", dir: ".jazz/skills" },
  { name: "junie", label: "Junie", dir: ".junie/skills" },
  { name: "iflow-cli", label: "iFlow CLI", dir: ".iflow/skills" },
  { name: "kilo", label: "Kilo Code", dir: ".kilo/skills", detect: [".kilo", ".kilocode"] },
  { name: "kimchi", label: "Kimchi", dir: ".config/kimchi/harness/skills", detect: [".config/kimchi"] },
  { name: "kimi-code-cli", label: "Kimi Code CLI", dir: CANONICAL_DIR, viaCanonical: true, detect: [".kimi-code", ".kimi"] },
  { name: "kiro-cli", label: "Kiro CLI", dir: ".kiro/skills" },
  { name: "kode", label: "Kode", dir: ".kode/skills" },
  { name: "lingma", label: "Lingma", dir: ".lingma/skills" },
  { name: "loaf", label: "Loaf", dir: CANONICAL_DIR, viaCanonical: true, detect: [".loaf"] },
  { name: "mcpjam", label: "MCPJam", dir: ".mcpjam/skills" },
  { name: "minimax-code", label: "MiniMax Code", dir: ".minimax/skills", detect: [".minimax", "/Applications/MiniMax Code.app"] },
  { name: "mistral-vibe", label: "Mistral Vibe", dir: ".vibe/skills", dirEnv: "VIBE_HOME" },
  { name: "moxby", label: "Moxby", dir: ".moxby/skills" },
  { name: "mux", label: "Mux", dir: ".mux/skills" },
  { name: "opencode", label: "OpenCode", dir: ".config/opencode/skills", dirEnv: "XDG_CONFIG_HOME" },
  { name: "openhands", label: "OpenHands", dir: ".openhands/skills" },
  { name: "ona", label: "Ona", dir: ".ona/skills" },
  { name: "pi", label: "Pi", dir: CANONICAL_DIR, viaCanonical: true, detect: [".pi/agent"] },
  { name: "posit-assistant", label: "Posit Assistant", dir: ".posit/assistant/skills", detect: [".posit/assistant", ".positai"] },
  { name: "qoder", label: "Qoder", dir: ".qoder/skills" },
  { name: "qoder-cn", label: "Qoder CN", dir: ".qoder-cn/skills" },
  { name: "qwen-code", label: "Qwen Code", dir: ".qwen/skills" },
  { name: "replit", label: "Replit", dir: ".config/agents/skills", dirEnv: "XDG_CONFIG_HOME" },
  { name: "reasonix", label: "Reasonix", dir: ".reasonix/skills" },
  { name: "rovodev", label: "Rovo Dev", dir: ".rovodev/skills" },
  { name: "roo", label: "Roo Code", dir: ".roo/skills" },
  { name: "sarvam-code", label: "Sarvam Code", dir: CANONICAL_DIR, viaCanonical: true, detect: [".sarvam"], detectEnv: { SARVAM_HOME: "" } },
  { name: "tabnine-cli", label: "Tabnine CLI", dir: ".tabnine/agent/skills", detect: [".tabnine"] },
  { name: "terramind", label: "Terramind", dir: ".terramind/skills" },
  { name: "tinycloud", label: "Tinycloud", dir: ".tinycloud/skills" },
  { name: "trae", label: "Trae", dir: ".trae/skills" },
  { name: "trae-cn", label: "Trae CN", dir: ".trae-cn/skills" },
  { name: "warp", label: "Warp", dir: CANONICAL_DIR, viaCanonical: true, detect: [".warp"] },
  { name: "windsurf", label: "Windsurf", dir: ".codeium/windsurf/skills" },
  {
    name: "zed",
    label: "Zed",
    dir: CANONICAL_DIR,
    viaCanonical: true,
    detect: [".config/zed"],
    detectEnv: { XDG_CONFIG_HOME: "zed", APPDATA: "Zed", FLATPAK_XDG_CONFIG_HOME: "zed" },
  },
  { name: "zcode", label: "ZCode", dir: ".zcode/skills", detect: [".zcode", "/Applications/ZCode.app"] },
  { name: "zencoder", label: "Zencoder", dir: ".zencoder/skills" },
  { name: "zenflow", label: "Zenflow", dir: ".zencoder/skills" },
  { name: "neovate", label: "Neovate", dir: ".neovate/skills" },
  { name: "pochi", label: "Pochi", dir: ".pochi/skills" },
  { name: "adal", label: "AdaL", dir: ".adal/skills" },
  { name: "universal", label: "Universal", dir: ".config/agents/skills", dirEnv: "XDG_CONFIG_HOME" },
]

// 包内技能（含 SKILL.md 的目录才算）
export interface PackageSkill {
  name: string
  dir: string
  // SKILL.md frontmatter metadata.version；未声明版本时为空串（兼容第三方技能）
  version: string
  // SKILL.md frontmatter metadata.tier；缺省按 optional
  tier: SkillTier
}

// 技能版本双写位不一致条目：frontmatter 声明值与正文声明值（正文未声明时为空串）
export interface SkillVersionMismatch {
  name: string
  frontmatter: string
  body: string
}

// 解析后的目标目录
export interface SkillTarget {
  // 目标稳定名：主目标 canonical，agent 目录取快照表 name，--dir 自定义目录为空串（不参与长期选择）
  name: string
  dir: string
  label: string
  kind: TargetKind
  // 是否可作为写入目标：主目标与 --dir 恒真；agent 目录要求其配置目录已存在，避免凭空造目录
  available: boolean
  dirExists: boolean
}

// 单个技能的现场状态：not-selected 不进报告，installed-unselected 单列提示、不计入 problems
export type SkillItemState =
  | "link"
  | "dangling"
  | "wrong"
  | "copy"
  | "copy-drift"
  | "missing"
  | "conflict"
  | "not-selected"
  | "installed-unselected"

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
  // 是否在本次目标选择集内；未选择的既有产物单列 installed-unselected
  selected: boolean
  items: SkillStatusItem[]
}

// 经 canonical 共读的 agent：本机已安装、全局读取的就是主目标目录，共享同一份产物、无需单独写入
export interface CanonicalReader {
  name: string
  label: string
}

export interface SkillsStatusReport {
  source: string
  skills: string[]
  // 本次生效的技能选择集（未保存过选择时按 core 处理）
  selection: string[]
  // 本次生效的目标选择集（canonical / agent name；空数组表示沿用全部可用目标）
  targetSelection: string[]
  // 各技能真源版本，作为「会话上下文已过期」判定的磁盘基准值
  skillVersions: Record<string, string>
  // 版本双写位（frontmatter / 正文）不一致的技能，供软告警提示同步递增
  versionMismatches: SkillVersionMismatch[]
  stateFile: string
  stateExists: boolean
  targets: TargetStatus[]
  pendingAgents: Array<{ dir: string; label: string }>
  // 本机已安装的 canonical 共读 agent：它们与主目标同路径，写入目标里看不到，需单列呈现
  canonicalReaders: CanonicalReader[]
  // 历史落点残留：状态文件有登记、目录仍在、且已不是当前分发目标，提示可清理（不自动删除）
  legacyTargets: Array<{ dir: string; label: string }>
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
  // --prune 清理掉的未选择产物
  pruned: string[]
}

export interface InstallReport {
  source: string
  skills: string[]
  selection: string[]
  // 本次写入的目标名（canonical / agent name）；--dir 自定义目录不计入
  targetSelection: string[]
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

// 状态文件条目：按目标目录记录本包写入的技能及其形态
export interface SkillStateEntry {
  name: string
  version: string
  mode: StateMode
}

export interface SkillStateTarget {
  // 目标稳定标识：主目标为 primary，其余按「类型 + 路径」派生，供后续 agent 选择能力复用
  id: string
  dir: string
  label: string
  kind: TargetKind | "source" | "shell"
  entries: SkillStateEntry[]
}

// 单个技能来源的登记：本任务只落 toolkit 内置源，结构为后续外部来源预留
export interface SkillStateSource {
  kind: string
  version: string
  temporary: boolean
  targets: SkillStateTarget[]
}

export interface SkillsState {
  format: typeof STATE_FORMAT
  schemaVersion: typeof STATE_SCHEMA_VERSION
  updatedAt: string
  sources: Record<string, SkillStateSource>
}

// 技能作用域：project 走项目侧（仓库内唯一真源副本 + 各候选目录薄壳），global 走全局（软链 / 副本到各 agent 全局目录）
export type SkillScope = "project" | "global"

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

// 项目侧某目录的逐技能写入结果（真源目录与各薄壳目录共用同一结构）
export interface ProjectDirResult {
  dir: string
  created: string[]
  updated: string[]
  skipped: string[]
  conflicts: string[]
  failed: Array<{ name: string; reason: string }>
  // --prune 清理掉的未选择产物
  pruned: string[]
}

export interface ProjectInstallReport {
  root: string
  skills: string[]
  selection: string[]
  // 本次写入的薄壳目录（仓库根相对）
  targetSelection: string[]
  source: ProjectDirResult
  shells: ProjectDirResult[]
  // 未命中的候选目录（仓库根相对）：该 agent 目录尚不在库，需要时可按需补齐
  missingDirs: string[]
  // 落在仓库之外被剔除的 --dir 取值（按「降级不静默」告警，不静默丢弃）
  ignoredDirs: string[]
  stateFile: string
}

// 项目侧逐项状态：installed-unselected 表示未选择但已有本包产物，单列提示、不计入 problems
export type ProjectItemState = "ready" | "drift" | "conflict" | "missing" | "not-selected" | "installed-unselected"

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
  // 薄壳目录是否在本次目标选择集内；未选择目录的既有产物单列 installed-unselected
  selected: boolean
  items: ProjectSkillItem[]
}

export interface ProjectStatusReport {
  root: string
  sourceDir: string
  skills: string[]
  selection: string[]
  // 本次生效的项目薄壳目录选择集（仓库根相对；未保存过选择时为空数组，表示沿用全部已存在候选目录）
  targetSelection: string[]
  skillVersions: Record<string, string>
  versionMismatches: SkillVersionMismatch[]
  stateFile: string
  stateExists: boolean
  dirs: ProjectDirStatus[]
  // 未命中的候选目录（仓库根相对）：该 agent 目录尚不在库，需要时可按需补齐
  missingDirs: string[]
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
