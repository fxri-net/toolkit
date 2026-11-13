// 文档站导航校验：以 docs/site-nav.json 为唯一数据来源，先按随包 schema 校验结构，再判定导航与命名规则
// 数据契约替代源码解析：检查器不读 config.mts，也不随 VitePress 版本变化
import { existsSync } from "node:fs"
import { join, relative } from "node:path"
import { walkFiles } from "../fs-scope"
import { readTextFile } from "../read-text"
import { skillsPackageDir } from "../skills"
import { DEFAULT_DOCS_NAV, effectiveLevel, type DocsNavConfig, type RuleSetting } from "./config"
import type { DocsProblem, ProblemLevel } from "./types"

// 规则版本：规则或结构变更时递增（与包版本无关），供下游门禁比对与 --format json 输出
// 1.1.0：支持顶栏二级分组，阈值改为可配置
// 1.2.0：schema 字段与 VitePress 官方 NavItem / SidebarItem 对齐，校验器增加关键字守卫
// 1.3.0：支持对象形态侧栏与 locales 多语言结构
// 1.4.0：新增配置接线断言（数据文件未被站点配置引用时报错）
// 1.4.1：侧栏分组允许 collapsed（VitePress 官方字段）
export const NAV_RULES_VERSION = "1.4.1"

// 校验结果：navCount / sidebarCount 供人类输出汇总，localeCount 标明语言包数量
export interface NavCheckResult {
  ok: boolean
  navCount: number
  sidebarCount: number
  localeCount: number
  problems: DocsProblem[]
}

// 导航数据文件：放在文档根，config.mts 以相对路径引用展开
export function siteNavFile(docsDir: string): string {
  return join(docsDir, "site-nav.json")
}

// schema 随包分发：编辑器据此补全，命令运行时按同一份定义校验结构
export function siteNavSchemaFile(): string {
  return join(skillsPackageDir(), "schemas", "site-nav.schema.json")
}

// JSON Schema 子集：只覆盖 site-nav.schema.json 用到的关键字，不为校验引入运行时依赖
type JsonSchema = Record<string, unknown>

// 解析本地 $ref（形如 #/$defs/navItem）：解析不到时返回空 schema，交由调用方按「无约束」处理
function refTarget(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const ref = schema.$ref
  if (typeof ref !== "string" || !ref.startsWith("#/")) return schema
  let node: unknown = root
  for (const key of ref.slice(2).split("/")) {
    if (typeof node !== "object" || node === null) return {}
    node = (node as Record<string, unknown>)[key]
  }
  return typeof node === "object" && node !== null ? (node as JsonSchema) : {}
}

// 声明类型与实际值是否相符
function typeOk(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value)
    case "array":
      return Array.isArray(value)
    case "string":
      return typeof value === "string"
    case "boolean":
      return typeof value === "boolean"
    case "number":
      return typeof value === "number"
    default:
      return true
  }
}

// 实际值的类型名：错误信息里用中文表述，便于直接定位
function describeType(value: unknown): string {
  if (Array.isArray(value)) return "数组"
  if (value === null) return "null"
  return typeof value === "object" ? "对象" : typeof value
}

// 是否为普通对象（非数组、非 null）
function isObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 校验器支持的关键字：schema 用了清单外的关键字直接报错，避免「扩了 schema 但检查器静默忽略」
const SUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "$defs",
  "$ref",
  "type",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "oneOf",
  "enum",
])

