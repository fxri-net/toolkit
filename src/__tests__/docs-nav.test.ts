// 文档站导航校验：数据契约优先，每条规则至少一正一反
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkDocsNav } from "../docs/nav"

// 临时文档目录：每个用例独立，避免互相污染
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fxri-docs-nav-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// 合法最小站点：顶栏两项、侧栏一组、404 带 search: false
const MINIMAL = {
  nav: [
    { text: "快速开始", link: "/start" },
    {
      text: "帮助",
      items: [
        { text: "常见问题", link: "/faq" },
        { text: "更新日志", link: "/changelog" },
      ],
    },
  ],
  sidebar: [{ text: "开始", items: [{ text: "首页", link: "/" }] }],
}

// 写入站点数据与 404 页
function writeSite(nav: unknown, notFound = "---\nsearch: false\n---\n\n# 页面未找到\n"): void {
  writeFileSync(join(dir, "site-nav.json"), JSON.stringify(nav, null, 2))
  writeFileSync(join(dir, "404.md"), notFound)
}

// 取问题 id 集合，断言不必依赖文案详略
function ids(): string[] {
  return checkDocsNav(dir).problems.map((problem) => problem.id)
}

describe("checkDocsNav", () => {
  it("合法数据通过，返回顶栏与侧栏计数", () => {
    writeSite(MINIMAL)
    const result = checkDocsNav(dir)
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
    expect(result.navCount).toBe(2)
    expect(result.sidebarCount).toBe(1)
  })

  it("缺少 site-nav.json 时提示迁移，不静默回退源码解析", () => {
    expect(checkDocsNav(dir).ok).toBe(false)
    expect(checkDocsNav(dir).problems[0]?.id).toBe("nav/file-missing")
    expect(checkDocsNav(dir).problems[0]?.message).toContain("site-nav.json")
  })

  it("顶栏超过 5 项时报错", () => {
    writeSite({
      ...MINIMAL,
      nav: [
        { text: "快速开始", link: "/start" },
        { text: "指南", link: "/guide" },
        { text: "参考", link: "/api" },
        { text: "原理", link: "/design" },
        { text: "升级", link: "/upgrade" },
        { text: "帮助", items: [{ text: "常见问题", link: "/faq" }] },
      ],
    })
    expect(ids()).toContain("nav/max-items")
  })

  it("首项与末项不是快速开始 / 帮助时报错", () => {
    writeSite({
      ...MINIMAL,
      nav: [
        { text: "概览", link: "/" },
        { text: "关于", link: "/about" },
      ],
    })
    expect(ids()).toContain("nav/first-item")
    expect(ids()).toContain("nav/last-item")
  })

  it("帮助下拉缺少必备项时报错，帮助为直链时同样报错", () => {
    writeSite({
      ...MINIMAL,
      nav: [{ text: "快速开始", link: "/start" }, { text: "帮助", items: [{ text: "更新日志", link: "/changelog" }] }],
    })
    expect(ids()).toContain("nav/help-children")

    writeSite({ ...MINIMAL, nav: [{ text: "快速开始", link: "/start" }, { text: "帮助", link: "/faq" }] })
    expect(ids()).toContain("nav/help-children")
  })

  it("分组名超过 4 个汉字时报错，英文专有名词不计入", () => {
    writeSite({ ...MINIMAL, sidebar: [{ text: "快速开始指南", items: [{ text: "首页", link: "/" }] }] })
    expect(ids()).toContain("nav/group-name-length")

    writeSite({ ...MINIMAL, sidebar: [{ text: "CLI 与 API", items: [{ text: "首页", link: "/" }] }] })
    expect(ids()).not.toContain("nav/group-name-length")
  })

  it("结构不符 schema 时报出字段路径，并跳过后续规则", () => {
    writeSite({ nav: "字符串", sidebar: [] })
    const result = checkDocsNav(dir)
    expect(result.ok).toBe(false)
    expect(result.problems.every((problem) => problem.id === "nav/schema-invalid")).toBe(true)
    expect(result.problems.map((problem) => problem.message).join("\n")).toContain("site-nav.nav")

    // 键名拼错要当场拒绝，否则该条目会静默失效
    writeSite({ ...MINIMAL, nav: [{ text: "快速开始", linkk: "/start" }] })
    expect(checkDocsNav(dir).problems.map((problem) => problem.message).join("\n")).toContain("未知字段 linkk")
  })

  it("404 页缺失或缺 search: false 时报错", () => {
    writeSite(MINIMAL)
    rmSync(join(dir, "404.md"))
    expect(ids()).toContain("nav/not-found-page")

    writeSite(MINIMAL, "---\ntitle: 页面未找到\n---\n\n# 页面未找到\n")
    expect(ids()).toContain("nav/not-found-page")
  })

  it("顶栏下拉支持二级分组，分组名同样受字数限制", () => {
    writeSite({
      ...MINIMAL,
      nav: [
        { text: "快速开始", link: "/start" },
        {
          text: "参考",
          items: [
            { text: "内核", items: [{ text: "装配", link: "/kernel" }] },
            { text: "数据", items: [{ text: "参数", link: "/param" }] },
          ],
        },
        { text: "帮助", items: [{ text: "常见问题", link: "/faq" }, { text: "更新日志", link: "/changelog" }] },
      ],
    })
    expect(checkDocsNav(dir).ok).toBe(true)

    writeSite({
      ...MINIMAL,
      nav: [
        { text: "快速开始", link: "/start" },
        { text: "参考", items: [{ text: "内核与装配", items: [{ text: "装配", link: "/kernel" }] }] },
        { text: "帮助", items: [{ text: "常见问题", link: "/faq" }, { text: "更新日志", link: "/changelog" }] },
      ],
    })
    expect(ids()).toContain("nav/group-name-length")
  })

  it("允许 VitePress 官方导航字段，不再判为未知字段", () => {
    writeSite({
      ...MINIMAL,
      nav: [
        { text: "快速开始", link: "/start", activeMatch: "/start", target: "_self", rel: "noopener", noIcon: true },
        { text: "帮助", items: [{ text: "常见问题", link: "/faq", target: "_blank" }, { text: "更新日志", link: "/changelog" }] },
      ],
      sidebar: [{ text: "开始", items: [{ text: "首页", link: "/", base: "/", docFooterText: "开始页", rel: "prev" }] }],
    })
    expect(checkDocsNav(dir).problems).toEqual([])
  })

  it("schema 使用未支持的关键字时报错，不静默忽略", () => {
    writeSite(MINIMAL)
    const schemaFile = join(dir, "schema.json")
    writeFileSync(
      schemaFile,
      JSON.stringify({
        type: "object",
        properties: { nav: { type: "array", items: { type: "object", pattern: "^x" } } },
      }),
    )
    const result = checkDocsNav(dir, { schemaFile })
    expect(result.ok).toBe(false)
    expect(result.problems.map((problem) => problem.message).join("\n")).toContain("未支持的关键字 pattern")
  })

  it("侧栏支持对象形态，各路径分组都参与命名校验", () => {
    writeSite({
      ...MINIMAL,
      sidebar: { "/": [{ text: "开始", items: [{ text: "首页", link: "/" }] }], "/guide/": [{ text: "指南", items: [{ text: "手册", link: "/guide/x" }] }] },
    })
    expect(checkDocsNav(dir).ok).toBe(true)

    writeSite({
      ...MINIMAL,
      sidebar: { "/": [{ text: "快速开始指南", items: [{ text: "首页", link: "/" }] }] },
    })
    expect(ids()).toContain("nav/group-name-length")
  })

  it("locales 形态：未声明的语言包只给 warn，不套中文口径", () => {
    const multi = {
      locales: {
        root: MINIMAL,
        en: {
          nav: [
            { text: "Getting Started", link: "/en/start" },
            { text: "Help", items: [{ text: "FAQ", link: "/en/faq" }, { text: "Changelog", link: "/en/changelog" }] },
          ],
          sidebar: [{ text: "Start", items: [{ text: "Home", link: "/en/" }] }],
        },
      },
    }
    writeSite(multi)
    const fallback = checkDocsNav(dir)
    expect(fallback.ok).toBe(true)
    expect(fallback.problems.map((problem) => problem.id)).toContain("nav/locale-unconfigured")
    expect(fallback.problems.map((problem) => problem.id)).not.toContain("nav/first-item")

    const configured = checkDocsNav(dir, {
      config: { locales: { en: { firstItem: "Getting Started", lastItem: "Help", helpChildren: ["FAQ", "Changelog"] } } },
    })
    expect(configured.ok).toBe(true)
    expect(configured.problems.map((problem) => problem.id)).not.toContain("nav/locale-unconfigured")
  })

  it("单页超过 300 行只告警，不影响通过", () => {
    writeSite(MINIMAL)
    writeFileSync(join(dir, "long.md"), `${Array.from({ length: 301 }, (_, index) => `第 ${index} 行`).join("\n")}\n`)
    const result = checkDocsNav(dir)
    expect(result.ok).toBe(true)
    expect(result.problems.map((problem) => problem.id)).toContain("nav/page-size")
    expect(result.problems.every((problem) => problem.level === "warn")).toBe(true)
  })
})
