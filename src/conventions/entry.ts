// 技能入口壳：把项目级技能目录当作规范载体的「一阶触发面」，让用户不主动发问也能被 agent 读到
// 落点取项目级技能目录（随 git 提交、团队共享），与 src/skills.ts 的全局软链分发是两套互不干扰的面
import { existsSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { readTextFile } from "../read-text"
import { ENTRY_MARKER, readEntryVersion } from "./format"

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

// 入口壳现场：file 为仓库根相对路径，version 取自壳内标记（null 表无标记）
export interface EntryShell {
  dir: string
  file: string
  version: number | null
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
export function findEntryShells(cwd: string): EntryShell[] {
  const shells: EntryShell[] = []
  for (const rel of PROJECT_SKILL_DIRS) {
    const dir = join(cwd, rel, ENTRY_SHELL_NAME)
    const file = join(dir, SKILL_ENTRY)
    if (!existsSync(file)) continue
    shells.push({ dir, file, version: readEntryVersion(readTextFile(file)) })
  }
  return shells
}

// 判路径是否被 git 忽略：git check-ignore 退出码 0 真 / 1 假 / 128 非仓库或出错，仅 0 视为被忽略
export function isGitIgnored(cwd: string, rel: string): boolean {
  const res = spawnSync("git", ["check-ignore", "-q", "--", rel], { cwd, stdio: "ignore" })
  return res.status === 0
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
export function buildAgentsPointer(skillDir = FALLBACK_SKILL_DIR): string {
  return [
    AGENTS_POINTER_START,
    "## 项目协作规范",
    "",
    `本项目沉淀的协作规范以技能 \`${skillDir}/${ENTRY_SHELL_NAME}/${SKILL_ENTRY}\` 为入口，条文以任务区 \`conventions/index.md\` 及各分册的单一事实源为准；需要查阅或遵循本项目规范时先读该入口。`,
    AGENTS_POINTER_END,
  ].join("\n")
}
