// 文档站更新页镜像：把根 CHANGELOG.md 剥离 H1 后拼固定页头，写入 docs/changelog.md
// 多主版本时按主版本分页：主页保留最新主版本，其余主版本归档到同名目录；单一主版本输出与整篇镜像逐字一致
// 生成逻辑集中在本文件，CLI、发版链路与校验共用同一份转换，避免各项目各写一套脚本
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { basename, dirname, extname, join } from "node:path"
import { getConfigSection } from "../config"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { DEFAULT_LANG } from "./languages"
import { line, style } from "../term-style"

// 镜像页默认页头文案：与既有项目页面保持一致，迁移时只变化来源说明中的命令名
const DEFAULT_TITLE = "更新日志"
const DEFAULT_OUTLINE = "[2, 2]"
const DEFAULT_NOTE = "> 完整变更历史以根 `CHANGELOG.md` 为准，本页由 `toolkit release mirror` 自动同步，请勿手改。"

// 归档页生成标记：同步只清理带该标记且本次不再生成的页，手写页永不删除
export const ARCHIVE_MARKER = "<!-- toolkit:changelog-archive -->"

// 分页开关：major 按主版本拆页（默认），none 退回整篇镜像
export type DocSplit = "major" | "none"
const DEFAULT_SPLIT: DocSplit = "major"

// 解析后的镜像参数：路径为相对 cwd 的书写形态，由调用方按进程工作目录使用
export interface DocOptions {
  source: string
  target: string
  title: string
  outline: string
  frontmatter: boolean
  note: string
  split: DocSplit
}

// CLI 侧显式值：undefined 表示未传，交由配置或默认值决定
export interface DocCliOptions {
  from?: string
  to?: string
  title?: string
  outline?: string
  frontmatter?: boolean
  lang?: string
}

// 单条校验问题：缺页 / 多页 / 内容差异
export interface DocCheckProblem {
  kind: "missing" | "extra" | "diff"
  file: string
  line?: number
  expected?: string
  actual?: string
}

// 镜像校验结果：problems 为全部差异，顶层字段指向首个差异页，便于快速定位
export interface DocCheckResult {
  ok: boolean
  page?: string
  line?: number
  expected?: string
  actual?: string
  problems: DocCheckProblem[]
}

// 归档页：主版本号与页面内容
export interface DocArchivePage {
  major: string
  content: string
}

// 分页产物：主页与全部归档页
export interface DocPages {
  home: string
  archives: DocArchivePage[]
}

// 同步结果：写入 / 清理 / 保留清单供 CLI 打印摘要
export interface DocSyncResult {
  changed: boolean
  content: string
  written: string[]
  removed: string[]
  kept: string[]
}

// 由根 CHANGELOG 原文构造整篇镜像页；纯字符串转换，幂等
export function buildDocPage(changelog: string, options: Partial<DocOptions> = {}): string {
  const body = stripSourceTitle(changelog)
  return `${pageHead(options, options.title ?? DEFAULT_TITLE, options.note ?? DEFAULT_NOTE)}${body}`
}