// 递归校验：oneOf 分支只声明 required，故对象校验不能只在 type === "object" 时触发
function validate(value: unknown, rawSchema: JsonSchema, root: JsonSchema, path: string, out: string[]): void {
  const schema = refTarget(rawSchema, root)
  // 关键字守卫先行：未支持的约束无法执行，必须报出来而不是当作通过
  const unsupported = Object.keys(schema).filter((key) => !SUPPORTED_KEYWORDS.has(key))
  if (unsupported.length > 0) {
    out.push(`schema 在 ${path} 使用了未支持的关键字 ${unsupported.join(" / ")}，检查器无法按该约束校验`)
    return
  }
  const type = typeof schema.type === "string" ? schema.type : ""
  if (type && !typeOk(value, type)) {
    out.push(`${path} 应为 ${type}，实际为 ${describeType(value)}`)
    return
  }
  if (type === "object" || (!type && isObject(value))) {
    const record = value as Record<string, unknown>
    for (const key of Array.isArray(schema.required) ? (schema.required as string[]) : []) {
      if (!(key in record)) out.push(`${path} 缺少必填字段 ${key}`)
    }
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
    // 未声明字段一律拒绝：键名拼错（如 linkk）会静默失效，最难排查
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in properties)) out.push(`${path} 含未知字段 ${key}`)
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in record) validate(record[key], child, root, `${path}.${key}`, out)
    }
  }
  if (type === "array" || (!type && Array.isArray(value))) {
    const items = value as unknown[]
    const minItems = typeof schema.minItems === "number" ? schema.minItems : 0
    const maxItems = typeof schema.maxItems === "number" ? schema.maxItems : Number.POSITIVE_INFINITY
    if (items.length < minItems) out.push(`${path} 至少 ${minItems} 项，实际 ${items.length} 项`)
    if (items.length > maxItems) out.push(`${path} 最多 ${maxItems} 项，实际 ${items.length} 项`)
    const itemSchema = schema.items as JsonSchema | undefined
    if (itemSchema) items.forEach((item, index) => validate(item, itemSchema, root, `${path}[${index}]`, out))
  }
  if (type === "string") {
    const text = value as string
    const minLength = typeof schema.minLength === "number" ? schema.minLength : 0
    if (text.length < minLength) out.push(`${path} 不能为空`)
  }
  if (Array.isArray(schema.enum) && !(schema.enum as unknown[]).includes(value)) {
    out.push(`${path} 取值须为 ${(schema.enum as unknown[]).map((item) => String(item)).join(" / ")} 之一`)
  }
  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf as JsonSchema[]
    const passed = branches.filter((branch) => {
      const messages: string[] = []
      validate(value, branch, root, path, messages)
      return messages.length === 0
    }).length
    if (passed !== 1) {
      // 各分支字段一致、差异只在 required：直接给出人话结论；分支无 required 时说明形态不符
      const options = branches.map((branch) => ((branch.required as string[] | undefined) ?? []).join(" + ")).filter(Boolean)
      out.push(options.length > 0 ? `${path} 须且只能提供 ${options.join(" 或 ")} 之一` : `${path} 的结构不符合任一允许形态`)
    }
  }
}

// 汉字计数：英文专有名词不含汉字，自然不计入
function hanCount(text: string): number {
  return [...text].filter((ch) => /[\u4e00-\u9fa5]/.test(ch)).length
}

// 报告路径：优先仓库根相对形态，越出当前目录时退回绝对路径（统一正斜杠）
function displayPath(abs: string): string {
  const rel = relative(process.cwd(), abs).split("\\").join("/")
  return rel === "" || rel.startsWith("..") ? abs.split("\\").join("/") : rel
}

// 分组名收集：一级项一律参与，更深层级只取带子项的节点（纯页面条目豁免长度限制）
function collectNavGroupNames(items: NavItemLike[], depth = 0, out: string[] = []): string[] {
  for (const item of items) {
    if (depth === 0 || item.items) out.push(item.text)
    if (item.items) collectNavGroupNames(item.items, depth + 1, out)
  }
  return out
}

// 站点配置候选文件名：VitePress 支持 .mts / .ts / .mjs / .js
const CONFIG_FILES = ["config.mts", "config.ts", "config.mts", "config.mjs", "config.js"]

// 数据接线检查：数据文件存在但站点配置没引用它时，改数据不会生效——这类假绿必须报出来
function addWiringProblem(add: (id: string, message: string, level: ProblemLevel, file: string) => void, docsDir: string): void {
  const dir = join(docsDir, ".vitepress")
  const found = [...new Set(CONFIG_FILES)].map((name) => join(dir, name)).find((file) => existsSync(file))
  if (!found) {
    add("nav/config-not-wired", "未找到 docs/.vitepress/config.*：无法确认站点配置引用了 site-nav.json", "error", displayPath(dir))
    return
  }
  if (!readTextFile(found).includes("site-nav.json")) {
    add("nav/config-not-wired", "站点配置未引用 site-nav.json，导航数据不会生效", "error", displayPath(found))
  }
}

