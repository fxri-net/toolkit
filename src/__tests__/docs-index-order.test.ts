// 索引顺序与命令覆盖：命令总览 / 配置分页 / 两份文档索引的行序与覆盖，以 site-nav.json 与命令注册表为真源
// 四处索引的行序是可用性契约（按频率排序），此前只能人工复核；本用例把「顺序」也纳入机检
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COMMAND_REGISTRY } from "../command-registry"

interface NavItem {
  text: string
  link?: string
  items?: NavItem[]
}

interface NavGroup {
  text: string
  items: NavItem[]
}

interface MarkdownTable {
  header: string[]
  rows: string[][]
}

// 侧栏数据：顺序真源
const nav = JSON.parse(readFileSync(join(process.cwd(), "docs/site-nav.json"), "utf8")) as { sidebar: NavGroup[] }

// 路径归一：去掉来源前缀与扩展名，目录形态落到 index，锚点与查询串不参与比较
function canonical(href: string): string {
  let path = href.split("#")[0] as string
  path = path.replace(/^\.\//, "").replace(/^\/+/, "")
  if (path.startsWith("docs/")) path = path.slice("docs/".length)
  path = path.replace(/\.md$/i, "").replace(/\/+$/, "")
  if (path.endsWith("/index")) path = path.slice(0, -"/index".length)
  return path === "" ? "index" : path
}

// 深度遍历一组侧栏项，按书写顺序收集站内路径（锚点由 canonical 去掉）
function groupPaths(groupText: string): string[] {
  const group = nav.sidebar.find((item) => item.text === groupText)
  expect(group, `侧栏缺少「${groupText}」组`).toBeTruthy()
  const paths: string[] = []
  const walk = (items: NavItem[]): void => {
    for (const item of items) {
      if (item.link) paths.push(canonical(item.link))
      if (item.items) walk(item.items)
    }
  }
  walk((group as NavGroup).items)
  return paths
}

// 抽取 markdown 表格：连续以 | 开头的行成一张表，跳过表头与分隔行
function tablesOf(file: string): MarkdownTable[] {
  const tables: MarkdownTable[] = []
  let current: MarkdownTable | null = null
  for (const line of readFileSync(join(process.cwd(), file), "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("|")) {
      current = null
      continue
    }
    const cells = trimmed.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim())
    if (!current) {
      current = { header: cells, rows: [] }
      tables.push(current)
      continue
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue
    current.rows.push(cells)
  }
  return tables
}

// 按表头首格取表
function tableWithHeader(file: string, header: string): MarkdownTable {
  const table = tablesOf(file).find((item) => item.header[0] === header)
  expect(table, `${file} 缺少表头为「${header}」的表格`).toBeTruthy()
  return table as MarkdownTable
}

// 取单元格里的链接目标
function hrefOf(cell: string): string {
  const matched = /\]\(([^)]+)\)/.exec(cell)
  expect(matched, `单元格缺少链接：${cell}`).toBeTruthy()
  return (matched as RegExpExecArray)[1] as string
}

describe("索引顺序与命令覆盖", () => {
  it("命令总览覆盖全部命令域，且域序与侧栏 CLI 参考一致", () => {
    const rows = tableWithHeader("docs/cli.md", "命令").rows
    const domains = rows.map((cells) => /^`toolkit ([a-z-]+)`$/.exec(cells[0] as string)?.[1] as string)
    expect(domains.every(Boolean), "命令总览首列存在无法解析的行").toBe(true)

    // 覆盖：注册表顶层域 + help
    const registered = COMMAND_REGISTRY.filter(
      (entry) => entry.stage === "current" && !entry.deprecatesTo && !entry.path.includes(" ") && entry.path !== "help",
    ).map((entry) => entry.path)
    const listed = domains.filter((domain) => domain !== "help")
    expect([...listed].sort()).toEqual([...registered].sort())
    expect(domains[domains.length - 1]).toBe("help")

    // 顺序：子页面归并到顶层域后保序去重，与侧栏一致
    const alias: Record<string, string> = {
      "skill-lint": "skill",
      "skill-bump": "skill",
      "skill-sources": "skill",
      "docs-theme": "docs",
      "docs-check": "docs",
    }
    const expected: string[] = []
    for (const path of groupPaths("参考").filter((item) => item.startsWith("cli/"))) {
      const name = path.slice("cli/".length)
      const domain = alias[name] ?? name
      if (domain === "exit-codes") continue
      if (!expected.includes(domain)) expected.push(domain)
    }
    expect(listed).toEqual(expected)
  })

  it("配置分页前部行序与侧栏配置参考一致，跨组条目可解析", () => {
    const expected = groupPaths("参考").filter((item) => item.startsWith("config/"))
    const rows = tableWithHeader("docs/config.md", "分组").rows.map((cells) => canonical(hrefOf(cells[0] as string)))
    expect(rows.slice(0, expected.length)).toEqual(expected)

    // 表末为跨组条目：只要求目标可解析到 docs 下真实页面
    for (const path of rows.slice(expected.length)) {
      expect(() => readFileSync(join(process.cwd(), "docs", `${path}.md`), "utf8")).not.toThrow()
    }
  })

  it("docs/index.md 与 README 的文档索引行序与侧栏遍历顺序一致", () => {
    // 侧栏全量遍历顺序（去重后）：两份文档索引都是它的子序列
    const sidebarAll: string[] = []
    const walkAll = (items: NavItem[]): void => {
      for (const item of items) {
        if (item.link) sidebarAll.push(canonical(item.link))
        if (item.items) walkAll(item.items)
      }
    }
    for (const group of nav.sidebar) walkAll(group.items)
    const sidebarOrder = sidebarAll.filter((path, index) => sidebarAll.indexOf(path) === index)
    const sidebarSet = new Set(sidebarOrder)

    // 表内只取站内链接；README 的「完整文档站」是外链，按协议前缀排除
    const indexOrder = (file: string): string[] =>
      tableWithHeader(file, "文档")
        .rows.map((cells) => hrefOf(cells[0] as string))
        .filter((href) => href.startsWith("./"))
        .map(canonical)

    for (const file of ["docs/index.md", "README.md"]) {
      const keys = indexOrder(file)
      const inBoth = keys.filter((path) => sidebarSet.has(path))
      const expected = sidebarOrder.filter((path) => keys.includes(path))
      expect(inBoth, `${file} 的文档索引行序与侧栏不一致`).toEqual(expected)
    }
  })
})
