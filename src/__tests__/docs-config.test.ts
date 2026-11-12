// 文档站校验配置：三层 .toolkitrc 的 docs 段解析、默认值回落与规则覆盖
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { resolveDocsCheckConfig } from "../docs/config"
import { DEFAULT_DOCS_DIST, DEFAULT_DOCS_NAV } from "../docs/config"
import { checkDocsNav } from "../docs/nav"
import { checkDocsDist } from "../docs/dist"

const cwd = process.cwd()

// 每个用例独立临时 home 与项目目录，避免读到真实用户配置
let home = ""
let project = ""

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fxri-docs-cfg-home-"))
  setHomeDirForTest(home)
  project = mkdtempSync(join(tmpdir(), "fxri-docs-cfg-"))
  process.chdir(project)
})

afterEach(() => {
  process.chdir(cwd)
  resetToolkitConfigCache()
  setHomeDirForTest(undefined)
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
})

// 写项目层配置并清缓存，使下一次读取生效
function writeConfig(content: unknown): void {
  writeFileSync(join(project, ".toolkitrc.json"), JSON.stringify(content), "utf8")
  resetToolkitConfigCache()
}

// 建一个合法最小站点，供规则覆盖用例使用
function writeSite(navItems: unknown[]): string {
  const docsDir = join(project, "docs")
  mkdirSync(docsDir, { recursive: true })
  writeFileSync(
    join(docsDir, "site-nav.json"),
    JSON.stringify({
      nav: navItems,
      sidebar: [{ text: "开始", items: [{ text: "首页", link: "/" }] }],
    }),
    "utf8",
  )
  writeFileSync(join(docsDir, "404.md"), "---\nsearch: false\n---\n\n# 页面未找到\n", "utf8")
  mkdirSync(join(docsDir, ".vitepress"), { recursive: true })
  writeFileSync(join(docsDir, ".vitepress", "config.mts"), "import siteNav from '../site-nav.json'\nexport default { themeConfig: siteNav }\n", "utf8")
  return docsDir
}

// 两个必备项齐全的帮助项
const HELP = {
  text: "帮助",
  items: [
    { text: "常见问题", link: "/faq" },
    { text: "更新日志", link: "/changelog" },
  ],
}

describe("resolveDocsCheckConfig", () => {
  it("未配置 docs 段时全部落规范默认值", () => {
    const config = resolveDocsCheckConfig()
    expect(config.nav).toEqual(DEFAULT_DOCS_NAV)
    expect(config.dist).toEqual(DEFAULT_DOCS_DIST)
    expect(config.rules).toEqual({})
  })

  it("配置可覆盖阈值、文案与枚举，未写的字段仍取默认", () => {
    writeConfig({
      docs: {
        nav: { maxItems: 6, firstItem: "概览", helpChildren: ["FAQ", "Changelog"] },
        dist: { dir: "out", sitemap: "off", searchProvider: "none" },
        rules: { "nav/page-size": "off", "nav/max-items": "warn" },
      },
    })
    const config = resolveDocsCheckConfig()
    expect(config.nav.maxItems).toBe(6)
    expect(config.nav.firstItem).toBe("概览")
    expect(config.nav.helpChildren).toEqual(["FAQ", "Changelog"])
    expect(config.nav.lastItem).toBe(DEFAULT_DOCS_NAV.lastItem)
    expect(config.dist).toEqual({ dir: "out", sitemap: "off", searchProvider: "none" })
    expect(config.rules).toEqual({ "nav/page-size": "off", "nav/max-items": "warn" })
  })

  it("类型非法与非法枚举回落默认，不产生半截配置", () => {
    writeConfig({
      docs: {
        nav: { maxItems: "6", helpChildren: [1, 2], maxPageLines: -1, dir: "" },
        dist: { sitemap: "ignore", searchProvider: "algolia" },
        rules: { "nav/max-items": "fatal", "nav/page-size": "warn" },
      },
    })
    const config = resolveDocsCheckConfig()
    expect(config.nav.maxItems).toBe(DEFAULT_DOCS_NAV.maxItems)
    expect(config.nav.helpChildren).toEqual(DEFAULT_DOCS_NAV.helpChildren)
    expect(config.nav.maxPageLines).toBe(DEFAULT_DOCS_NAV.maxPageLines)
    expect(config.nav.dir).toBe(DEFAULT_DOCS_NAV.dir)
    expect(config.dist.sitemap).toBe(DEFAULT_DOCS_DIST.sitemap)
    expect(config.dist.searchProvider).toBe(DEFAULT_DOCS_DIST.searchProvider)
    expect(config.rules).toEqual({ "nav/page-size": "warn" })
  })
})

describe("配置对校验行为的实际影响", () => {
  it("放宽顶栏上限后 6 项可通过；关闭规则后 7 项也不报", () => {
    const navItems = [
      { text: "快速开始", link: "/start" },
      { text: "指南", link: "/guide" },
      { text: "参考", link: "/api" },
      { text: "原理", link: "/design" },
      { text: "开发", link: "/build" },
      { text: "升级", link: "/upgrade" },
      HELP,
    ]
    const docsDir = writeSite(navItems)
    expect(checkDocsNav(docsDir).problems.map((problem) => problem.id)).toContain("nav/max-items")
    expect(checkDocsNav(docsDir, { config: { maxItems: 7 } }).ok).toBe(true)
    expect(checkDocsNav(docsDir, { rules: { "nav/max-items": "off" } }).ok).toBe(true)
  })

  it("规则可降级为 warn：不阻断但保留提示", () => {
    const docsDir = writeSite([{ text: "概览", link: "/" }, HELP])
    const result = checkDocsNav(docsDir, { rules: { "nav/first-item": "warn" } })
    expect(result.ok).toBe(true)
    expect(result.problems.find((problem) => problem.id === "nav/first-item")?.level).toBe("warn")
  })

  it("sitemap 策略为 off 时缺产物不报错，为 warn 时只告警", () => {
    const docsDir = writeSite([{ text: "快速开始", link: "/start" }, HELP])
    mkdirSync(join(docsDir, ".vitepress", "dist"), { recursive: true })
    expect(checkDocsDist(docsDir).ok).toBe(false)
    expect(checkDocsDist(docsDir, { config: { sitemap: "warn" } }).problems[0]?.level).toBe("warn")
    expect(checkDocsDist(docsDir, { config: { sitemap: "off" } }).ok).toBe(true)
  })

  it("搜索实现配置为 none 时跳过索引断言", () => {
    const docsDir = writeSite([{ text: "快速开始", link: "/start" }, HELP])
    const dist = join(docsDir, ".vitepress", "dist")
    mkdirSync(join(dist, "assets", "chunks"), { recursive: true })
    writeFileSync(join(dist, "sitemap.xml"), "<urlset></urlset>", "utf8")
    const result = checkDocsDist(docsDir, { config: { searchProvider: "none" } })
    expect(result.ok).toBe(true)
    expect(result.searchChecked).toBe(false)
    expect(result.problems).toEqual([])
  })
})
