// 文档站统一主题：模板随包分发，--check 校验公共规则未漂移，--write 刷新模板并保留各站品牌段
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { readTextFile } from "../read-text"
import { writeFileAtomic } from "../write-atomic"
import { skillsPackageDir } from "../skills"

// 模板版本：公共规则变更时递增（视觉调整升次版本，标记格式或品牌段语义变更升主版本）
export const THEME_VERSION = "2.0"

const HEADER = `/* fxri-docs-theme: ${THEME_VERSION} */`
// 任一合法版本标记都可解析（兼容早期的整数式 v1）：升级时据此保留品牌段，再由 --check 判定版本是否落后
const HEADER_PATTERN = /^\/\* fxri-docs-theme: (?:v\d+|\d+\.\d+) \*\/$/
const BRAND_START = "/* fxri-docs-theme:brand-start */"
const BRAND_END = "/* fxri-docs-theme:brand-end */"

// 1.x 品牌令牌 → 2.0 的 --fx-* 命名：--write 保留品牌段时一并迁移，避免升级后站点配色静默失效
const LEGACY_BRAND_TOKENS: Record<string, string> = {
  "--site-accent": "--fx-accent",
  "--site-glow": "--fx-accent-soft",
  "--site-shadow": "--fx-shadow",
  "--site-hero-angle": "--fx-hero-angle",
}

// 只匹配声明名（后接冒号），避免误伤注释或取值里的同名字符串
function tokenPattern(token: string): RegExp {
  return new RegExp(`${token.replace(/[-]/g, "\\-")}(?=\\s*:)`, "g")
}

// 品牌段旧令牌改名：按映射逐个替换声明名，取值原样保留
function migrateBrandTokens(brand: string): string {
  let migrated = brand
  for (const [legacy, current] of Object.entries(LEGACY_BRAND_TOKENS)) {
    migrated = migrated.replace(tokenPattern(legacy), current)
  }
  return migrated
}

// 校验结果：problems 逐条说明缺什么、差在哪一行
export interface ThemeCheckResult {
  ok: boolean
  problems: string[]
}

// 写入结果：kept 为保留了既有品牌段的文件，便于调用方如实报告
export interface ThemeWriteResult {
  written: string[]
  kept: string[]
}

// 换行归一：Windows 检出（core.autocrlf）为 CRLF，逐字比对前须统一
function normalize(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
}

// 模板目录：默认取包内 templates/docs-theme，测试可注入
export function defaultThemeTemplateDir(): string {
  return join(skillsPackageDir(), "templates", "docs-theme")
}

// 拆解 custom.css：页头、品牌段、公共段；标记缺失或格式不合法返回 null
function splitTheme(css: string): { header: string; brand: string; common: string } | null {
  const lines = normalize(css).split("\n")
  if (!HEADER_PATTERN.test(lines[0] ?? "")) return null
  const start = lines.indexOf(BRAND_START)
  const end = lines.indexOf(BRAND_END)
  if (start === -1 || end === -1 || end < start) return null
  return {
    header: lines[0] as string,
    brand: lines.slice(start + 1, end).join("\n").trim(),
    common: lines
      .slice(end + 1)
      .join("\n")
      .replace(/^\n+/, "")
      .trimEnd(),
  }
}

// 定位两段文本的首个差异行号（从 1 开始），便于直接把修复位置指给使用者
function firstDiffLine(expected: string, actual: string): number {
  const left = expected.split("\n")
  const right = actual.split("\n")
  let line = 0
  while (line < Math.max(left.length, right.length) && left[line] === right[line]) line += 1
  return line + 1
}

// 校验主题目录：index.ts 全文一致，custom.css 页头与公共段一致；品牌段自由
export function checkDocsTheme(themeDir: string, templateDir = defaultThemeTemplateDir()): ThemeCheckResult {
  const problems: string[] = []
  const templateIndex = normalize(readTextFile(join(templateDir, "index.ts")))
  const templateCss = splitTheme(readTextFile(join(templateDir, "custom.css")))
  if (!templateCss) throw new Error(`主题模板缺少标记行：${join(templateDir, "custom.css")}`)

  const indexPath = join(themeDir, "index.ts")
  const cssPath = join(themeDir, "custom.css")
  if (!existsSync(indexPath)) problems.push(`缺少 index.ts（执行 toolkit docs theme --write 生成）：${indexPath}`)
  if (!existsSync(cssPath)) problems.push(`缺少 custom.css（执行 toolkit docs theme --write 生成）：${cssPath}`)

  if (existsSync(indexPath) && normalize(readTextFile(indexPath)) !== templateIndex) {
    problems.push("index.ts 与模板不一致（执行 toolkit docs theme --write 刷新）")
  }
  if (existsSync(cssPath)) {
    const site = splitTheme(readTextFile(cssPath))
    if (!site) {
      problems.push(`custom.css 缺少主题标记行（期望首行 ${HEADER}，并保留 brand-start / brand-end）`)
    } else if (site.header !== templateCss.header) {
      problems.push(`custom.css 版本标记落后（期望 ${HEADER}，实际 ${site.header}）；执行 toolkit docs theme --write 刷新公共段`)
    } else if (site.common !== templateCss.common) {
      const line = firstDiffLine(templateCss.common, site.common)
      problems.push(`custom.css 公共规则与模板不一致（第 ${line} 行）；本站差异请写在 brand-start 与 brand-end 之间`)
    }
    if (site) {
      const legacy = Object.keys(LEGACY_BRAND_TOKENS).filter((token) => tokenPattern(token).test(site.brand))
      if (legacy.length > 0) {
        const replacements = legacy.map((token) => `${token} → ${LEGACY_BRAND_TOKENS[token]}`).join("、")
        problems.push(`custom.css 品牌段仍使用 1.x 令牌（${replacements}）；执行 toolkit docs theme --write 迁移`)
      }
    }
  }
  return { ok: problems.length === 0, problems }
}

// 写入主题：已存在且含品牌段时保留品牌内容，只刷新页头与公共段
export function writeDocsTheme(
  themeDir: string,
  options: { force?: boolean; templateDir?: string } = {},
): ThemeWriteResult {
  const templateDir = options.templateDir ?? defaultThemeTemplateDir()
  const templateIndex = readTextFile(join(templateDir, "index.ts"))
  const templateCss = readTextFile(join(templateDir, "custom.css"))
  const parsed = splitTheme(templateCss)
  if (!parsed) throw new Error(`主题模板缺少标记行：${join(templateDir, "custom.css")}`)

  const written: string[] = []
  const kept: string[] = []
  mkdirSync(themeDir, { recursive: true })

  const indexPath = join(themeDir, "index.ts")
  writeFileAtomic(indexPath, templateIndex)
  written.push(indexPath)

  const cssPath = join(themeDir, "custom.css")
  let brand = parsed.brand
  if (existsSync(cssPath)) {
    const existing = splitTheme(readTextFile(cssPath))
    if (existing) {
      brand = migrateBrandTokens(existing.brand)
      kept.push(cssPath)
    } else if (!options.force) {
      throw new Error(`custom.css 缺少主题标记行，无法保留品牌段；确认覆盖请加 --force：${cssPath}`)
    }
  }
  writeFileAtomic(cssPath, `${parsed.header}\n${BRAND_START}\n${brand}\n${BRAND_END}\n${parsed.common}\n`)
  written.push(cssPath)
  return { written, kept }
}
