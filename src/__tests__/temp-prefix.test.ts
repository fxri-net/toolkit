// 测试临时目录前缀守卫：C-57 要求 src/__tests__ 下的临时目录一律以 fxts-tk- 开头，
// 本文件直接扫描同目录源码，拦住新测试自起前缀——否则本机 TEMP 残留会碎成多套命名、无法按前缀批量清理
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// 约定的主段：fxts = 品牌 + test suite，产品段按项目追加（本项目为 tk）
const PREFIX = "fxts-tk"
const TEST_DIR = join(process.cwd(), "src", "__tests__")
// 直接建临时目录的字面量前缀
const MKDTEMP = /mkdtempSync\(\s*join\(\s*tmpdir\(\)\s*,\s*"([^"]*)"/g
// 包装函数首参的字面量前缀（helpers.tempDir / makeTasksDir 与各文件自建的同名包装）
const WRAPPER = /\b(?:tempDir|makeTasksDir|makeDir|tmpRoot|makeRepo|runInDir)\(\s*"([^"]*)"/g

/**
 * 提取源码中创建临时目录时使用的前缀字面量及其行号。
 * 只认挂 tmpdir() 下的调用；join(home, …) 这类子目录不产生 TEMP 顶层残留，不纳入。
 * @param source 单个测试文件的源码
 * @return 前缀与所在行号（1 起）
 */
function extractPrefixes(source: string): Array<{ prefix: string; line: number }> {
  const found: Array<{ prefix: string; line: number }> = []
  for (const pattern of [MKDTEMP, WRAPPER]) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index ?? 0).split("\n").length
      found.push({ prefix: match[1]!, line })
    }
  }
  return found
}

describe("测试临时目录前缀", () => {
  it("同目录测试源码的前缀均为 fxts-tk- 开头", () => {
    const offenders: string[] = []
    for (const file of readdirSync(TEST_DIR).filter((name) => name.endsWith(".ts"))) {
      for (const { prefix, line } of extractPrefixes(readFileSync(join(TEST_DIR, file), "utf8"))) {
        if (!prefix.startsWith(PREFIX)) offenders.push(`${file}:${line} ${prefix}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("提取函数能识别旧前缀并给出行号", () => {
    // 样例用拼接构造，避免本文件自身被上一条用例扫成违规
    const sample = 'mkdtempSync(join(tmpdir(), ' + '"legacy-suite-"))'
    expect(extractPrefixes(sample)).toEqual([{ prefix: "legacy-suite-", line: 1 }])
  })
})
