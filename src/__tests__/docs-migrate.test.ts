// 导航数据迁移助手：从站点配置抽取字面量生成 site-nav.json
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrateSiteNav } from "../docs/migrate"

let dir = ""

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fxri-docs-migrate-"))
  mkdirSync(join(dir, ".vitepress"), { recursive: true })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// 写站点配置：带注释、单引号、尾逗号与嵌套结构
function writeConfig(body: string): void {
  writeFileSync(join(dir, ".vitepress", "config.mts"), body, "utf8")
}

describe("migrateSiteNav", () => {
  it("抽取单引号、注释、尾逗号与嵌套结构，生成 JSON", () => {
    writeConfig(`import { defineConfig } from 'vitepress'

// 顶栏注释
const config = defineConfig({
  themeConfig: {
    nav: [
      { text: '快速开始', link: '/start' },
      {
        text: '参考',
        items: [
          { text: '内核', items: [{ text: '装配', link: '/kernel' }] },
        ],
      },
      { text: '帮助', items: [{ text: '常见问题', link: '/faq' }, { text: '更新日志', link: '/changelog' }] },
    ], /* 行内注释 */
    sidebar: {
      '/': [{ text: '开始', items: [{ text: '首页', link: '/', collapsed: false }] }],
      '/guide/': [{ text: '指南', items: [] }],
    },
  },
})
`)
    const result = migrateSiteNav(dir)
    expect(result.navCount).toBe(3)
    expect(result.sidebarCount).toBe(2)
    const data = JSON.parse(readFileSync(join(dir, "site-nav.json"), "utf8")) as {
      nav: Array<{ text: string; items?: unknown[] }>
      sidebar: Record<string, unknown[]>
    }
    expect(data.nav[1]?.items).toHaveLength(1)
    expect(data.sidebar["/" as string]).toHaveLength(1)
  })

  it("动态写法无法迁移时报错，且不落盘", () => {
    writeConfig("export default { themeConfig: { nav: [...base, { text: 'x', link: '/' }], sidebar: [] } }\n")
    expect(() => migrateSiteNav(dir)).toThrow()
    expect(existsSync(join(dir, "site-nav.json"))).toBe(false)
  })

  it("目标已存在时默认报错，--force 才覆盖", () => {
    writeConfig("export default { themeConfig: { nav: [{ text: 'a', link: '/' }], sidebar: [] } }\n")
    writeFileSync(join(dir, "site-nav.json"), "{}", "utf8")
    expect(() => migrateSiteNav(dir)).toThrow("--force")
    expect(migrateSiteNav(dir, { force: true }).navCount).toBe(1)
  })

  it("缺少 nav / sidebar 字段时给出明确错误", () => {
    writeConfig("export default { themeConfig: {} }\n")
    expect(() => migrateSiteNav(dir)).toThrow("未找到 nav 字段")
  })
})
