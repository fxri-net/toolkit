// 技能版本递增：只改 SKILL.md 的 frontmatter metadata.version 与正文首部「本技能版本」两处
// 支持多根目录；写回前用目标内容跑一遍 lint（内存校验，不落盘），任一失败即整体中止
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { lintSkills } from "./lint"
import { realPath } from "./source/paths"
import {
  bumpVersion,
  readBodyVersionFromContent,
  readFrontmatterVersionFromContent,
  type BumpType,
} from "./versioning"

export interface BumpOptions {
  // 技能真源根目录（可多个，monorepo 多根）
  skillsDirs: string[]
  names?: string[]
  all?: boolean
  type?: BumpType
  // 直接设定版本，与 type 互斥
  set?: string
  // 两处版本不一致时的取值源头；缺省直接报错，不静默猜测
  from?: "frontmatter" | "body"
  dryRun?: boolean
}

export interface BumpResult {
  name: string
  from: string
  to: string
  file: string
}

const SKILL_ENTRY = "SKILL.md"

// 单个技能条目：名称、所属根与入口文件
interface SkillEntry {
  name: string
  root: string
  file: string
  content: string
}

// 改写 frontmatter 版本行：保持引号与缩进，替换值本身
function writeFrontmatterVersion(content: string, next: string): string | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!frontmatter) return null
  const block = frontmatter[1] ?? ""
  const line = /^([ \t]+version:[ \t]*")([^"\r\n]*)(")/m
  if (!line.test(block)) return null
  const nextBlock = block.replace(line, (_all, head: string, _old: string, tail: string) => `${head}${next}${tail}`)
  const openLength = /^---\r?\n/.exec(content)?.[0].length ?? 4
  const start = openLength
  const end = start + block.length
  return content.slice(0, start) + nextBlock + content.slice(end)
}

// 改写正文首部版本声明
function writeBodyVersion(content: string, next: string): string {
  return content.replace(/^(> 本技能版本 )([^\s（(]+)/m, (_all, head: string) => `${head}${next}`)
}

// 收集多根下的技能：同名技能会互相覆盖产物，直接拒绝
function collectSkills(dirs: string[]): Map<string, SkillEntry> {
  const out = new Map<string, SkillEntry>()
  for (const dir of dirs) {
    if (!existsSync(dir)) throw new Error(`未找到技能目录：${dir}`)
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, SKILL_ENTRY)))
      .map((entry) => entry.name)
      .sort()
    if (names.length === 0) throw new Error(`技能目录下没有可递增的技能：${dir}`)
    for (const name of names) {
      const seen = out.get(name)
      if (seen) throw new Error(`技能名重复：${name}（${seen.root} / ${dir}）`)
      const file = join(dir, name, SKILL_ENTRY)
      out.set(name, { name, root: dir, file, content: readTextFile(file) })
    }
  }
  return out
}

// 递增技能版本：逐项校验、可选预演；任一失败即抛错，不写半截
export function bumpSkillVersions(options: BumpOptions): BumpResult[] {
  // 技能根按真实路径归一：与 lint 的 target.dir 同口径，避免链接别名（macOS /var、Windows 短名）导致覆盖键失配
  const dirs = [...new Set(options.skillsDirs.map((dir) => realPath(dir)))]
  if (dirs.length === 0) throw new Error("未指定技能目录")
  const available = collectSkills(dirs)
  if (!options.all && (!options.names || options.names.length === 0)) throw new Error("请指定技能名，或使用 --all 批量递增")
  if (options.all && options.names && options.names.length > 0) throw new Error("--all 与显式技能名不能同时使用")
  const targets = (options.all ? [...available.keys()] : options.names!).slice().sort()
  const missing = targets.filter((name) => !available.has(name))
  if (missing.length > 0) throw new Error(`未找到技能：${missing.join("、")}`)

  const results: BumpResult[] = []
  // 先全部计算并校验，再统一写盘：避免中途失败留下部分已改文件
  const pending: Array<{ entry: SkillEntry; content: string }> = []
  for (const name of targets) {
    const entry = available.get(name)!
    const frontmatter = readFrontmatterVersionFromContent(entry.content)
    const body = readBodyVersionFromContent(entry.content)
    if (!frontmatter) throw new Error(`技能 ${name} 的 frontmatter 未声明 metadata.version，无法递增`)
    if (!body) throw new Error(`技能 ${name} 的正文缺少「本技能版本」声明，请先补齐两处版本声明或运行 toolkit skill lint`)
    if (frontmatter !== body && options.from === undefined) {
      throw new Error(
        `技能 ${name} 的两处版本不一致（frontmatter ${frontmatter} / 正文 ${body}）；请先运行 toolkit skill lint，或用 --from frontmatter|body 指定源头`,
      )
    }
    const source = options.from === "body" ? body : frontmatter
    const to = options.set ? options.set.trim() : bumpVersion(source, options.type ?? "patch")
    if (!to) throw new Error(`技能 ${name} 的当前版本不合法：${source}`)
    const withFrontmatter = writeFrontmatterVersion(entry.content, to)
    if (withFrontmatter === null) throw new Error(`技能 ${name} 未能定位 frontmatter 的 version 行`)
    pending.push({ entry, content: writeBodyVersion(withFrontmatter, to) })
    results.push({ name, from: source, to, file: entry.file })
  }

  // 写回前按待写内容跑 lint：错误即中止，保证落盘结果能通过同一套规范
  const contents = new Map(pending.map((item) => [item.entry.file, item.content]))
  const report = lintSkills({ dirs, skills: targets, contents })
  const errors = report.issues.filter((issue) => issue.level === "error")
  if (errors.length > 0) {
    const details = errors.map((issue) => `- ${issue.file}${issue.line === undefined ? "" : `:${issue.line}`} [${issue.code}] ${issue.message}`)
    throw new Error(`递增后校验未通过，未写入任何文件：\n${details.join("\n")}`)
  }

  if (!options.dryRun) for (const item of pending) writeFileAtomic(item.entry.file, item.content)
  return results
}
