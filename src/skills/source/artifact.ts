// 技能真源与现场（artifact）：自 source.ts 按职责拆分，逻辑逐字未改
import { cpSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { writeFileAtomic } from "../../write-atomic"
import { SKILL_ENTRY, type ArtifactMode } from "../types"
import { pathKey, sameDirContent, stripTailSep } from "./paths"


export type ExistingKind = "absent" | "link-ok" | "wrong" | "dangling" | "dir" | "file"

// 条目判型所需的最小结构：Dirent（readdirSync withFileTypes）与 Stats（lstatSync）均满足
export interface EntryType {
  isSymbolicLink(): boolean
  isDirectory(): boolean
}

// entry：调用方已列出的目录条目，省略则此处现查一次（查不到即视为不存在）
// altSource：可接受的另一指向——升级迁移期链接可能指向稳定锚点或真源，两种都算正常
export function classifyExisting(dest: string, source: string, entry?: EntryType, altSource = ""): ExistingKind {
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
    // 悬空优先判定：链接指向已不存在的位置时，无论指向何处都算悬空
    if (!existsSync(absTarget)) return "dangling"
    const targetKey = pathKey(absTarget)
    if (targetKey !== pathKey(source) && !(altSource && targetKey === pathKey(altSource))) {
      // 路径不同不等于内容不同：链接锚在别的安装时路径天然不相等，只要内容与真源逐字一致即视为正常
      const sameAsSource = sameDirContent(source, absTarget)
      const sameAsAlt = altSource !== "" && sameDirContent(altSource, absTarget)
      if (!sameAsSource && !sameAsAlt) return "wrong"
    }
    return "link-ok"
  }
  return dirent.isDirectory() ? "dir" : "file"
}


export function removeArtifact(dest: string): void {
  rmSync(dest, { recursive: true, force: true })
}

// 以副本形式写入（调用前需确保 dest 不存在，否则会复制到 dest 内部）
export function copyArtifact(source: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(source, dest, { recursive: true })
}

// 写入产物：默认软链（Windows 用 junction，免管理员、免开发者模式）；链接失败降级副本并回传原因
// linkTarget 为软链指向（稳定锚点），copySource 为副本内容来源（真源）——pnpm 布局下二者不是同一路径
export function writeArtifact(linkTarget: string, copySource: string, dest: string, forceCopy: boolean): { mode: ArtifactMode; reason?: string } {
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

// 薄壳标记与版本：供版本分流（落后重写 / 同版跳过 / 超前不降级）与安全识别
const SKILL_SHELL_MARKER = "toolkit-skill-shell"
const SKILL_SHELL_VERSION = 1
const SKILL_SHELL_MARKER_RE = new RegExp(`<!--\\s*${SKILL_SHELL_MARKER}:\\s*v(\\d+)\\s*-->`)

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

// 薄壳内容版本：供安装时判断标记是否超前（不降级覆盖）
export function currentSkillShellVersion(): number {
  return SKILL_SHELL_VERSION
}

// 内容闸门入口壳标记：与项目面薄壳标记分开，status / 自愈据此区分两种产物
const SKILL_GATE_MARKER = "toolkit-skill-gate"

// 读取内容闸门入口壳标记：非闸门壳返回 false
export function isSkillGateShell(content: string): boolean {
  return content.includes(`<!-- ${SKILL_GATE_MARKER} -->`)
}

// 内容闸门入口壳：frontmatter 保留 name / description 保证可被发现，正文只指向 guard 命令
// 不携带技能版本：版本一律从包内真源读取，避免升级后误报「已装版本缺失」
export function buildSkillGateShell(name: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description || `技能 ${name} 的入口壳。`}`,
    "---",
    "",
    `<!-- ${SKILL_GATE_MARKER} -->`,
    "<!-- 由 toolkit 生成的内容闸门入口壳；需要全文时运行 toolkit skills install --embed -->",
    `本技能已开启内容闸门：先运行 \`toolkit scope guard ${name}\` 获取正文；未激活即停止，不要凭猜测执行流程。`,
    "",
  ].join("\n")
}

// 写入内容闸门入口壳：目录只含 SKILL.md，不带 references / assets，避免正文流程在未激活目录可读
export function writeGateArtifact(dir: string, content: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileAtomic(join(dir, SKILL_ENTRY), content)
}

// 目录条目列表：供自愈与状态判定复用
