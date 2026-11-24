// 覆盖率双轨门禁：改动行判定与全局下限的假现场用例（C-44）
// 被测脚本按 process.cwd() 读 coverage 报告，测试用临时目录充当仓库根并以子进程实跑，验证真实退出码与输出
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const script = join(process.cwd(), "scripts", "check-coverage.mjs")
const fixtures: string[] = []

interface FixtureOptions {
  // 每个语句的起始行与命中次数
  statements: Array<{ line: number; hits: number }>
  // 被统计的源文件路径（缺省 src/demo.ts），用于区分核心域与编排层
  file?: string
  // 覆盖率汇总百分比，缺省全部 90（高于下限）
  summary?: { statements: number; branches: number; functions: number; lines: number }
  // 注入的 unified diff；缺省按语句行生成「全部新增」
  diff?: string
  // 模拟报告缺失
  coverageMissing?: boolean
}

// 构造 unified diff：把给定行区间标为新增
function buildDiff(lines: number[], file = "src/demo.ts"): string {
  if (lines.length === 0) return ""
  const start = Math.min(...lines)
  const end = Math.max(...lines)
  const body = Array.from({ length: end - start + 1 }, () => "+const value = 1").join("\n")
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -0,0 +${start},${end - start + 1} @@\n${body}\n`
}

function createFixture(options: FixtureOptions): string {
  const root = mkdtempSync(join(tmpdir(), "fxts-tk-coverage-"))
  fixtures.push(root)
  const statements = options.statements
  const summary = options.summary ?? { statements: 90, branches: 90, functions: 90, lines: 90 }
  const total = Object.fromEntries(Object.entries(summary).map(([metric, pct]) => [metric, { pct }]))
  const coverage = {
    [join(root, options.file ?? "src/demo.ts")]: {
      statementMap: Object.fromEntries(
        statements.map((item, index) => [String(index), { start: { line: item.line, column: 0 }, end: { line: item.line, column: 1 } }]),
      ),
      s: Object.fromEntries(statements.map((item, index) => [String(index), item.hits])),
    },
  }
  mkdirSync(join(root, "coverage"), { recursive: true })
  if (!options.coverageMissing) {
    writeFileSync(join(root, "coverage", "coverage-final.json"), JSON.stringify(coverage), "utf8")
    writeFileSync(join(root, "coverage", "coverage-summary.json"), JSON.stringify({ total }), "utf8")
  }
  writeFileSync(join(root, "diff.txt"), options.diff ?? buildDiff(statements.map((item) => item.line), options.file), "utf8")
  return root
}

function run(root: string) {
  return spawnSync(process.execPath, [script, "--coverage", "coverage", "--diff", "diff.txt"], { cwd: root, encoding: "utf8" })
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("覆盖率门禁：双轨判定", () => {
  it("改动语句全部覆盖时通过", () => {
    const root = createFixture({ statements: [3, 4, 5, 6, 7, 8].map((line) => ({ line, hits: 1 })) })
    const result = run(root)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("改动行覆盖率 100.0%")
  })

  it("改动行覆盖不足时失败并列出未覆盖文件行", () => {
    const root = createFixture({
      statements: [3, 4, 5, 6, 7, 8].map((line, index) => ({ line, hits: index < 3 ? 1 : 0 })),
    })
    const result = run(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("改动行覆盖率 50.0%")
    expect(result.stderr).toContain("src/demo.ts:6")
  })

  it("没有新增行时跳过改动行判定", () => {
    const root = createFixture({
      statements: [3, 4, 5, 6, 7, 8].map((line) => ({ line, hits: 0 })),
      diff: "",
    })
    const result = run(root)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("跳过改动行判定")
  })

  it("改动语句少于 5 条时放行（避免小改动被拦）", () => {
    const root = createFixture({ statements: [3, 4].map((line) => ({ line, hits: 0 })) })
    const result = run(root)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("少于 5")
  })

  it("全局下限跌破时失败", () => {
    const root = createFixture({
      statements: [3, 4, 5, 6, 7, 8].map((line) => ({ line, hits: 1 })),
      summary: { statements: 70, branches: 90, functions: 90, lines: 90 },
    })
    const result = run(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("全局 statements 70% 低于下限 78%")
  })

  it("覆盖率报告缺失时按失败处理", () => {
    const root = createFixture({ statements: [{ line: 3, hits: 1 }], coverageMissing: true })
    const result = run(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("请先执行带覆盖率的单测")
  })

  it("--no-floors 时局部采集跳过全局下限", () => {
    const root = createFixture({
      statements: [3, 4, 5, 6, 7, 8].map((line) => ({ line, hits: 1 })),
      summary: { statements: 10, branches: 10, functions: 10, lines: 10 },
    })
    const result = spawnSync(process.execPath, [script, "--coverage", "coverage", "--diff", "diff.txt", "--no-floors"], {
      cwd: root,
      encoding: "utf8",
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("跳过全局下限")
  })

  it("存在 GITHUB_STEP_SUMMARY 时追加摘要", () => {
    const root = createFixture({ statements: [3, 4, 5, 6, 7, 8].map((line) => ({ line, hits: 1 })) })
    const target = join(root, "summary.md")
    const result = spawnSync(process.execPath, [script, "--coverage", "coverage", "--diff", "diff.txt"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GITHUB_STEP_SUMMARY: target },
    })
    expect(result.status).toBe(0)
    const written = readFileSync(target, "utf8")
    expect(written).toContain("## 覆盖率")
    expect(written).toContain("改动行覆盖率")
  })

  it("编排层文件的改动行不计入判定", () => {
    const root = createFixture({
      file: "src/commands/rule.ts",
      statements: [3, 4, 5, 6, 7, 8].map((line) => ({ line, hits: 0 })),
    })
    const result = run(root)
    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
  })

  it("核心域文件的改动行仍按 80% 判定", () => {
    const root = createFixture({
      file: "src/rules/sync.ts",
      statements: [3, 4, 5, 6, 7, 8].map((line, index) => ({ line, hits: index < 3 ? 1 : 0 })),
    })
    const result = run(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("src/rules/sync.ts:6")
  })
})
