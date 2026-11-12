// 文档站校验配置：docs 段取自三层 .toolkitrc（全局 / 项目 / 本地），不配置即规范默认值
// 默认值即规范主张，站点配置属显式偏离；命令输出会列出被覆盖的规则，避免让人误以为规范变了
import { getConfigSection } from "../config"
import type { ProblemLevel } from "./types"

// 规则取值：off 关闭，error / warn 覆盖默认级别
export type RuleSetting = ProblemLevel | "off"

// sitemap 缺失时的处置：默认报错，站点有意禁用 sitemap 时可降为告警或跳过
export type SitemapPolicy = "error" | "warn" | "off"

// 导航默认口径：与规范条款一一对应
export interface DocsNavConfig {
  dir: string
  maxItems: number
  maxGroupHan: number
  firstItem: string
  lastItem: string
  helpChildren: string[]
  maxPageLines: number
  pageSizeExclude: string[]
}

// 产物校验默认口径：dir 相对文档目录
export interface DocsDistConfig {
  dir: string
  sitemap: SitemapPolicy
  searchProvider: "local" | "none"
}

// 整体配置：rules 按规则 id 覆盖严重度，两个命令共用
export interface DocsCheckConfig {
  nav: DocsNavConfig
  dist: DocsDistConfig
  rules: Record<string, RuleSetting>
}

// 默认值：现有 6 站的零配置行为
export const DEFAULT_DOCS_NAV: Readonly<DocsNavConfig> = {
  dir: "docs",
  maxItems: 5,
  maxGroupHan: 4,
  firstItem: "快速开始",
  lastItem: "帮助",
  helpChildren: ["常见问题", "更新日志"],
  maxPageLines: 300,
  pageSizeExclude: ["changelog.md"],
}

export const DEFAULT_DOCS_DIST: Readonly<DocsDistConfig> = {
  dir: ".vitepress/dist",
  sitemap: "error",
  searchProvider: "local",
}

// 判是否普通对象：配置段与字段对象都按此口径
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 取字符串：类型不符或空串按未写处理
function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback
}

// 取正整数：非正整数按未写处理
function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback
}

// 取非空字符串数组：任一项非字符串即整项回落，避免半截配置生效
function textList(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value) || value.length === 0) return [...fallback]
  if (!value.every((item) => typeof item === "string" && item.trim() !== "")) return [...fallback]
  return value as string[]
}

// 解析导航配置：逐字段取配置值，缺省落默认
function resolveNav(section: Record<string, unknown>): DocsNavConfig {
  return {
    dir: text(section.dir, DEFAULT_DOCS_NAV.dir),
    maxItems: positiveInt(section.maxItems, DEFAULT_DOCS_NAV.maxItems),
    maxGroupHan: positiveInt(section.maxGroupHan, DEFAULT_DOCS_NAV.maxGroupHan),
    firstItem: text(section.firstItem, DEFAULT_DOCS_NAV.firstItem),
    lastItem: text(section.lastItem, DEFAULT_DOCS_NAV.lastItem),
    helpChildren: textList(section.helpChildren, DEFAULT_DOCS_NAV.helpChildren),
    maxPageLines: positiveInt(section.maxPageLines, DEFAULT_DOCS_NAV.maxPageLines),
    pageSizeExclude: textList(section.pageSizeExclude, DEFAULT_DOCS_NAV.pageSizeExclude),
  }
}

// 解析产物配置：枚举取值非法即回落默认
function resolveDist(section: Record<string, unknown>): DocsDistConfig {
  const sitemap = section.sitemap
  const provider = section.searchProvider
  return {
    dir: text(section.dir, DEFAULT_DOCS_DIST.dir),
    sitemap: sitemap === "warn" || sitemap === "off" ? sitemap : DEFAULT_DOCS_DIST.sitemap,
    searchProvider: provider === "none" ? "none" : DEFAULT_DOCS_DIST.searchProvider,
  }
}

// 解析规则覆盖表：只接受 error / warn / off，其余取值忽略
function resolveRules(value: unknown): Record<string, RuleSetting> {
  if (!isObject(value)) return {}
  const rules: Record<string, RuleSetting> = {}
  for (const [id, setting] of Object.entries(value)) {
    if (setting === "error" || setting === "warn" || setting === "off") rules[id] = setting
  }
  return rules
}

// 读取生效配置：未配置 docs 段时全部落默认值
export function resolveDocsCheckConfig(): DocsCheckConfig {
  const docs = getConfigSection("docs")
  const nav = isObject(docs?.nav) ? docs.nav : {}
  const dist = isObject(docs?.dist) ? docs.dist : {}
  return { nav: resolveNav(nav), dist: resolveDist(dist), rules: resolveRules(docs?.rules) }
}

// 规则生效级别：off 返回 null 表示不产出问题；未覆盖时用调用方声明的默认级别
export function effectiveLevel(rules: Record<string, RuleSetting>, id: string, fallback: ProblemLevel): ProblemLevel | null {
  const setting = rules[id]
  if (setting === "off") return null
  return setting === "error" || setting === "warn" ? setting : fallback
}

// 被覆盖的规则清单：供人类输出提示「哪些规则偏离默认」
export function overriddenRules(rules: Record<string, RuleSetting>): string[] {
  return Object.keys(rules).sort()
}
