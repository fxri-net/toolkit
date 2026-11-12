// 文档站导航校验：以 docs/site-nav.json 为唯一数据来源，先按随包 schema 校验结构，再判定导航与命名规则
// 数据契约替代源码解析：检查器不读 config.mts，也不随 VitePress 版本变化
import { existsSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { readTextFile } from "../read-text"
import { skillsPackageDir } from "../skills"
import type { DocsProblem } from "./types"

// 规则版本：规则集变更时递增（与包版本无关），供下游门禁比对与 --format json 输出
export const NAV_RULES_VERSION = "1.0.0"

// 顶栏一级项上限：超过即失去一眼扫完的导航
const MAX_NAV_ITEMS = 5
// 分组名汉字上限；英文专有名词（CLI / API）不计入
const MAX_GROUP_HAN = 4
// 单页体量告警阈值：只提示不阻断
const MAX_PAGE_LINES = 300
// 生成镜像页不参与体量告警：长度由发版流程决定，拆分无意义
const PAGE_SIZE_EXCLUDED = new Set(["changelog.md"])
// 帮助下拉的必备项
const HELP_REQUIRED = ["常见问题", "更新日志"]

// 校验结果：navCount / sidebarCount 供人类输出汇总
export interface NavCheckResult {
  ok: boolean
  navCount: number
  sidebarCount: number
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

// 递归校验：oneOf 分支只声明 required，故对象校验不能只在 type === "object" 时触发
function validate(value: unknown, rawSchema: JsonSchema, root: JsonSchema, path: string, out: string[]): void {
  const schema = refTarget(rawSchema, root)
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
  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf as JsonSchema[]
    const passed = branches.filter((branch) => {
      const messages: string[] = []
      validate(value, branch, root, path, messages)
      return messages.length === 0
    }).length
    if (passed !== 1) {
      // 各分支字段一致、差异只在 required：直接给出人话结论
      const options = branches.map((branch) => ((branch.required as string[] | undefined) ?? []).join(" + ")).filter(Boolean)
      out.push(`${path} 须且只能提供 ${options.join(" 或 ")} 之一`)
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

// 递归收集文档页，跳过构建产物与依赖目录
function collectPages(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "cache" || entry.name === "dist" || entry.name === "public") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectPages(full, found)
    else if (entry.name.endsWith(".md")) found.push(full)
  }
  return found
}

// 顶点结构：只取校验需要的字段，实际类型由 schema 保证
interface NavItemLike {
  text: string
  link?: string
  items?: Array<{ text: string; link: string }>
}
interface SidebarGroupLike {
  text: string
}

// 校验文档站导航：文件缺失与结构不符直接返回，避免基于错误结构产出规则噪音
export function checkDocsNav(docsDir: string, options: { schemaFile?: string } = {}): NavCheckResult {
  const problems: DocsProblem[] = []
  const navFile = siteNavFile(docsDir)
  const add = (id: string, message: string, level: "error" | "warn" = "error", file = displayPath(navFile)): void => {
    problems.push({ id, level, file, message })
  }
  const failed = (): NavCheckResult => ({ ok: false, navCount: 0, sidebarCount: 0, problems })

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

  const nav = (data as { nav: NavItemLike[] }).nav
  const sidebar = (data as { sidebar: SidebarGroupLike[] }).sidebar

  if (nav.length > MAX_NAV_ITEMS) add("nav/max-items", `顶栏一级项 ${nav.length} 个，超过 ${MAX_NAV_ITEMS} 个`)
  if (nav[0]?.text !== "快速开始") add("nav/first-item", `顶栏首项应为「快速开始」，实际「${nav[0]?.text ?? "无"}」`)
  const last = nav[nav.length - 1]
  if (last?.text !== "帮助") add("nav/last-item", `顶栏末项应为「帮助」，实际「${last?.text ?? "无"}」`)

  // 帮助下拉必须承载常见问题与更新日志，避免二者各占一级入口
  if (last?.text === "帮助" && !Array.isArray(last.items)) {
    add("nav/help-children", "顶栏「帮助」须为下拉，含常见问题与更新日志")
  } else if (last?.text === "帮助") {
    const children = new Set((last.items ?? []).map((item) => item.text))
    for (const required of HELP_REQUIRED) {
      if (!children.has(required)) add("nav/help-children", `帮助下拉缺少「${required}」`)
    }
  }

  for (const name of [...nav.map((item) => item.text), ...sidebar.map((group) => group.text)]) {
    if (hanCount(name) > MAX_GROUP_HAN) add("nav/group-name-length", `分组名「${name}」超过 ${MAX_GROUP_HAN} 个汉字`)
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
  for (const page of collectPages(docsDir)) {
    if (PAGE_SIZE_EXCLUDED.has(page.split(/[\\/]/).pop() ?? "")) continue
    const lines = readTextFile(page).replace(/\r\n/g, "\n").split("\n").length
    if (lines > MAX_PAGE_LINES) add("nav/page-size", `页面超过 ${MAX_PAGE_LINES} 行（${lines} 行），考虑拆分`, "warn", displayPath(page))
  }

  return {
    ok: !problems.some((problem) => problem.level === "error"),
    navCount: nav.length,
    sidebarCount: sidebar.length,
    problems,
  }
}
