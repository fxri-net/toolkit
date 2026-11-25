// 标题与索引文案校验：判据取原文比对，覆盖 title/H1 与目录表两条主线
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { checkDocsTitles } from "../docs/titles"

let root: string
let docs: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fxts-tk-docs-titles-"))
  docs = join(root, "docs")
  mkdirSync(docs, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

// 在文档目录内写文件：自动建父目录
function write(rel: string, content: string): void {
  const file = join(docs, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, "utf8")
}

// 页面内容：frontmatter title 与 H1 均可缺省，extra 为额外 frontmatter 行
function page(title: string | null, h1: string | null, extra: string[] = []): string {
  return [
    ...(title === null ? [] : ["---", `title: ${title}`, ...extra, "---", ""]),
    ...(h1 === null ? [] : [`# ${h1}`, ""]),
  ].join("\n")
}

// 目录表：首列为链接，第二列为说明
function table(rows: [string, string][]): string {
  return ["| 文档 | 说明 |", "| --- | --- |", ...rows.map(([label, href]) => `| [${label}](${href}) | 示例 |`), ""].join("\n")
}

// 取问题 id 集合
function ids(result: ReturnType<typeof checkDocsTitles>): string[] {
  return result.problems.map((problem) => problem.id)
}

describe("docs titles：页面标题", () => {
  it("title 与一级标题一致时不报问题", () => {
    write("a.md", page("甲页", "甲页"))
    const result = checkDocsTitles(docs)
    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
  })

  it("title 与一级标题不一致时报 h1-mismatch", () => {
    write("a.md", page("甲页", "乙页"))
    expect(ids(checkDocsTitles(docs))).toContain("title/h1-mismatch")
  })

  it("声明 title 但缺一级标题时报 h1-missing；layout: home 豁免", () => {
    write("no-h1.md", page("首页", null))
    write("home.md", page("首页", null, ["layout: home"]))
    const result = checkDocsTitles(docs)
    expect(result.problems.filter((problem) => problem.id === "title/h1-missing").map((problem) => problem.file)).toEqual([
      expect.stringContaining("no-h1.md"),
    ])
  })
})

describe("docs titles：目录表", () => {
  it("链接文案与目标页标题不一致时报 index-label", () => {
    write("a.md", page("甲页", "甲页"))
    write("b.md", page("乙页", "乙页"))
    write("index.md", ["# 索引", "", "## 文档索引", "", table([["甲", "./a.md"], ["乙页", "./b.md"]]), "## 其他", ""].join("\n"))
    const result = checkDocsTitles(docs)
    expect(ids(result)).toContain("title/index-label")
    expect(result.problems.find((problem) => problem.id === "title/index-label")?.message).toContain("甲")
  })

  it("链接目标不存在时报 index-target", () => {
    write("a.md", page("甲页", "甲页"))
    write("index.md", ["# 索引", "", "## 文档索引", "", table([["甲页", "./a.md"], ["缺页", "./missing.md"]]), "## 其他", ""].join("\n"))
    expect(ids(checkDocsTitles(docs))).toContain("title/index-target")
  })

  it("不足两行的表不视为目录表", () => {
    write("a.md", page("甲页", "甲页"))
    write("index.md", ["# 索引", "", "## 文档索引", "", table([["甲", "./a.md"]]), "## 其他", ""].join("\n"))
    expect(checkDocsTitles(docs).problems).toEqual([])
  })

  it("extraFiles 可把文档目录之外的文件纳入扫描", () => {
    write("a.md", page("甲页", "甲页"))
    const readme = join(root, "README.md")
    writeFileSync(readme, ["# 项目", "", "## 文档索引", "", table([["甲", "./docs/a.md"], ["乙页", "./docs/a.md"]]), "## 其他", ""].join("\n"), "utf8")
    const result = checkDocsTitles(docs, { config: { extraFiles: [readme], exclude: [] } })
    expect(ids(result)).toContain("title/index-label")
  })

  it("exclude 支持整文件与文件#小节两种豁免", () => {
    write("a.md", page("甲页", "甲页"))
    write("b.md", page("乙页", "乙页"))
    const content = ["# 索引", "", "## 文档索引", "", table([["甲", "./a.md"], ["乙", "./b.md"]]), "## 其他", ""].join("\n")
    write("by-file.md", content)
    write("by-section.md", content)
    const result = checkDocsTitles(docs, { config: { extraFiles: [], exclude: ["by-file.md", "by-section.md#文档索引"] } })
    expect(result.problems).toEqual([])
  })

  it("规则可降级为 warn：保留提示但不阻断", () => {
    write("a.md", page("甲页", "甲页"))
    write("b.md", page("乙页", "乙页"))
    write("index.md", ["# 索引", "", "## 文档索引", "", table([["甲页", "./a.md"], ["乙", "./b.md"]]), "## 其他", ""].join("\n"))
    const result = checkDocsTitles(docs, { rules: { "title/index-label": "warn" } })
    expect(result.ok).toBe(true)
    expect(result.problems.every((problem) => problem.level === "warn")).toBe(true)
    expect(result.problems).toHaveLength(1)
  })
})
