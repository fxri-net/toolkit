// 文档站标题与索引文案校验：页面 title/H1 一致，目录表链接文案等于目标页标题
// 只比对原文，不模拟站点渲染器的 slug 规则，跨站点可移植
import { existsSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { walkFiles } from "../fs-scope"
import { readTextFile } from "../read-text"
import { DEFAULT_DOCS_TITLES, effectiveLevel, type DocsTitlesConfig, type RuleSetting } from "./config"
import type { DocsProblem } from "./types"

// 规则版本：规则或识别口径变更时递增（与包版本无关）
export const TITLES_RULES_VERSION = "1.0.0"

// 校验结果：pageCount / tableCount 供人类输出汇总
export interface TitlesCheckResult {
  ok: boolean
  pageCount: number
  tableCount: number
  problems: DocsProblem[]
}

// 校验选项：配置与规则覆盖，缺省取规范默认
export interface TitlesCheckOptions {
  config?: DocsTitlesConfig
  rules?: Record<string, RuleSetting>
}

// 仓库根相对路径（posix），用于问题定位与豁免匹配
function displayPath(file: string): string {
  return relative(process.cwd(), file).replace(/\\/g, "/")
}

// 归一豁免值：去 ./ 前缀与首尾空白
function normalizePattern(value: string): string {
  return value.trim().replace(/^\.\//, "").replace(/\\/g, "/")
}

// 拆豁免值：文件或「文件#小节」
function splitPattern(pattern: string): { file: string; heading?: string } {
  const index = pattern.indexOf("#")
  if (index < 0) return { file: normalizePattern(pattern) }
  return { file: normalizePattern(pattern.slice(0, index)), heading: pattern.slice(index + 1).trim() }
}

// 页面 frontmatter 文本：不存在时返回空串
function frontmatter(text: string): string {
  return /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ""
}

// frontmatter 顶层文本值
function frontmatterValue(fm: string, key: string): string {
  const matched = new RegExp(`^${key}:[ \\t]*"?([^"\\n]+?)"?[ \\t]*$`, "m").exec(fm)
  return matched?.[1]?.trim() ?? ""
}

// 首个一级标题：跳过 frontmatter 与 fenced 代码块，剥掉行内 HTML 锚点
function firstH1(text: string): string {
  const lines = text.split("\n")
  let start = 0
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1)
    if (end > 0) start = end + 1
  }
  let fenced = false
  for (const line of lines.slice(start)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const matched = /^#\s+(.+?)\s*#*$/.exec(line)
    if (matched) return (matched[1] ?? "").replace(/<[^>]+>/g, "").trim()
  }
  return ""
}

// 页面标题：已声明 frontmatter title 取该值，否则取首个 H1
function pageTitle(file: string): string {
  const text = readTextFile(file).replace(/\r\n/g, "\n")
  const fm = frontmatter(text)
  return frontmatterValue(fm, "title") || firstH1(text)
}

// 单元格首列是否为单个站内页面链接：外链、纯锚点与非 .md 扩展名不参与
function pageLinkCell(cell: string): { label: string; href: string } | null {
  const matched = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(cell.trim())
  if (!matched) return null
  const href = matched[2] as string
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) return null
  const pathname = href.split("#")[0] as string
  const ext = /\.[a-z0-9]+$/i.exec(pathname)?.[0]?.toLowerCase()
  if (ext && ext !== ".md") return null
  return { label: matched[1] as string, href }
}

// 链接目标解析：原路径、补 .md、目录 index.md 三种写法
function resolveTarget(fromFile: string, href: string): string | null {
  const base = resolve(dirname(fromFile), decodeURIComponent(href.split("#")[0] as string))
  const candidates = [base, `${base}.md`, join(base, "index.md")]
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
}

// 表格单元格拆分：去首尾竖线与空白
function cellsOf(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim())
}

// 分隔行判据：全部单元格形如 --- / :--- / ---:
function isSeparator(line: string): boolean {
  const cells = cellsOf(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell))
}

