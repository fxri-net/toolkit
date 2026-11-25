// 文档站校验配置：docs 段取自三层 .toolkitrc（全局 / 项目 / 本地），不配置即规范默认值
// 默认值即规范主张，站点配置属显式偏离；命令输出会列出被覆盖的规则，避免让人误以为规范变了
import { getConfigSection } from "../config"
import type { ProblemLevel } from "./types"

// 规则取值：off 关闭，error / warn 覆盖默认级别
export type RuleSetting = ProblemLevel | "off"

// sitemap 缺失时的处置：默认报错，站点有意禁用 sitemap 时可降为告警或跳过
export type SitemapPolicy = "error" | "warn" | "off"

// 语言包期望：中文口径只适用于 root，其他语言包各自声明首末项与帮助项，未声明则跳过语言相关规则
export interface DocsLocaleExpect {
  firstItem?: string
  lastItem?: string
  helpChildren?: string[]
}

// 导航默认口径：与规范条款一一对应
export interface DocsNavConfig {
  dir: string
  maxItems: number
  // 分组名长度上限，按显示单位计（CJK 按字、空格分词语言按词）
  maxGroupUnits: number
  firstItem: string
  lastItem: string
  helpChildren: string[]
  maxPageLines: number
  pageSizeExclude: string[]
  locales: Record<string, DocsLocaleExpect>
}

// 产物校验默认口径：dir 相对文档目录
export interface DocsDistConfig {
  dir: string
  sitemap: SitemapPolicy
  searchProvider: "local" | "none"
}

// 标题与索引校验默认口径：默认只扫文档目录，额外文件与豁免为空
export interface DocsTitlesConfig {
  extraFiles: string[]
  exclude: string[]
}

// 整体配置：rules 按规则 id 覆盖严重度，各命令共用
export interface DocsCheckConfig {
  nav: DocsNavConfig
  dist: DocsDistConfig
  titles: DocsTitlesConfig
  rules: Record<string, RuleSetting>
}

// 默认值：现有 6 站的零配置行为
export const DEFAULT_DOCS_NAV: Readonly<DocsNavConfig> = {
  dir: "docs",
  maxItems: 5,
  maxGroupUnits: 4,
  firstItem: "快速开始",
  lastItem: "帮助",
  helpChildren: ["常见问题", "更新日志"],
  maxPageLines: 300,
  // 条目按文件名或相对文档目录的路径前缀匹配；changelog/ 覆盖按主版本分页的归档目录
  pageSizeExclude: ["changelog.md", "changelog/"],
  locales: {},
}

export const DEFAULT_DOCS_DIST: Readonly<DocsDistConfig> = {
  dir: ".vitepress/dist",
  sitemap: "error",
  searchProvider: "local",
}

export const DEFAULT_DOCS_TITLES: Readonly<DocsTitlesConfig> = {
  extraFiles: [],
  exclude: [],
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

// 解析语言包期望：只收显式写出且类型合法的字段，未写字段保持 undefined 供调用方判定
function resolveLocales(value: unknown): Record<string, DocsLocaleExpect> {
  if (!isObject(value)) return {}
  const out: Record<string, DocsLocaleExpect> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (!isObject(entry)) continue
    const expect: DocsLocaleExpect = {}
    if (typeof entry.firstItem === "string" && entry.firstItem.trim() !== "") expect.firstItem = entry.firstItem
    if (typeof entry.lastItem === "string" && entry.lastItem.trim() !== "") expect.lastItem = entry.lastItem
    if (Array.isArray(entry.helpChildren) && entry.helpChildren.length > 0 && entry.helpChildren.every((item) => typeof item === "string")) {
      expect.helpChildren = entry.helpChildren as string[]
    }
    if (Object.keys(expect).length > 0) out[key] = expect
  }
  return out
}

// 分组名上限：新键 maxGroupUnits 优先；旧键 maxGroupHan 保留读取，两者等价于显示单位数
function resolveGroupUnits(section: Record<string, unknown>): number {
  const legacy = positiveInt(section.maxGroupHan, DEFAULT_DOCS_NAV.maxGroupUnits)
  return positiveInt(section.maxGroupUnits, legacy)
}

// 解析导航配置：逐字段取配置值，缺省落默认
function resolveNav(section: Record<string, unknown>): DocsNavConfig {
  return {
    dir: text(section.dir, DEFAULT_DOCS_NAV.dir),
    maxItems: positiveInt(section.maxItems, DEFAULT_DOCS_NAV.maxItems),
    maxGroupUnits: resolveGroupUnits(section),
    firstItem: text(section.firstItem, DEFAULT_DOCS_NAV.firstItem),
    lastItem: text(section.lastItem, DEFAULT_DOCS_NAV.lastItem),
    helpChildren: textList(section.helpChildren, DEFAULT_DOCS_NAV.helpChildren),
    maxPageLines: positiveInt(section.maxPageLines, DEFAULT_DOCS_NAV.maxPageLines),
    pageSizeExclude: textList(section.pageSizeExclude, DEFAULT_DOCS_NAV.pageSizeExclude),
    locales: resolveLocales(section.locales),
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

// 解析标题校验配置：空数组合法，非字符串数组整项回落默认
function resolveTitles(section: Record<string, unknown>): DocsTitlesConfig {
  const list = (value: unknown, fallback: readonly string[]): string[] => {
    if (value === undefined) return [...fallback]
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim() !== "")) return [...fallback]
    return value as string[]
  }
  return {
    extraFiles: list(section.extraFiles, DEFAULT_DOCS_TITLES.extraFiles),
    exclude: list(section.exclude, DEFAULT_DOCS_TITLES.exclude),
  }
}

// 读取生效配置：未配置 docs 段时全部落默认值
export function resolveDocsCheckConfig(): DocsCheckConfig {
  const docs = getConfigSection("docs")
  const nav = isObject(docs?.nav) ? docs.nav : {}
  const dist = isObject(docs?.dist) ? docs.dist : {}
  const titles = isObject(docs?.titles) ? docs.titles : {}
  return { nav: resolveNav(nav), dist: resolveDist(dist), titles: resolveTitles(titles), rules: resolveRules(docs?.rules) }
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
