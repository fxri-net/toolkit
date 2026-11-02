// 文档站更新页镜像：把根 CHANGELOG.md 剥离 H1 后拼固定页头，写入 docs/changelog.md
// 生成逻辑集中在本文件，CLI、发版链路与校验共用同一份转换，避免各项目各写一套脚本
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { getConfigSection } from "../config"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { DEFAULT_LANG } from "./languages"

// 镜像页默认页头文案：与既有项目页面保持一致，迁移时只变化来源说明中的命令名
const DEFAULT_TITLE = "更新日志"
const DEFAULT_OUTLINE = "[2, 2]"
const DEFAULT_NOTE = "> 完整变更历史以根 `CHANGELOG.md` 为准，本页由 `toolkit changelog doc` 自动同步，请勿手改。"

// 解析后的镜像参数：路径为相对 cwd 的书写形态，由调用方按进程工作目录使用
export interface DocOptions {
  source: string
  target: string
  title: string
  outline: string
  frontmatter: boolean
  note: string
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

// 镜像校验结果：不一致时给出行号与两侧内容，便于定位
export interface DocCheckResult {
  ok: boolean
  line?: number
  expected?: string
  actual?: string
}

// 由根 CHANGELOG 原文构造镜像页内容；纯字符串转换，幂等
export function buildDocPage(changelog: string, options: Partial<DocOptions> = {}): string {
  // 先归一到 LF：Windows 检出（core.autocrlf）下源文件为 CRLF，不归一会让首行剥离与版本块校验双双失效
  const text = changelog.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  const titleLine = text.split("\n", 1)[0] ?? ""
  if (!/^#\s+\S/.test(titleLine)) {
    throw new Error(`CHANGELOG 首行不是 H1 标题，无法安全剥离：${JSON.stringify(titleLine)}`)
  }
  // 丢弃源文件 H1，保留首个版本块起的全部历史
  const body = text.replace(/^#\s+[^\n]*\n+/, "").trimEnd() + "\n"
  // 版本块存在性校验：至少含一个「## x.y.z」，否则说明结构异常，直接失败而非静默产出错页
  if (!/^##\s+\d+\.\d+\.\d+/m.test(body)) {
    throw new Error("CHANGELOG 未发现「## x.y.z」版本块，镜像已中止")
  }
  const title = options.title ?? DEFAULT_TITLE
  const outline = options.outline ?? DEFAULT_OUTLINE
  const note = options.note ?? DEFAULT_NOTE
  const header = options.frontmatter === false ? "" : `---\noutline: ${outline}\n---\n\n`
  return `${header}# ${title}\n\n${note}\n\n${body}`
}

// 生成并写入镜像页；内容未变化时不落盘，返回是否实际改动
export function syncDoc(options: DocOptions): { changed: boolean; content: string } {
  const content = buildDocPage(readTextFile(options.source), options)
  const current = existsSync(options.target) ? readTextFile(options.target).replace(/\r\n/g, "\n") : null
  if (current === content) return { changed: false, content }
  mkdirSync(dirname(options.target), { recursive: true })
  writeFileAtomic(options.target, content)
  return { changed: true, content }
}

// 只比对不写盘；不一致时返回首个差异行
export function checkDoc(options: DocOptions): DocCheckResult {
  const expected = buildDocPage(readTextFile(options.source), options)
  const actual = existsSync(options.target) ? readTextFile(options.target).replace(/\r\n/g, "\n") : ""
  if (actual === expected) return { ok: true }
  const expectedLines = expected.split("\n")
  const actualLines = actual.split("\n")
  const total = Math.max(expectedLines.length, actualLines.length)
  for (let i = 0; i < total; i++) {
    if ((expectedLines[i] ?? "") === (actualLines[i] ?? "")) continue
    return { ok: false, line: i + 1, expected: expectedLines[i] ?? "", actual: actualLines[i] ?? "" }
  }
  return { ok: false, line: 1 }
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
    if (result.changed) console.log(`CHANGELOG 镜像已更新：${options.target}`)
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
  }
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