// 目录表校验：同一表格 ≥2 行的首列为站内页面链接即视为目录表
function checkTables(
  file: string,
  names: string[],
  text: string,
  patterns: { file: string; heading?: string }[],
  rules: Record<string, RuleSetting>,
  problems: DocsProblem[],
): number {
  const display = displayPath(file)
  const lines = text.split("\n")
  let heading = ""
  let qualified = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string
    const headingMatched = /^##\s+(.+?)\s*#*$/.exec(line)
    if (headingMatched) {
      heading = (headingMatched[1] as string).trim()
      continue
    }
    if (!/^\s*\|/.test(line)) continue
    // 收集连续表格行
    const tableStart = index
    const block: string[] = []
    let cursor = index
    while (cursor < lines.length && /^\s*\|/.test(lines[cursor] as string)) {
      block.push(lines[cursor] as string)
      cursor += 1
    }
    index = cursor - 1
    if (block.length < 3 || !isSeparator(block[1] as string)) continue
    // 行号随数据行携带：告警直接指出目录表应改的那一行（1 基）
    const rows = block
      .slice(2)
      .map((row, offset) => {
        const link = pageLinkCell(cellsOf(row)[0] ?? "")
        return link ? { ...link, line: tableStart + 2 + offset + 1 } : null
      })
      .filter((row) => row !== null)
    if (rows.length < 2) continue
    // 整文件或整小节豁免：文件级跳过全部表格，小节级跳过该标题下的表格
    const sectionPatterns = patterns.filter((pattern) => names.includes(pattern.file))
    if (sectionPatterns.some((pattern) => pattern.heading === undefined)) continue
    if (sectionPatterns.some((pattern) => pattern.heading === heading)) continue
    qualified += 1
    for (const row of rows) {
      const target = resolveTarget(file, row.href)
      if (!target) {
        const level = effectiveLevel(rules, "title/index-target", "error")
        if (level) problems.push({ id: "title/index-target", level, file: display, message: `目录表第 ${row.line} 行链接「${row.href}」指向的文件不存在（改正路径或删除该行）` })
        continue
      }
      const title = pageTitle(target)
      if (row.label !== title) {
        const level = effectiveLevel(rules, "title/index-label", "error")
        if (level) {
          problems.push({
            id: "title/index-label",
            level,
            file: display,
            message: `目录表第 ${row.line} 行链接文案「${row.label}」≠ 目标页标题「${title}」（把该行文案改为「${title}」，或改 ${displayPath(target)} 的 title / 一级标题）`,
          })
        }
      }
    }
  }
  return qualified
}

// 主入口：扫描文档目录与额外文件，返回问题与统计
export function checkDocsTitles(docsDir: string, options: TitlesCheckOptions = {}): TitlesCheckResult {
  const config = options.config ?? DEFAULT_DOCS_TITLES
  const rules = options.rules ?? {}
  const problems: DocsProblem[] = []
  const patterns = config.exclude.map(splitPattern)

  if (!existsSync(docsDir)) return { ok: true, pageCount: 0, tableCount: 0, problems }

  const pages = walkFiles(docsDir, (name) => name.endsWith(".md"), { exclude: ["cache", "public", ".vitepress"] }).sort()
  const extras = config.extraFiles.map((file) => resolve(process.cwd(), file)).filter((file) => existsSync(file) && statSync(file).isFile())
  let tableCount = 0

  for (const file of [...pages, ...extras]) {
    const text = readTextFile(file).replace(/\r\n/g, "\n")
    const fm = frontmatter(text)
    const title = frontmatterValue(fm, "title")
    if (title) {
      const h1 = firstH1(text)
      if (!h1) {
        if (frontmatterValue(fm, "layout") !== "home") {
          const level = effectiveLevel(rules, "title/h1-missing", "error")
          if (level) problems.push({ id: "title/h1-missing", level, file: displayPath(file), message: `页面声明了 title 但缺少一级标题（在正文补「# ${title}」，或删除 frontmatter title 改由一级标题提供）` })
        }
      } else if (title !== h1) {
        const level = effectiveLevel(rules, "title/h1-mismatch", "error")
        if (level) problems.push({ id: "title/h1-mismatch", level, file: displayPath(file), message: `页面 title「${title}」与一级标题「${h1}」不一致（统一两处文案，或删除 frontmatter title 改由一级标题决定）` })
      }
    }
    tableCount += checkTables(file, [displayPath(file), relative(docsDir, file).replace(/\\/g, "/")], text, patterns, rules, problems)
  }

  return { ok: !problems.some((problem) => problem.level === "error"), pageCount: pages.length + extras.length, tableCount, problems }
}
