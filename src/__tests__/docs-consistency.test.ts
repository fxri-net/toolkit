// 文档一致性：代码内的能力清单/结构须与 docs 列举严格一致，防文档漂移
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createMarkdownRenderer } from "vitepress"
import { listBuiltinRuleNames } from "../privacy/redact"
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

describe("文档一致性：docs 内链锚点可解析", () => {
  it("docs/*.md 里的 #锚点都能在目标页标题中找到（标题改名后旧链接即失败）", async () => {
    const docsDir = join(process.cwd(), "docs")
    // 用 VitePress 自身的 markdown 渲染器产锚点：与站点实际 slugify 规则同源，不复刻规则
    const md = await createMarkdownRenderer(docsDir)
    const files = readdirSync(docsDir).filter((f) => f.endsWith(".md"))
    const anchorsOf = new Map<string, Set<string>>()
    const htmlOf = new Map<string, string>()
    for (const file of files) {
      const html = md.render(readFileSync(join(docsDir, file), "utf8"))
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
        const [target, anchor] = href.split("#")
        if (target !== "" && /\.[a-z0-9]+$/i.test(target) && !target.endsWith(".md")) continue
        const page = `${(target === "" ? file : target).replace(/^\.?\//, "").replace(/\.md$/, "")}.md`
        const anchors = anchorsOf.get(page)
        // 目标页不在 docs/ 根层（站外或子目录）时不判定
        if (!anchors || !anchor) continue
        if (!anchors.has(anchor)) problems.push(`${file}：链接「${href}」的锚点在 ${page} 中不存在`)
      }
    }
    expect(problems).toEqual([])
  })
})
