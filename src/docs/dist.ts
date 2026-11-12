// 文档站产物校验：404 页不进站点地图、不进站内搜索索引；只读构建产物，不改文件
import { existsSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { readTextFile } from "../read-text"
import { DEFAULT_DOCS_DIST, effectiveLevel, type DocsDistConfig, type RuleSetting } from "./config"
import type { DocsProblem, ProblemLevel } from "./types"

// 规则版本：规则或结构变更时递增（与包版本无关），供下游门禁比对与 --format json 输出
// 1.1.0：sitemap 缺失可降级、产物目录与搜索实现可配置
export const DIST_RULES_VERSION = "1.1.0"

export interface DistCheckResult {
  ok: boolean
  // 产物不存在时为 true：由调用方决定是提示漏跑构建还是静默跳过
  skipped: boolean
  problems: DocsProblem[]
}

// 报告路径：优先仓库根相对形态，越出当前目录时退回绝对路径（统一正斜杠）
function displayPath(abs: string): string {
  const rel = relative(process.cwd(), abs).split("\\").join("/")
  return rel === "" || rel.startsWith("..") ? abs.split("\\").join("/") : rel
}

// 读取 404 源页的一级标题：页面改名后断言跟随，不硬编码标题
function notFoundTitle(docsDir: string): string {
  const source = join(docsDir, "404.md")
  if (!existsSync(source)) return ""
  const matched = /^#\s+(.+)$/m.exec(readTextFile(source).replace(/\r\n/g, "\n"))
  return (matched?.[1] ?? "").trim()
}

// 校验构建产物：dist 不存在即跳过，其余断言全部基于真实产物
// config 未传时取规范默认值；rules 用于按规则 id 覆盖严重度或关闭
export function checkDocsDist(
  docsDir: string,
  options: { config?: Partial<DocsDistConfig>; rules?: Record<string, RuleSetting> } = {},
): DistCheckResult {
  const cfg: DocsDistConfig = { ...DEFAULT_DOCS_DIST, ...options.config }
  const rules = options.rules ?? {}
  const problems: DocsProblem[] = []
  const distDir = join(docsDir, cfg.dir)
  const add = (id: string, message: string, level: ProblemLevel = "error", file = displayPath(distDir)): void => {
    const effective = effectiveLevel(rules, id, level)
    if (effective) problems.push({ id, level: effective, file, message })
  }

  if (!existsSync(distDir)) return { ok: true, skipped: true, problems }

  const sitemapFile = join(distDir, "sitemap.xml")
  if (!existsSync(sitemapFile)) {
    // 站点可有意禁用 sitemap：配置为 off 时整条断言跳过，warn 时只提示
    if (cfg.sitemap !== "off") add("dist/sitemap-missing", "缺少 sitemap.xml 产物", cfg.sitemap, displayPath(sitemapFile))
  } else {
    // 兼容 cleanUrls 与默认 .html 两种写法：URL 可能是绝对地址、带前导斜杠或裸路径
    const hits = [...readTextFile(sitemapFile).matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((matched) => (matched[1] ?? "").replace(/^https?:\/\/[^/]+/, ""))
      .filter((url) => /(^|\/)404(\.html)?$/.test(url))
    if (hits.length > 0) add("dist/sitemap-404", `sitemap.xml 含 404 页：${hits.join("、")}`, "error", displayPath(sitemapFile))
  }

  // 站内搜索：仅本地搜索有可断言的索引分块，其他实现显式跳过
  if (cfg.searchProvider === "none") {
    return { ok: !problems.some((problem) => problem.level === "error"), skipped: false, problems }
  }
  const title = notFoundTitle(docsDir)
  if (!title) {
    add("dist/not-found-title", "docs/404.md 缺失或没有一级标题，无法断言搜索索引", "error", displayPath(join(docsDir, "404.md")))
  } else {
    const chunksDir = join(distDir, "assets", "chunks")
    const indexFiles = existsSync(chunksDir) ? readdirSync(chunksDir).filter((name) => name.includes("localSearchIndex")) : []
    if (indexFiles.length === 0) {
      // 未启用本地搜索时该断言不适用，只提示不阻断
      add("dist/search-index-missing", "未找到站内搜索索引分块，跳过 404 索引断言", "warn")
    } else {
      for (const name of indexFiles) {
        if (readTextFile(join(chunksDir, name)).includes(title)) {
          add("dist/search-404", `搜索索引 ${name} 含 404 页内容（${title}）`, "error", displayPath(join(chunksDir, name)))
        }
      }
    }
  }

  return { ok: !problems.some((problem) => problem.level === "error"), skipped: false, problems }
}
