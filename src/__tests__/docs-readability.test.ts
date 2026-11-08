import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

// 被测脚本按 process.cwd() 定位任务区，测试用临时目录充当仓库根并以子进程实跑，验证真实退出码与输出
const script = join(process.cwd(), "scripts", "check-docs-readability.mjs")
const fixtures: string[] = []

function createFixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fxri-readability-"))
  fixtures.push(root)
  mkdirSync(join(root, "docs"), { recursive: true })
  mkdirSync(join(root, "skills"), { recursive: true })
  // --write-baseline 会写 scripts/ 下的基线文件，夹具预先建目录
  mkdirSync(join(root, "scripts"), { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, "utf8")
  }
  return root
}

function run(root: string) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("文档可读性检查：正文阈值", () => {
  it("121 字符的段落退出 1，120 字符放行", () => {
    const long = createFixture({ "docs/long.md": `${"a".repeat(121)}\n` })
    expect(run(long).status).toBe(1)
    const fit = createFixture({ "docs/fit.md": `${"a".repeat(120)}\n` })
    expect(run(fit).status).toBe(0)
  })

  it("一行 3 个全角分号即退出 1", () => {
    const root = createFixture({ "docs/semicolon.md": "开头；一；二；三\n" })
    const result = run(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("分号 3")
  })

  it("表格行、标题、代码块不参与计长", () => {
    const root = createFixture({
      "docs/skip.md": `# ${"标".repeat(200)}\n\n| ${"表".repeat(200)} |\n\n\`\`\`\n${"码".repeat(200)}\n\`\`\`\n`,
    })
    expect(run(root).status).toBe(0)
  })

  it("徽章与图片行是机器生成的标记，不计入正文长度", () => {
    const badge = `[![CI](https://example.com/${"a".repeat(160)}.svg)](https://example.com/ci)`
    const root = createFixture({ "README.md": `${badge}\n` })
    expect(run(root).status).toBe(0)
  })
})

describe("文档可读性检查：基线语义", () => {
  it("无基线文件时违规即阻断", () => {
    const root = createFixture({ "docs/long.md": `${"a".repeat(130)}\n` })
    expect(run(root).status).toBe(1)
  })

  it("基线按文件允许行数放行时退出 0", () => {
    const content = `${"a".repeat(130)}\n`
    const root = createFixture({
      "docs/long.md": content,
      "scripts/docs-readability-baseline.json": `${JSON.stringify({ "docs/long.md": 1 }, null, 2)}\n`,
    })
    expect(run(root).status).toBe(0)
  })

  it("--write-baseline 按实测重写基线后即通过", () => {
    const content = `${"a".repeat(130)}\n`
    const root = createFixture({ "docs/long.md": content })
    expect(run(root).status).toBe(1)
    const written = spawnSync(process.execPath, [script, "--write-baseline"], { cwd: root, encoding: "utf8" })
    expect(written.status).toBe(0)
    expect(run(root).status).toBe(0)
  })
})

describe("文档可读性检查：页面体量（C-40）", () => {
  it("正文超过 150 行即阻断，正好 150 行放行", () => {
    const over = createFixture({ "docs/long.md": `${Array.from({ length: 151 }, () => "a").join("\n")}\n` })
    const result = run(over)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("正文 151 行")
    const fit = createFixture({ "docs/fit.md": `${Array.from({ length: 150 }, () => "a").join("\n")}\n` })
    expect(run(fit).status).toBe(0)
  })

  it("字符数超过 12k 即阻断（表格与代码块不计正文行，但计入字符）", () => {
    const body = Array.from({ length: 120 }, () => "a".repeat(110)).join("\n")
    const root = createFixture({ "docs/heavy.md": `${body}\n` })
    const result = run(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("字符（上限 12000）")
  })
})
