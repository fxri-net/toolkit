// 表格归一单测：单行改写的各边界（填充、缩进、对齐标记、转义竖线、非表格行）、代码块豁免、
// 行尾符保留、1 基行号、填充态检出、文件递归收集，以及 formatConventions 的写盘 / 幂等 / 预演 / 目录缺失
import { describe, it, expect, afterAll } from "vitest"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { compactMarkdown, compactTableLine, filledTableLines, formatConventions, listMarkdownFiles } from "../conventions/compact"
import { CARRIER_MARKER, INDEX_TABLE_LINES } from "../conventions/format"

// 各用例独立建临时目录，结束后统一清理
const dirs: string[] = []
function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

// 在临时目录内写一份相对路径文件（自动建父目录）
function writeFile(root: string, rel: string, content: string): string {
  const file = join(root, rel)
  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(file, content, "utf8")
  return file
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe("compactTableLine 单行归一", () => {
  it("列对齐填充收敛为单空格，分隔行对齐标记保留", () => {
    expect(compactTableLine("| 规则    | 当前语义     |")).toBe("| 规则 | 当前语义 |")
    expect(compactTableLine("| :--- | ---:   |")).toBe("| :--- | ---: |")
  })

  it("分隔行横线按列宽填充一并归为 `---`，对齐标记保留", () => {
    expect(compactTableLine("| ---- | ------------------------------------------------ |")).toBe("| --- | --- |")
    expect(compactTableLine("| :-------- | --------: |")).toBe("| :--- | ---: |")
    expect(compactTableLine("  | :----: | ---- |")).toBe("  | :---: | --- |")
  })

  it("已是紧凑形态时结果不变（写入侧的稳定不动点）", () => {
    expect(compactTableLine("| a | b | c |")).toBe("| a | b | c |")
    expect(compactTableLine("| --- | --- |")).toBe("| --- | --- |")
  })

  it("保留行首缩进前缀", () => {
    expect(compactTableLine("  | a   | b |")).toBe("  | a | b |")
  })

  it("单元格内的转义竖线不参与切分", () => {
    expect(compactTableLine("| a \\| b    | c |")).toBe("| a \\| b | c |")
  })

  it("空单元格保留（相邻竖线间的空白收敛为单空格）", () => {
    expect(compactTableLine("| a |     | c |")).toBe("| a |  | c |")
  })

  it("非表格行原样返回", () => {
    expect(compactTableLine("# 标题")).toBe("# 标题")
    expect(compactTableLine("正文含 | 竖线但非表格行")).toBe("正文含 | 竖线但非表格行")
    expect(compactTableLine("")).toBe("")
  })
})

describe("compactMarkdown 单文件归一", () => {
  it("只改表格行，其余行不动，changedLines 为 1 基行号", () => {
    const src = ["# 标题", "", "| a   | b |", "正文", "| c   | d |"].join("\n")
    const { content, changedLines } = compactMarkdown(src)
    expect(content).toBe(["# 标题", "", "| a | b |", "正文", "| c | d |"].join("\n"))
    expect(changedLines).toEqual([3, 5])
  })

  it("fenced code block 内的表格样例原样保留", () => {
    const src = ["| a   | b |", "```", "| c   | d |", "```", "| e   | f |"].join("\n")
    const { content, changedLines } = compactMarkdown(src)
    expect(content).toBe(["| a | b |", "```", "| c   | d |", "```", "| e | f |"].join("\n"))
    expect(changedLines).toEqual([1, 5])
  })

  it("波浪号围栏（~~~）同样豁免，且异类字符不闭合当前围栏", () => {
    const src = ["```", "| a   | b |", "~~~", "| c   | d |", "```", "| e   | f |"].join("\n")
    const { content, changedLines } = compactMarkdown(src)
    // 第 3 行的 ~~~ 与起始的 ``` 不同类，不闭合，故 2 / 4 两行表格仍在块内
    expect(content).toBe(["```", "| a   | b |", "~~~", "| c   | d |", "```", "| e | f |"].join("\n"))
    expect(changedLines).toEqual([6])
  })

  it("闭合围栏不短于起始串：4 反引号块内的 3 反引号行不闭合", () => {
    const src = ["````", "| a   | b |", "```", "| c   | d |", "````"].join("\n")
    const { content, changedLines } = compactMarkdown(src)
    expect(content).toBe(src)
    expect(changedLines).toEqual([])
  })

  it("保留原行尾符（CRLF 输入输出仍为 CRLF）", () => {
    const src = "| a   | b |\r\n| c | d |"
    const { content, changedLines } = compactMarkdown(src)
    expect(content).toBe("| a | b |\r\n| c | d |")
    expect(content.includes("\r\n")).toBe(true)
    expect(changedLines).toEqual([1])
  })

  it("已是紧凑形态时不产生改动", () => {
    const src = "| a | b |\n| --- | --- |"
    const { content, changedLines } = compactMarkdown(src)
    expect(content).toBe(src)
    expect(changedLines).toEqual([])
  })
})

describe("filledTableLines 填充态检出", () => {
  it("命中填充行号，紧凑行与代码块内行不报", () => {
    const src = ["| a | b |", "| c   | d |", "```", "| e   | f |", "```", "| g  | h |"].join("\n")
    expect(filledTableLines(src)).toEqual([2, 6])
  })

  it("全紧凑内容无命中", () => {
    expect(filledTableLines("| a | b |\n正文")).toEqual([])
  })

  it("分隔行横线偏离紧凑形态时命中", () => {
    expect(filledTableLines("| a | b |\n| ---- | -------- |")).toEqual([2])
    expect(filledTableLines("| a | b |\n| --- | --- |")).toEqual([])
  })
})

describe("listMarkdownFiles 递归收集", () => {
  it("收集全部层级 .md 并排序，非 md 文件不计入", () => {
    const root = makeDir("fxts-tk-fmt-list-")
    writeFile(root, "conventions/index.md", "# idx")
    writeFile(root, "conventions/history.md", "# hist")
    writeFile(root, "active/202610/task.md", "# task")
    writeFile(root, "archive/202609/20260915.md", "# archive")
    writeFile(root, "notes.txt", "x")

    const got = listMarkdownFiles(root).map((f) => relative(root, f).replace(/\\/g, "/"))
    expect(got).toEqual([
      "active/202610/task.md",
      "archive/202609/20260915.md",
      "conventions/history.md",
      "conventions/index.md",
    ])
  })
})

describe("formatConventions 归一主流程", () => {
  it("任务区不存在时报错并给出初始化指引", () => {
    const root = makeDir("fxts-tk-fmt-none-")
    expect(() => formatConventions(join(root, "nope"))).toThrow(/任务区目录不存在/)
  })

  it("逐文件归一写盘，报告给出文件数与命中行数", () => {
    const root = makeDir("fxts-tk-fmt-write-")
    const a = writeFile(root, "active/202610/task.md", "| a   | b |\n| c | d |")
    writeFile(root, "archive/202609/20260915.md", "| e   | f |\n")
    writeFile(root, "conventions/index.md", "| g | h |\n")

    const report = formatConventions(root)
    expect(report.status).toBe("compacted")
    expect(report.files).toBe(3)
    expect(report.changedFiles).toBe(2)
    expect(report.changedLines).toBe(2)
    expect(report.changes.map((c) => c.file)).toEqual(["active/202610/task.md", "archive/202609/20260915.md"])
    expect(report.changes[0]?.lines).toEqual([1])
    expect(readFileSync(a, "utf8")).toBe("| a | b |\n| c | d |")
  })

  it("重复执行为幂等：二次返回 already-compact 且不再写盘", () => {
    const root = makeDir("fxts-tk-fmt-idem-")
    writeFile(root, "active/202610/task.md", "| a   | b |\n")

    formatConventions(root)
    const report = formatConventions(root)
    expect(report.status).toBe("already-compact")
    expect(report.changedFiles).toBe(0)
    expect(report.changedLines).toBe(0)
    expect(report.changes).toEqual([])
  })

  it("--dry-run 只报不改，文件保持填充态", () => {
    const root = makeDir("fxts-tk-fmt-dry-")
    const a = writeFile(root, "active/202610/task.md", "| a   | b |\n")

    const report = formatConventions(root, { dryRun: true })
    expect(report.status).toBe("compacted")
    expect(report.dryRun).toBe(true)
    expect(report.changedFiles).toBe(1)
    expect(readFileSync(a, "utf8")).toBe("| a   | b |\n")
  })

  it("代码块内的表格样例不参与写盘", () => {
    const root = makeDir("fxts-tk-fmt-fence-")
    const a = writeFile(root, "active/202610/task.md", "```\n| a   | b |\n```\n")

    const report = formatConventions(root)
    expect(report.status).toBe("already-compact")
    expect(readFileSync(a, "utf8")).toBe("```\n| a   | b |\n```\n")
    expect(existsSync(a)).toBe(true)
  })
})

// 索引表单元格归一：只处理 conventions/index.md，且只做可确定项
function writeIndex(root: string, rows: string[]): string {
  const content = [
    CARRIER_MARKER,
    "# 项目协作规范索引",
    "",
    "## 二、索引",
    "",
    ...INDEX_TABLE_LINES.split("\n"),
    ...rows,
    "",
  ].join("\n")
  return writeFile(root, "conventions/index.md", content)
}

describe("formatConventions 索引表单元格归一", () => {
  it("反引号分册名与裸文件名转相对链接，归属去包裹，规则去引号", () => {
    const root = makeDir("fxts-tk-fmt-cells-")
    writeFile(root, "conventions/common.md", "# 通用规范\n")
    const index = writeIndex(root, [
      "| C-1 | 「四级时间源」 | 建档时：当场打点优先 | `common` | `common.md` |",
      "| C-2 | 路径书写 | 写路径时：仓库根相对路径 | common | common.md |",
    ])

    formatConventions(root)

    const content = readFileSync(index, "utf8")
    expect(content).toContain("| C-1 | 四级时间源 | 建档时：当场打点优先 | common | [common.md](./common.md) |")
    expect(content).toContain("| C-2 | 路径书写 | 写路径时：仓库根相对路径 | common | [common.md](./common.md) |")
  })

  it("行内代码包裹的载体外文件若目标存在同样转相对链接", () => {
    const repo = makeDir("fxts-tk-fmt-cells-ext-")
    writeFile(repo, "AGENTS.md", "# 规则\n")
    writeFile(repo, "docs/rules/ai.md", "# AI 规则\n")
    const index = writeIndex(join(repo, ".tasks"), [
      "| C-1 | 细节只进 skills | 写规则时：可变流程只进 skills | common | `AGENTS.md` 质量门 5 |",
      "| C-2 | 输出分流 | 对外输出：stdout 只放数据 | common | `docs/rules/ai.md` |",
    ])

    formatConventions(join(repo, ".tasks"))

    const content = readFileSync(index, "utf8")
    expect(content).toContain("[AGENTS.md](../../AGENTS.md) 质量门 5")
    expect(content).toContain("[ai.md](../../docs/rules/ai.md)")
  })

  it("载体外文件目标不存在时保持行内代码并告警", () => {
    const root = makeDir("fxts-tk-fmt-cells-out-")
    const index = writeIndex(root, [
      "| C-1 | 细节只进 skills | 写规则时：可变流程只进 skills | common | `AGENTS.md` 质量门 5 |",
      "| C-2 | 门禁 | 改验收时：只认 verify | common | AGENTS.md 质量门 2 |",
    ])

    const report = formatConventions(root)

    const content = readFileSync(index, "utf8")
    expect(content).toContain("| C-1 | 细节只进 skills | 写规则时：可变流程只进 skills | common | `AGENTS.md` 质量门 5 |")
    expect(content).toContain("| C-2 | 门禁 | 改验收时：只认 verify | common | AGENTS.md 质量门 2 |")
    expect(report.warnings.some((w) => w.includes("AGENTS.md") && w.includes("目标不可解析"))).toBe(true)
  })

  it("当前语义缺全角冒号时只告警不改写", () => {
    const root = makeDir("fxts-tk-fmt-cells-colon-")
    writeFile(root, "conventions/common.md", "# 通用规范\n")
    const index = writeIndex(root, ["| C-1 | 四级时间源 | 当场打点优先 | common | [common.md](./common.md) |"])

    const report = formatConventions(root)

    expect(readFileSync(index, "utf8")).toContain("| C-1 | 四级时间源 | 当场打点优先 | common | [common.md](./common.md) |")
    expect(report.status).toBe("already-compact")
    expect(report.warnings.some((w) => w.includes("C-1") && w.includes("全角冒号"))).toBe(true)
  })

  it("归一后幂等：二次执行为 already-compact 且无告警", () => {
    const root = makeDir("fxts-tk-fmt-cells-idem-")
    writeFile(root, "conventions/common.md", "# 通用规范\n")
    writeIndex(root, ["| C-1 | 四级时间源 | 建档时：当场打点优先 | `common` | `common.md` |"])

    formatConventions(root)
    const second = formatConventions(root)
    expect(second.status).toBe("already-compact")
    expect(second.changedLines).toBe(0)
    expect(second.warnings).toEqual([])
  })

  it("代码块内的索引表样例不参与单元格归一", () => {
    const root = makeDir("fxts-tk-fmt-cells-fence-")
    const index = writeFile(
      root,
      "conventions/index.md",
      ["```", "| ID | 规则 | 当前语义 | 归属 | 单一事实源 |", "| --- | --- | --- | --- | --- |", "| C-1 | 甲 | 乙 | `common` | `common.md` |", "```", ""].join("\n"),
    )

    const report = formatConventions(root)
    expect(report.status).toBe("already-compact")
    expect(readFileSync(index, "utf8")).toContain("| C-1 | 甲 | 乙 | `common` | `common.md` |")
  })
})
