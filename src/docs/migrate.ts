// 导航数据迁移：把站点配置里的 nav / sidebar 字面量抽成 docs/site-nav.json
// 只用于一次性迁移，运行期检查器不解析源码；解析失败即报错，不做半截写入
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { siteNavFile } from "./nav"

// 迁移结果：写入路径与条目数，供调用方如实汇报
export interface MigrateResult {
  file: string
  navCount: number
  sidebarCount: number
}

// 词法单元：只需区分字符串、数字、标点与字面词
interface Token {
  kind: "string" | "number" | "punct" | "word"
  value: string
  pos: number
}

// 扫描器：按需读取单个 token，解析到字面量结束即停，不碰后面的配置代码
class Scanner {
  private index: number
  private peeked: Token | null = null

  constructor(private readonly source: string, from: number) {
    this.index = from
  }

  // 读取下一个 token：跳过空白与注释，遇到文件末尾返回 null
  next(): Token | null {
    if (this.peeked) {
      const token = this.peeked
      this.peeked = null
      return token
    }
    return this.read()
  }

  // 预读一个 token 而不消费，用于区分空数组与元素
  peek(): Token | null {
    if (!this.peeked) this.peeked = this.read()
    return this.peeked
  }

  private read(): Token | null {
    const source = this.source
    while (this.index < source.length) {
      const char = source[this.index] as string
      if (/\s/.test(char)) {
        this.index += 1
        continue
      }
      if (char === "/" && source[this.index + 1] === "/") {
        while (this.index < source.length && source[this.index] !== "\n") this.index += 1
        continue
      }
      if (char === "/" && source[this.index + 1] === "*") {
        const end = source.indexOf("*/", this.index + 2)
        this.index = end < 0 ? source.length : end + 2
        continue
      }
      return this.readToken(char)
    }
    return null
  }

  // 读取单 token：字符串、标点或字面词
  private readToken(char: string): Token {
    const source = this.source
    const start = this.index
    if (char === "'" || char === '"' || char === "`") {
      this.index += 1
      let text = ""
      while (this.index < source.length && source[this.index] !== char) {
        if (source[this.index] === "\\") {
          text += source[this.index + 1] ?? ""
          this.index += 2
          continue
        }
        // 模板字符串插值无法静态求值，直接拒绝而不是猜
        if (char === "`" && source[this.index] === "$" && source[this.index + 1] === "{") {
          throw new Error(`不支持模板字符串插值（位置 ${this.index}），请手工迁移`)
        }
        text += source[this.index]
        this.index += 1
      }
      if (this.index >= source.length) throw new Error(`字符串未闭合（位置 ${start}）`)
      this.index += 1
      return { kind: "string", value: text, pos: start }
    }
    if ("[]{},:".includes(char)) {
      this.index += 1
      return { kind: "punct", value: char, pos: start }
    }
    const word = /^(?:-?\d+(?:\.\d+)?|[A-Za-z_$][\w$]*)/.exec(source.slice(this.index))
    if (!word) throw new Error(`不支持的字符「${char}」（位置 ${this.index}），请手工迁移`)
    const text = word[0] as string
    this.index += text.length
    return { kind: /^-?\d/.test(text) ? "number" : "word", value: text, pos: start }
  }
}

// 期望下一个 token 为指定标点，否则报错
function expectToken(scanner: Scanner, value: string): void {
  const token = scanner.next()
  if (!token || token.value !== value) throw new Error(`期望「${value}」，实际「${token?.value ?? "文件末尾"}」`)
}

// 解析单个字面量：只接受字符串、数字、布尔、数组与对象
function parseValue(scanner: Scanner): unknown {
  const token = scanner.next()
  if (!token) throw new Error("配置表达式未结束")
  if (token.value === "[") return parseArrayAfter(scanner)
  if (token.value === "{") return parseObjectAfter(scanner)
  if (token.kind === "string") return token.value
  if (token.kind === "number") return Number(token.value)
  if (token.kind === "word" && (token.value === "true" || token.value === "false")) return token.value === "true"
  // 变量引用、函数调用、展开语法等动态写法无法静态迁移，交人工处理
  throw new Error(`不支持的写法「${token.value}」（位置 ${token.pos}），请手工迁移`)
}

// 已消费开括号的数组解析：与 parseArray 共用循环，避免重复读取
function parseArrayAfter(scanner: Scanner): unknown[] {
  const out: unknown[] = []
  for (;;) {
    const token = scanner.peek()
    if (!token) throw new Error("数组未闭合")
    if (token.value === "]") {
      scanner.next()
      return out
    }
    if (token.value === ",") {
      scanner.next()
      continue
    }
    out.push(parseValue(scanner))
  }
}

// 已消费开括号的对象解析
function parseObjectAfter(scanner: Scanner): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (;;) {
    const token = scanner.peek()
    if (!token) throw new Error("对象未闭合")
    if (token.value === "}") {
      scanner.next()
      return out
    }
    if (token.value === ",") {
      scanner.next()
      continue
    }
    if (token.kind !== "string" && token.kind !== "word") throw new Error(`对象键不合法（位置 ${token.pos}）`)
    scanner.next()
    expectToken(scanner, ":")
    out[token.value] = parseValue(scanner)
  }
}

// 定位字段的字面量起点：键名后第一个 [ 或 {
function locate(source: string, key: string): number {
  const matched = new RegExp(`(^|[\\s,{])${key}\\s*:\\s*(?=[[{])`).exec(source)
  if (!matched) throw new Error(`站点配置中未找到 ${key} 字段（需写成 ${key}: [...] 或 ${key}: {...}）`)
  return (matched.index ?? 0) + matched[0].length
}

// 统计侧栏分组数：数组按元素计，对象形态按各路径下分组总数计
function countSidebar(sidebar: unknown): number {
  if (Array.isArray(sidebar)) return sidebar.length
  if (typeof sidebar === "object" && sidebar !== null) {
    return Object.values(sidebar as Record<string, unknown[]>).reduce((sum, groups) => sum + (Array.isArray(groups) ? groups.length : 0), 0)
  }
  return 0
}

// 执行迁移：解析配置里的 nav / sidebar 并写入 site-nav.json，已存在时须显式覆盖
export function migrateSiteNav(docsDir: string, options: { configFile?: string; force?: boolean } = {}): MigrateResult {
  const configFile = options.configFile ?? join(docsDir, ".vitepress", "config.mts")
  if (!existsSync(configFile)) throw new Error(`未找到站点配置：${configFile}`)
  const target = siteNavFile(docsDir)
  if (existsSync(target) && !options.force) throw new Error(`已存在 ${target}，确认覆盖请加 --force`)

  const source = readTextFile(configFile)
  // 多语言配置里第一个 nav 属于某个语言包，直接抽取会生成单语言数据，宁可拒绝交人工
  if (/(^|[\s,{])locales\s*:\s*\{/.test(source)) {
    throw new Error("检测到 locales 多语言配置，无法自动抽取，请手工迁移为 locales.<键> 结构")
  }
  const nav = parseValue(new Scanner(source, locate(source, "nav")))
  if (!Array.isArray(nav)) throw new Error("nav 字段不是数组，无法迁移")
  const sidebar = parseValue(new Scanner(source, locate(source, "sidebar")))

  writeFileAtomic(target, `${JSON.stringify({ nav, sidebar }, null, 2)}\n`)
  return { file: target, navCount: nav.length, sidebarCount: countSidebar(sidebar) }
}