// 分页转换：只有单一主版本时直接复用整篇镜像，保证与既有页面逐字一致
export function buildDocPages(changelog: string, options: Partial<DocOptions> = {}): DocPages {
  if ((options.split ?? DEFAULT_SPLIT) === "none") return { home: buildDocPage(changelog, options), archives: [] }
  const body = stripSourceTitle(changelog)
  const { preamble, blocks } = parseBlocks(body)
  const majors = [...new Set(blocks.map((block) => block.major).filter((major): major is number => major !== null))]
  // 单一主版本（或无版本号标题）：不建归档页、不加历史入口，输出与整篇镜像逐字一致
  if (majors.length < 2) return { home: buildDocPage(changelog, options), archives: [] }

  const latest = Math.max(...majors)
  const older = majors.filter((major) => major !== latest).sort((a, b) => b - a)
  const target = options.target ?? join("docs", "changelog.md")
  const archiveDirName = basename(target, extname(target))
  const title = options.title ?? DEFAULT_TITLE
  const note = options.note ?? DEFAULT_NOTE

  // 主页：最新主版本与无法识别主版本的块保持在源文件中的相对顺序
  const homeBlocks = blocks
    .filter((block) => block.major === null || block.major === latest)
    .map((block) => block.text)
    .join("\n\n")
  const history = `历史版本：${older.map((major) => `[${major}.x](./${archiveDirName}/${major}.x)`).join(" · ")}`
  const homeBody = preamble === "" ? `${homeBlocks}\n` : `${preamble}\n\n${homeBlocks}\n`
  const home = `${pageHead(options, title, note)}${history}\n\n${homeBody}`

  // 归档页：返回链接相对归档目录指回主页，生成标记供同步安全清理
  const homeLink = `../${archiveDirName}`
  const archiveNote = `${note}返回[更新日志](${homeLink})。`
  const archives = older.map((major) => {
    const archiveBlocks = blocks
      .filter((block) => block.major === major)
      .map((block) => block.text)
      .join("\n\n")
    const head = pageHead(options, `${title} · ${major}.x`, archiveNote, false)
    return { major: String(major), content: `${head}${ARCHIVE_MARKER}\n\n${archiveBlocks}\n` }
  })
  return { home, archives }
}

// 生成并写入主页与归档页；内容未变化时不落盘，返回写入 / 清理 / 保留清单
export function syncDoc(options: DocOptions, run: { dryRun?: boolean } = {}): DocSyncResult {
  const pages = buildDocPages(readTextFile(options.source), options)
  const archiveDir = archiveDirOf(options.target)
  const plan: Array<{ file: string; content: string }> = [{ file: options.target, content: pages.home }]
  for (const archive of pages.archives) plan.push({ file: join(archiveDir, `${archive.major}.x.md`), content: archive.content })

  const written: string[] = []
  let changed = false
  for (const page of plan) {
    if (readPage(page.file) === page.content) continue
    changed = true
    written.push(page.file)
    if (run.dryRun) continue
    mkdirSync(dirname(page.file), { recursive: true })
    writeFileAtomic(page.file, page.content)
  }

  const { removed, kept } = cleanupArchives(archiveDir, new Set(plan.map((page) => page.file)), Boolean(run.dryRun))
  if (removed.length > 0) changed = true
  return { changed, content: pages.home, written, removed, kept }
}

