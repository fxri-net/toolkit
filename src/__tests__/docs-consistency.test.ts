// 文档一致性：代码内的能力清单/结构须与 docs 列举严格一致，防文档漂移
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import { createMarkdownRenderer } from "vitepress"
import { listBuiltinRuleNames } from "../privacy/redact"
import { DESCRIPTION } from "../about"
import { buildPage } from "../../scripts/sync-changelog-doc.mjs"

// 提取文档「内置规则：」行的规则名（名称以反引号包裹，括号内为补充说明）
function docRuleNames(file: string): string[] {
  const line = readFileSync(join(process.cwd(), file), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("内置规则："))
  expect(line, `${file} 缺少「内置规则：」清单行`).toBeTruthy()
  return [...(line as string).matchAll(/`([^`]+)`/g)].map((m) => m[1] as string)
}

describe("文档一致性：脱敏内置规则清单", () => {
  it("docs/config.md 列举的规则集合与代码内置规则一致", () => {
    expect(docRuleNames("docs/config.md").sort()).toEqual([...listBuiltinRuleNames()].sort())
  })

  it("docs/guide.md 列举的规则集合与代码内置规则一致", () => {
    expect(docRuleNames("docs/guide.md").sort()).toEqual([...listBuiltinRuleNames()].sort())
  })
})

// 读取文档并归一换行：Windows 检出（core.autocrlf）会把文本文件转为 CRLF，直接逐字节比对会误判为未同步
function readDoc(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
}

// 站点更新日志镜像页的期望内容：直接调用镜像脚本的转换函数，不在测试内复刻同一份逻辑
// （复刻会让脚本缺陷被同样的错误实现掩盖，CRLF 误报即由此漏过）
describe("文档一致性：更新日志镜像", () => {
  it("docs/changelog.md 与根 CHANGELOG.md 同步（漏跑同步脚本或手改镜像页即失败）", () => {
    expect(readDoc("docs/changelog.md")).toBe(buildPage(readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8")))
  })
})

// 递归收集目录下的 md 文件，返回以仓库根为基准的 posix 路径（锚点比对需要稳定的键）
function collectMarkdown(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) collectMarkdown(rel, found)
    else if (entry.name.endsWith(".md")) found.push(rel)
  }
  return found
}

describe("文档一致性：站内链接锚点可解析", () => {
  it("README / docs / skills 里的 #锚点都能在目标页标题中找到（标题改名或锚点写错即失败）", async () => {
    const docsDir = join(process.cwd(), "docs")
    // 用 VitePress 自身的 markdown 渲染器产锚点：与站点实际 slugify 规则同源，不复刻规则
    const md = await createMarkdownRenderer(docsDir)
    // 受检范围：仓库根 md（README 等入口页指向 docs 的外链锚点）、docs 全量、skills 全量
    const files = [
      ...readdirSync(process.cwd()).filter((f) => f.endsWith(".md")),
      ...collectMarkdown("docs", []),
      ...collectMarkdown("skills", []),
    ]
    const anchorsOf = new Map<string, Set<string>>()
    const htmlOf = new Map<string, string>()
    for (const file of files) {
      const html = md.render(readFileSync(join(process.cwd(), file), "utf8"))
      htmlOf.set(file, html)
      anchorsOf.set(file, new Set([...html.matchAll(/<h[1-6][^>]*\sid="([^"]*)"/g)].map((m) => m[1] as string)))
    }
    const problems: string[] = []
    for (const file of files) {
      for (const matched of (htmlOf.get(file) as string).matchAll(/href="([^"]*#[^"]*)"/g)) {
        // markdown-it 会把链接里的非 ASCII 百分号编码，先还原再比对
        let href = ""
        try {
          href = decodeURIComponent(matched[1] as string)
        } catch {
          continue
        }
        // 跳过外链（含协议或协议相对）与非 md 资源
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) continue
        const [rawTarget, anchor] = href.split("#")
        if (!anchor) continue
        // 渲染器把站内 .md 链接改写为 .html，判定前归一回 .md
        const target = (rawTarget as string).split("?")[0] as string
        const pageTarget = target.replace(/\.html$/i, ".md")
        if (pageTarget !== "" && /\.[a-z0-9]+$/i.test(pageTarget) && !pageTarget.endsWith(".md")) continue
        // 链接按所在文件目录做相对解析（README 写 ./docs/x.md、docs 内写 ./x.md、skills 子目录同理）
        const page =
          pageTarget === "" ? file : normalize(join(dirname(file), pageTarget)).replace(/\\/g, "/")
        const anchors = anchorsOf.get(page)
        // 目标页不在受检范围（站外站点页面等）时不判定
        if (!anchors) continue
        if (!anchors.has(anchor)) problems.push(`${file}：链接「${href}」的锚点在 ${page} 中不存在`)
      }
    }
    expect(problems).toEqual([])
  })
})

// 根描述多处以手写形式出现，易随改动漂移：源码侧统一引用 src/about.ts 的 DESCRIPTION，
// 无法 import 的触达面（package.json / README / 首页 tagline）在此锁死，改一处漏改其余即失败
describe("文档一致性：根描述文案单一真源", () => {
  // 首页 tagline 在前半句后自行展开，故只锁各触达面共用的主句前缀（从 DESCRIPTION 取「：」之前）
  const sharedPrefix = DESCRIPTION.split("：")[0] as string

  it("package.json 的 description 与 DESCRIPTION 字面一致", () => {
    const pkg = JSON.parse(readDoc("package.json")) as { description?: string }
    expect(pkg.description).toBe(DESCRIPTION)
  })

  it("README 首段描述与 DESCRIPTION 一致（剔除加粗标记后比对）", () => {
    // README 用加粗强调描述中的协作定位，比对前去掉 ** 标记，其余须与真源逐字一致
    const lines = readDoc("README.md")
      .split("\n")
      .map((l) => l.replace(/\*\*/g, ""))
    expect(lines).toContain(DESCRIPTION)
  })

  it("docs/index.md 的 tagline 以 DESCRIPTION 主句开头", () => {
    const tagline = /^ {2}tagline: (.*)$/m.exec(readDoc("docs/index.md"))?.[1]
    expect(tagline?.startsWith(sharedPrefix)).toBe(true)
  })
})
