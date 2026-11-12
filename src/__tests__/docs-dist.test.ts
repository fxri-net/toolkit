// 文档站产物校验：只读构建产物，产物缺失即跳过
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkDocsDist } from "../docs/dist"

// 临时文档目录：每个用例独立
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fxri-docs-dist-"))
  writeFileSync(join(dir, "404.md"), "---\nsearch: false\n---\n\n# 页面未找到\n")
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// 写入构建产物：sitemap 与搜索索引分块按用例定制
function writeDist(options: { sitemap?: string; chunks?: Record<string, string> } = {}): void {
  const dist = join(dir, ".vitepress", "dist")
  mkdirSync(join(dist, "assets", "chunks"), { recursive: true })
  writeFileSync(join(dist, "sitemap.xml"), options.sitemap ?? "<urlset><url><loc>https://example.com/</loc></url></urlset>")
  for (const [name, content] of Object.entries(options.chunks ?? { "@localSearchIndexroot.abc.js": "首页" })) {
    writeFileSync(join(dist, "assets", "chunks", name), content)
  }
}

describe("checkDocsDist", () => {
  it("产物缺失时跳过，不算失败", () => {
    const result = checkDocsDist(dir)
    expect(result.skipped).toBe(true)
    expect(result.ok).toBe(true)
  })

  it("sitemap 与搜索索引都不含 404 时通过", () => {
    writeDist()
    const result = checkDocsDist(dir)
    expect(result.skipped).toBe(false)
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
  })

  it("sitemap 含 404 页时报错", () => {
    writeDist({ sitemap: "<urlset><url><loc>https://example.com/404.html</loc></url></urlset>" })
    expect(checkDocsDist(dir).problems.map((problem) => problem.id)).toContain("dist/sitemap-404")
  })

  it("缺少 sitemap.xml 时报错", () => {
    const dist = join(dir, ".vitepress", "dist")
    mkdirSync(join(dist, "assets", "chunks"), { recursive: true })
    writeFileSync(join(dist, "assets", "chunks", "@localSearchIndexroot.abc.js"), "首页")
    expect(checkDocsDist(dir).problems.map((problem) => problem.id)).toContain("dist/sitemap-missing")
  })

  it("搜索索引分块含 404 页标题时报错", () => {
    writeDist({ chunks: { "@localSearchIndexroot.abc.js": "页面未找到" } })
    expect(checkDocsDist(dir).problems.map((problem) => problem.id)).toContain("dist/search-404")
  })

  it("未启用本地搜索时只告警，不阻断", () => {
    writeDist({ chunks: {} })
    const result = checkDocsDist(dir)
    expect(result.ok).toBe(true)
    expect(result.problems.map((problem) => problem.id)).toEqual(["dist/search-index-missing"])
  })

  it("404 源页缺一级标题时报错，无法断言搜索索引", () => {
    writeFileSync(join(dir, "404.md"), "---\nsearch: false\n---\n\n没有标题\n")
    writeDist()
    expect(checkDocsDist(dir).problems.map((problem) => problem.id)).toContain("dist/not-found-title")
  })
})