// 只比对不写盘：逐页报告缺页 / 多页 / 内容差异，顶层字段取首个差异页
export function checkDoc(options: DocOptions): DocCheckResult {
  const pages = buildDocPages(readTextFile(options.source), options)
  const archiveDir = archiveDirOf(options.target)
  const expected: Array<{ file: string; content: string }> = [{ file: options.target, content: pages.home }]
  for (const archive of pages.archives) expected.push({ file: join(archiveDir, `${archive.major}.x.md`), content: archive.content })

  const problems: DocCheckProblem[] = []
  for (const page of expected) {
    const actual = readPage(page.file)
    if (actual === null) {
      problems.push({ kind: "missing", file: page.file })
      continue
    }
    if (actual === page.content) continue
    problems.push({ kind: "diff", file: page.file, ...firstDiff(page.content, actual) })
  }

  // 多页：目录下存在本次未生成的页面；带标记的会被同步清理，无标记的须人工确认
  if (existsSync(archiveDir)) {
    const expectedFiles = new Set(expected.map((page) => page.file))
    for (const entry of readdirSync(archiveDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue
      const file = join(archiveDir, entry.name)
      if (!expectedFiles.has(file)) problems.push({ kind: "extra", file })
    }
  }

  const first = problems[0]
  if (!first) return { ok: true, problems }
  return { ok: false, page: first.file, line: first.line, expected: first.expected, actual: first.actual, problems }
}

// 发版链路自动同步：根文件或目标目录不存在时只告警、不阻断发版
export function syncDocAfterVersion(lang: string = DEFAULT_LANG): void {
  const options = resolveDocOptions({ lang })
  if (!existsSync(options.source)) return
  if (!existsSync(dirname(options.target))) {
    console.warn(`⚠️ 未找到镜像目标目录「${dirname(options.target)}」，跳过 CHANGELOG 镜像同步`)
    return
  }
  try {
    const result = syncDoc(options)
    if (result.changed) console.log(line.ok(`CHANGELOG 镜像已更新：${style.accent(options.target)}`))
  } catch (e) {
    console.warn(`⚠️ CHANGELOG 镜像同步失败：${(e as Error).message}`)
  }
}

// 解析镜像参数：CLI 显式值 > changelogDoc 配置段 > 默认值；非法配置按默认处理并告警
export function resolveDocOptions(cli: DocCliOptions = {}): DocOptions {
  const section = getConfigSection("changelogDoc") ?? {}
  const suffix = cli.lang && cli.lang !== DEFAULT_LANG ? `.${cli.lang}` : ""
  return {
    source: pickString(cli.from, section.source, `CHANGELOG${suffix}.md`, "changelogDoc.source"),
    target: pickString(cli.to, section.target, `docs/changelog${suffix}.md`, "changelogDoc.target"),
    title: pickString(cli.title, section.title, DEFAULT_TITLE, "changelogDoc.title"),
    outline: pickString(cli.outline, section.outline, DEFAULT_OUTLINE, "changelogDoc.outline"),
    frontmatter: pickBoolean(cli.frontmatter, section.frontmatter, true, "changelogDoc.frontmatter"),
    note: pickString(undefined, section.note, DEFAULT_NOTE, "changelogDoc.note"),
    split: pickSplit(section.split),
  }
}

// 页头：frontmatter + H1 + 来源说明；frontmatter 关闭时按纯文本页输出
// search=false 只用于历史归档页：上千行历史版本不进站内搜索索引，避免索引分块超限
function pageHead(options: Partial<DocOptions>, title: string, note: string, search = true): string {
  const outline = options.outline ?? DEFAULT_OUTLINE
  const searchLine = search ? "" : "search: false\n"
  const header = options.frontmatter === false ? "" : `---\noutline: ${outline}\n${searchLine}---\n\n`
  return `${header}# ${title}\n\n${note}\n\n`
}

// 剥离源文件 H1 并校验至少一个版本块：结构异常时直接失败而非静默产出错页
function stripSourceTitle(changelog: string): string {
  // 先归一到 LF：Windows 检出（core.autocrlf）下源文件为 CRLF，不归一会让首行剥离与版本块校验双双失效
  const text = changelog.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  const titleLine = text.split("\n", 1)[0] ?? ""
  if (!/^#\s+\S/.test(titleLine)) {
    throw new Error(`CHANGELOG 首行不是 H1 标题，无法安全剥离：${JSON.stringify(titleLine)}`)
  }
  const body = text.replace(/^#\s+[^\n]*\n+/, "").trimEnd() + "\n"
  if (!/^##\s+\d+\.\d+\.\d+/m.test(body)) {
    throw new Error("CHANGELOG 未发现「## x.y.z」版本块，镜像已中止")
  }
  return body
}

// 版本块：主版本号（无数字首段时为 null）与原始块文本
interface ChangelogBlock {
  major: number | null
  text: string
}

// 按「## 」切分版本块：首个版本块之前的内容记为前言，留在主页
function parseBlocks(body: string): { preamble: string; blocks: ChangelogBlock[] } {
  const preamble: string[] = []
  const raw: Array<{ heading: string; lines: string[] }> = []
  let current: { heading: string; lines: string[] } | null = null
  for (const content of body.split("\n")) {
    const matched = /^##\s+(\S.*?)\s*$/.exec(content)
    if (matched) {
      current = { heading: matched[1] ?? "", lines: [content] }
      raw.push(current)
      continue
    }
    if (current) current.lines.push(content)
    else preamble.push(content)
  }
  return {
    preamble: preamble.join("\n").trim(),
    blocks: raw.map((block) => ({
      major: majorOf(block.heading),
      text: block.lines.join("\n").trimEnd(),
    })),
  }
}

// 主版本号：取标题首段数字（`2.0.0-rc.1` → 2）；无法识别返回 null，按未分组内容留在主页
function majorOf(heading: string): number | null {
  const matched = /^v?(\d+)\./.exec(heading)
  return matched ? Number(matched[1]) : null
}

// 归档目录：镜像目标去扩展名的同名目录（docs/changelog.md → docs/changelog，docs/changelog.en.md → docs/changelog.en）
function archiveDirOf(target: string): string {
  return join(dirname(target), basename(target, extname(target)))
}

// 读取页面并归一到 LF；不存在返回 null，供「缺页」与「内容差异」区分
function readPage(file: string): string | null {
  return existsSync(file) ? readTextFile(file).replace(/\r\n/g, "\n") : null
}

// 首个差异行：行号从 1 起，两侧内容便于对照
function firstDiff(expected: string, actual: string): { line: number; expected?: string; actual?: string } {
  const expectedLines = expected.split("\n")
  const actualLines = actual.split("\n")
  const total = Math.max(expectedLines.length, actualLines.length)
  for (let i = 0; i < total; i++) {
    if ((expectedLines[i] ?? "") === (actualLines[i] ?? "")) continue
    return { line: i + 1, expected: expectedLines[i] ?? "", actual: actualLines[i] ?? "" }
  }
  return { line: 1 }
}

// 清理归档目录：只删带生成标记且本次不再生成的页，无标记的手写页保留待人工确认
function cleanupArchives(dir: string, expected: Set<string>, dryRun: boolean): { removed: string[]; kept: string[] } {
  if (!existsSync(dir)) return { removed: [], kept: [] }
  const removed: string[] = []
  const kept: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    const file = join(dir, entry.name)
    if (expected.has(file)) continue
    if (!readTextFile(file).includes(ARCHIVE_MARKER)) {
      kept.push(file)
      continue
    }
    removed.push(file)
    if (!dryRun) rmSync(file, { force: true })
  }
  return { removed, kept }
}

// 分页开关取值：非枚举值告警后回落默认，不静默忽略
function pickSplit(value: unknown): DocSplit {
  if (value === undefined || value === null) return DEFAULT_SPLIT
  if (value === "major" || value === "none") return value
  console.warn(`⚠️ 忽略配置项「changelogDoc.split」：只支持 major / none，已按 ${DEFAULT_SPLIT} 处理`)
  return DEFAULT_SPLIT
}

// 字符串取值：CLI 显式值优先；配置值须为非空字符串，否则告警回落默认
function pickString(cliValue: string | undefined, configValue: unknown, fallback: string, key: string): string {
  if (cliValue !== undefined) {
    const trimmed = cliValue.trim()
    if (trimmed !== "") return trimmed
    console.warn(`⚠️ 忽略空取值的「${key}」，已按默认值处理`)
    return fallback
  }
  if (configValue === undefined || configValue === null) return fallback
  if (typeof configValue === "string" && configValue.trim() !== "") return configValue.trim()
  console.warn(`⚠️ 忽略配置项「${key}」：须为非空字符串，已按默认值处理`)
  return fallback
}

// 布尔取值：CLI 显式值优先；配置值须为布尔，否则告警回落默认
function pickBoolean(cliValue: boolean | undefined, configValue: unknown, fallback: boolean, key: string): boolean {
  if (cliValue !== undefined) return cliValue
  if (configValue === undefined || configValue === null) return fallback
  if (typeof configValue === "boolean") return configValue
  console.warn(`⚠️ 忽略配置项「${key}」：须为布尔值，已按默认值处理`)
  return fallback
}