// 导航项结构：下拉可再分级（如「参考 → 内核 / 数据」），故 items 与自身同构
interface NavItemLike {
  text: string
  link?: string
  items?: NavItemLike[]
}
interface SidebarGroupLike {
  text: string
}

// 侧栏既可为分组数组，也可为「路径前缀 → 分组数组」的对象形态
type SidebarLike = SidebarGroupLike[] | Record<string, SidebarGroupLike[]>

// 语言包条目：结构与站点根一致
interface LocaleEntry {
  nav: NavItemLike[]
  sidebar: SidebarLike
}

// 侧栏分组归一：对象形态按路径前缀展开，顺序沿用声明顺序
function sidebarGroups(sidebar: SidebarLike): SidebarGroupLike[] {
  return Array.isArray(sidebar) ? sidebar : Object.values(sidebar).flat()
}

// 校验文档站导航：文件缺失与结构不符直接返回，避免基于错误结构产出规则噪音
// config 未传时取规范默认值；rules 用于按规则 id 覆盖严重度或关闭
export function checkDocsNav(
  docsDir: string,
  options: { schemaFile?: string; config?: Partial<DocsNavConfig>; rules?: Record<string, RuleSetting> } = {},
): NavCheckResult {
  const cfg: DocsNavConfig = { ...DEFAULT_DOCS_NAV, ...options.config }
  const rules = options.rules ?? {}
  const problems: DocsProblem[] = []
  const navFile = siteNavFile(docsDir)
  const add = (id: string, message: string, level: ProblemLevel = "error", file = displayPath(navFile)): void => {
    // 配置可关闭规则或改级别；关闭时不产出问题，连 warn 也不留
    const effective = effectiveLevel(rules, id, level)
    if (effective) problems.push({ id, level: effective, file, message })
  }
  const failed = (): NavCheckResult => ({ ok: false, navCount: 0, sidebarCount: 0, localeCount: 0, problems })

  if (!existsSync(navFile)) {
    add(
      "nav/file-missing",
      "未找到 docs/site-nav.json：把 config.mts 的 nav / sidebar 数组原样搬入该文件，配置改为 import 后引用（本命令只读数据，不解析源码）",
    )
    return failed()
  }

  let data: unknown
  try {
    data = JSON.parse(readTextFile(navFile)) as unknown
  } catch (e) {
    add("nav/schema-invalid", `site-nav.json 解析失败：${(e as Error).message}`)
    return failed()
  }

  const structural: string[] = []
  let schema: JsonSchema
  try {
    schema = JSON.parse(readTextFile(options.schemaFile ?? siteNavSchemaFile())) as JsonSchema
  } catch (e) {
    add("nav/schema-invalid", `导航 schema 读取失败：${(e as Error).message}`)
    return failed()
  }
  validate(data, schema, schema, "site-nav", structural)
  if (structural.length > 0) {
    for (const message of structural) add("nav/schema-invalid", message)
    return failed()
  }

  // 数据接线：site-nav.json 存在但站点配置未引用时，数据等于没生效
  addWiringProblem(add, docsDir)

  // 站点数据两种形态：单语言（nav + sidebar）或语言包（locales.<键> 各自一套）
  const root = data as { nav?: NavItemLike[]; sidebar?: SidebarLike; locales?: Record<string, LocaleEntry> }
  const multiLocale = root.locales !== undefined
  const locales: Array<{ key: string; nav: NavItemLike[]; sidebar: SidebarLike }> = multiLocale
    ? Object.entries(root.locales ?? {}).map(([key, entry]) => ({ key, nav: entry.nav, sidebar: entry.sidebar }))
    : [{ key: "root", nav: root.nav ?? [], sidebar: root.sidebar ?? [] }]

  for (const locale of locales) {
    // 语言包形态才标出语言键，单语言站的提示保持原样
    const tag = multiLocale ? `[${locale.key}] ` : ""
    const { nav } = locale
    if (nav.length > cfg.maxItems) add("nav/max-items", `${tag}顶栏一级项 ${nav.length} 个，超过 ${cfg.maxItems} 个`)

    // 语言相关规则需要该语言的期望文案：root 用默认口径，其余语言包须显式声明
    const expect =
      locale.key === "root"
        ? { firstItem: cfg.firstItem, lastItem: cfg.lastItem, helpChildren: cfg.helpChildren }
        : cfg.locales[locale.key]
    if (!expect?.firstItem || !expect.lastItem || !expect.helpChildren) {
      add("nav/locale-unconfigured", `${tag}该语言包未在 .toolkitrc 的 docs.locales 中声明首末项与帮助项，跳过语言相关规则`, "warn")
    } else {
      if (nav[0]?.text !== expect.firstItem) {
        add("nav/first-item", `${tag}顶栏首项应为「${expect.firstItem}」，实际「${nav[0]?.text ?? "无"}」`)
      }
      const last = nav[nav.length - 1]
      if (last?.text !== expect.lastItem) {
        add("nav/last-item", `${tag}顶栏末项应为「${expect.lastItem}」，实际「${last?.text ?? "无"}」`)
      }
      // 帮助下拉必须承载常见问题与更新日志，避免二者各占一级入口
      if (last?.text === expect.lastItem && !Array.isArray(last.items)) {
        add("nav/help-children", `${tag}顶栏「${expect.lastItem}」须为下拉，含${expect.helpChildren.join("、")}`)
      } else if (last?.text === expect.lastItem) {
        const children = new Set((last.items ?? []).map((item) => item.text))
        for (const required of expect.helpChildren) {
          if (!children.has(required)) add("nav/help-children", `${tag}「${expect.lastItem}」下拉缺少「${required}」`)
        }
      }
    }

    for (const name of [...collectNavGroupNames(nav), ...sidebarGroups(locale.sidebar).map((group) => group.text)]) {
      if (hanCount(name) > cfg.maxGroupHan) add("nav/group-name-length", `${tag}分组名「${name}」超过 ${cfg.maxGroupHan} 个汉字`)
    }
  }

  // 404 页须退出站内搜索：产物断言只验结果，frontmatter 缺失时结果仍可能侥幸通过
  const notFound = join(docsDir, "404.md")
  if (!existsSync(notFound)) {
    add("nav/not-found-page", "缺少 docs/404.md 兜底页", "error", displayPath(notFound))
  } else {
    const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readTextFile(notFound))
    if (!head || !/(^|\n)\s*search:\s*false\s*($|\n)/.test(head[1] ?? "")) {
      add("nav/not-found-page", "docs/404.md 的 frontmatter 缺少 search: false，404 页会进入站内搜索索引", "error", displayPath(notFound))
    }
  }

  // 页面体量只告警：拆分判据涉及读者与主题，机器不宜阻断
  // 遍历范围走共用判据（跳过依赖、产物与 gitignore 目录），站点自有的 cache / public 一并排除
  for (const page of walkFiles(docsDir, (name) => name.endsWith(".md"), { exclude: ["cache", "public"] })) {
    if (cfg.pageSizeExclude.includes(page.split(/[\\/]/).pop() ?? "")) continue
    const lines = readTextFile(page).replace(/\r\n/g, "\n").split("\n").length
    if (lines > cfg.maxPageLines) add("nav/page-size", `页面超过 ${cfg.maxPageLines} 行（${lines} 行），考虑拆分`, "warn", displayPath(page))
  }

  return {
    ok: !problems.some((problem) => problem.level === "error"),
    navCount: locales[0]?.nav.length ?? 0,
    sidebarCount: locales.reduce((sum, locale) => sum + sidebarGroups(locale.sidebar).length, 0),
    localeCount: locales.length,
    problems,
  }
}
