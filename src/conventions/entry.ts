// 技能入口壳：把项目级技能目录当作规范载体的「一阶触发面」，让用户不主动发问也能被 agent 读到
// 落点取项目级技能目录（随 git 提交、团队共享），与 src/skills.ts 的全局软链分发是两套互不干扰的面
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"
import { ENTRY_MARKER, ENTRY_VERSION, readEntryVersion } from "./format"

// 入口壳名：与目录名同名（Agent Skills 标准要求 frontmatter 的 name 与父目录一致），带 toolkit 前缀以区分来源
export const ENTRY_SHELL_NAME = "toolkit-conventions"
// 技能标识文件：目录内含该文件才计为一个技能
export const SKILL_ENTRY = "SKILL.md"
// 项目级技能目录候选：全部已存在者各写一份（多 agent 混用团队都能读到）；全部缺失时回落到中立共识目录
export const PROJECT_SKILL_DIRS = [".agents/skills", ".trae/skills", ".trae-cn/skills", ".cursor/skills", ".claude/skills"]
// 回落落点：无任一候选目录时的默认目录（多家 agent 共读的中立共识目录）
export const FALLBACK_SKILL_DIR = ".agents/skills"

// AGENTS.md 指针块标记：仅当 AGENTS.md 已存在时幂等追加，不新建文件
export const AGENTS_POINTER_START = "<!-- toolkit-conventions-pointer:start -->"
export const AGENTS_POINTER_END = "<!-- toolkit-conventions-pointer:end -->"

// 入口壳现场：dir / file 均为仓库根相对路径（统一 / 分隔），version 取自壳内标记（null 表无标记）
export interface EntryShell {
  dir: string
  file: string
  version: number | null
}

// 入口壳告警：file 为仓库根相对路径（供 check 定位跳转），message 内联全部落点路径
export interface EntryShellAlert {
  file: string
  message: string
}

// 壳 description 触发面：写触发场景而非内容摘要，内容摘要会随载体演进而失真
const ENTRY_SHELL_DESCRIPTION =
  "本项目协作规范入口。当需要查阅或遵循本项目沉淀的协作规范、判断某条规范如何落地、或新增与修订规范时使用。"

// 壳正文：不写死任务区路径（任务区可外置），由 AI 按项目配置解析
export function buildEntryShell(): string {
  return [
    "---",
    `name: ${ENTRY_SHELL_NAME}`,
    `description: ${ENTRY_SHELL_DESCRIPTION}`,
    "---",
    "",
    ENTRY_MARKER,
    "<!-- 由 toolkit init 生成，可安全删除；需要时重跑 toolkit init 即可补齐 -->",
    "本技能只是入口，不承载条文：读本项目任务区（默认 `.tasks`，已配置 `tasks.dir` 时按配置声明）下的 `conventions/index.md`，按其「用法说明」节执行；条文以各文件的单一事实源为准。",
    "",
  ].join("\n")
}

// 解析落点：全部已存在的项目级技能目录（多 agent 混用团队各写一份，互不覆盖）；一个都不存在时回落中立共识目录
// 只在已有目录内落盘，不为使用者未安装的 agent 凭空创建目录
export function resolveProjectSkillDirs(cwd: string): string[] {
  const dirs = PROJECT_SKILL_DIRS.filter((rel) => existsSync(join(cwd, rel)))
  return dirs.length > 0 ? dirs : [FALLBACK_SKILL_DIR]
}

// 列出各候选目录下已有的入口壳（供体检与告警复用，不写盘）
// 只扫 PROJECT_SKILL_DIRS 五个内置候选目录：用户手工拷到未收录目录（如 .windsurf/skills）的壳体检看不到
export function findEntryShells(cwd: string): EntryShell[] {
  const shells: EntryShell[] = []
  for (const rel of PROJECT_SKILL_DIRS) {
    const dir = `${rel}/${ENTRY_SHELL_NAME}`
    const file = `${dir}/${SKILL_ENTRY}`
    if (!existsSync(join(cwd, file))) continue
    shells.push({ dir, file, version: readEntryVersion(readTextFile(join(cwd, file))) })
  }
  return shells
}

// 版本不一致告警：多落点合并为一条并逐壳标注标记版本，避免同一问题按壳数重复刷屏
// 措辞中性：标记可能落后也可能超前（壳由更新版本 toolkit 生成后被旧版检出），不预设方向
// 供 check 与 status 共用同一构造器，防止两处文案各自漂移
export function mismatchedShellAlert(shells: EntryShell[]): EntryShellAlert | null {
  const [first] = shells
  if (!first) return null
  const mark = (s: EntryShell) => (s.version === null ? "无" : `v${s.version}`)
  if (shells.length === 1) {
    return {
      file: first.file,
      message: `入口壳标记 ${mark(first)}，与当前 toolkit 的 v${ENTRY_VERSION} 不一致：重跑 toolkit init 可补齐`,
    }
  }
  const list = shells.map((s) => `${s.file}（标记 ${mark(s)}）`).join("、")
  return {
    file: first.file,
    message: `入口壳标记与当前 toolkit 的 v${ENTRY_VERSION} 不一致，共 ${shells.length} 处：${list}；重跑 toolkit init 可一次性补齐`,
  }
}

// gitignore 覆盖告警：同样多落点合并为一条并内联路径（单壳时也写路径，保证与 status 文案逐字一致）
export function ignoredShellAlert(shells: EntryShell[]): EntryShellAlert | null {
  const [first] = shells
  if (!first) return null
  if (shells.length === 1) {
    return { file: first.file, message: `入口壳 ${first.file} 被 gitignore 覆盖：不会随 git 分发，请把该路径从忽略规则中排除` }
  }
  const list = shells.map((s) => s.file).join("、")
  return {
    file: first.file,
    message: `入口壳被 gitignore 覆盖，共 ${shells.length} 处：${list}；不会随 git 分发，请把相应路径从忽略规则中排除`,
  }
}

// 判是否为本包源仓库：源仓库靠 fxri-* 技能自举，不生成自己的入口壳
export function isToolkitSourceRepo(cwd: string): boolean {
  const pkg = join(cwd, "package.json")
  if (!existsSync(pkg)) return false
  try {
    const parsed: unknown = JSON.parse(readTextFile(pkg))
    return typeof parsed === "object" && parsed !== null && (parsed as { name?: unknown }).name === "@fxri/toolkit"
  } catch {
    return false
  }
}

// AGENTS.md 指针块：把入口壳位置写进仓库治理规则，使 agent 读 AGENTS.md 时即知道有规范入口
// 不写死具体落点：多 agent 混用团队各已存在候选目录各有一份，写死首个落点会误导只读其他目录的 agent
export function buildAgentsPointer(): string {
  return [
    AGENTS_POINTER_START,
    "## 项目协作规范",
    "",
    `本项目沉淀的协作规范以项目级技能目录下的 \`${ENTRY_SHELL_NAME}/${SKILL_ENTRY}\` 为入口（由 \`toolkit init\` 生成，多 agent 混用团队在各已存在的技能目录各有一份），条文以任务区 \`conventions/index.md\` 及各分册的单一事实源为准；需要查阅或遵循本项目规范时先读该入口。`,
    AGENTS_POINTER_END,
  ].join("\n")
}
