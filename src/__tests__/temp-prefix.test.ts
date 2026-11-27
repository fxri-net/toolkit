// 测试临时目录守卫（C-57）：测试代码不得直接接触系统临时目录，只能走 helpers.tempDir / tempPath；
// 从入口保证前缀统一为 fxts-tk-，新测试无法再自起一套命名而躲过统一清理
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { tempDir } from "./helpers"

// 测试目录与实现文件白名单：只有 helpers 负责真正触达系统临时目录
const TEST_DIR = join(process.cwd(), "src", "__tests__")
const ALLOW_FILES = new Set(["helpers.ts", "temp-registry.ts", "setup-temp.ts", "temp-prefix.test.ts"])
// vi.hoisted 场景无法调用 helpers（导入尚未初始化），这些文件只能用 TEMP / TMP 拼沙箱；
// 新增文件不在名单内，仍会被守卫拦下
const ALLOW_TEMP_FILES = new Set([
  "cli-golden.test.ts",
  "env-override-effect.test.ts",
  "options-matrix.test.ts",
  "skills-check-cli.test.ts",
  "update-check.test.ts",
  "version-status.test.ts",
])

export interface Violation {
  file: string
  line: number
  text: string
}

// 递归列出测试目录下的 .ts 文件，守卫范围覆盖子目录
function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) listSourceFiles(full, acc)
    else if (entry.name.endsWith(".ts")) acc.push(full)
  }
  return acc
}

// 取最近一层语句文本：TEMP 引用允许与 fxts-tk- 字面量出现在同一语句里
function statementText(node: ts.Node): string {
  let current: ts.Node = node
  while (current.parent && !ts.isStatement(current)) current = current.parent
  return current.getText()
}

/**
 * 扫描单个源码，返回违规位置。
 * @param source 源码文本
 * @param fileName 相对测试目录的文件名，用于白名单判断
 * @return 违规清单
 */
export function scanSource(source: string, fileName: string): Violation[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const violations: Violation[] = []
  const allowTemp = ALLOW_TEMP_FILES.has(fileName)
  const report = (node: ts.Node, text: string): void => {
    violations.push({ file: fileName, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text })
  }
  const visit = (node: ts.Node): void => {
    // tmpdir 标识符：导入、调用、别名一律不允许出现在测试里；对象字面量的键（vi.mock 替身）不算引用
    if (ts.isIdentifier(node) && node.text === "tmpdir") {
      const parent = node.parent
      const isMockKey = ts.isPropertyAssignment(parent) && parent.name === node
      if (!isMockKey) report(node, "直接引用 tmpdir")
    }
    // process.env.TEMP / TMP：hoisted 白名单之外，必须与 fxts-tk- 字面量同语句
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.getText(sf) === "process.env" &&
      (node.name.text === "TEMP" || node.name.text === "TMP") &&
      !allowTemp &&
      !/fxts-tk-/.test(statementText(node))
    ) {
      report(node, `直接引用 ${node.getText(sf)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return violations
}

describe("测试临时目录守卫", () => {
  it("测试目录内不直接引用系统临时目录", () => {
    const violations: Violation[] = []
    for (const file of listSourceFiles(TEST_DIR)) {
      const rel = relative(TEST_DIR, file).replace(/\\/g, "/")
      if (ALLOW_FILES.has(rel)) continue
      violations.push(...scanSource(readFileSync(file, "utf8"), rel))
    }
    expect(violations.map((item) => `${item.file}:${item.line} ${item.text}`)).toEqual([])
  })

  it("字面前缀不合规会被识别", () => {
    const sample = 'const dir = mkdtempSync(join(tmpdir(), "my-suite-"))'
    expect(scanSource(sample, "sample.test.ts")).toHaveLength(1)
  })

  it("os.tmpdir、导入别名与变量前缀同样被识别", () => {
    expect(scanSource("const base = os.tmpdir()", "sample.test.ts")).toHaveLength(1)
    expect(scanSource('import { tmpdir as sandbox } from "node:os"', "sample.test.ts")).toHaveLength(1)
    expect(scanSource('const dir = mkdtempSync(join(tmpdir(), "my-"))', "sample.test.ts")).toHaveLength(1)
  })

  it("vi.mock 里的 tmpdir 替身键不算直接引用", () => {
    const sample = 'vi.mock("node:os", () => ({ tmpdir: () => "/tmp" }))'
    expect(scanSource(sample, "sample.test.ts")).toEqual([])
  })

  it("非 fxts-tk- 前缀在入口处直接抛错", () => {
    expect(() => tempDir("my-suite-")).toThrow(/fxts-tk-/)
  })

  it("hoisted 白名单文件允许 TEMP 拼沙箱，其他文件不允许", () => {
    const sample = 'const base = (process.env.TEMP || process.env.TMP || "/tmp")'
    expect(scanSource(sample, "cli-golden.test.ts")).toEqual([])
    expect(scanSource(sample, "other.test.ts").length).toBe(2)
  })
})
