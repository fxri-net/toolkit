// 测试临时目录前缀守卫：C-57 要求 src/__tests__ 下的临时目录一律以 fxts-tk- 开头，
// 本文件直接扫描同目录源码，拦住新测试自起前缀——否则本机 TEMP 残留会碎成多套命名、无法按前缀批量清理
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { tempDir } from "./helpers"
import { cleanupTrackedTempDirs } from "./temp-registry"

// 约定的主段：fxts = 品牌 + test suite，产品段按项目追加（本项目为 tk）
const PREFIX = "fxts-tk"
const TEST_DIR = join(process.cwd(), "src", "__tests__")
// 直接建临时目录的字面量前缀（引号形态兼容双引号 / 单引号 / 模板字符串）
const MKDTEMP = /mkdtempSync\(\s*join\(\s*tmpdir\(\)\s*,\s*(["'`])([^"'`]*)\1/g
// 包装函数首参的字面量前缀（helpers.tempDir / makeTasksDir 与各文件自建的同名包装）
const WRAPPER = /\b(?:tempDir|makeTasksDir|makeDir|tmpRoot|makeRepo|runInDir)\(\s*(["'`])([^"'`]*)\1/g
// 手工拼 TEMP 路径的沙箱名（vi.hoisted 内无法用 mkdtemp）：`${base}/<名>-${pid}` 或 `${base}${sep}<名>-${pid}`
const TEMPLATE_LITERAL = /`[^`]*`/g
// 只认引用 TEMP 基址的模板，避免把普通模板误判为临时目录
const TEMP_BASE_REF = /process\.env\.(?:TEMP|TMP)\b|\$\{base\}/
// 目录名段：插值前紧邻的字面量运行段（含连字符，取到最后一个 `-${` 之前）
const NAME_BEFORE_INTERPOLATION = /([A-Za-z0-9_.-]+)-\$\{/g

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
      found.push({ prefix: match[2]!, line })
    }
  }
  return found
}

/**
 * 提取源码中手工拼 TEMP 路径时使用的沙箱名前缀及其行号。
 * 只扫引用 TEMP 基址的模板字面量，避免把普通模板误判为临时目录。
 * @param source 单个测试文件的源码
 * @return 前缀与所在行号（1 起）
 */
function extractTemplatePrefixes(source: string): Array<{ prefix: string; line: number }> {
  const found: Array<{ prefix: string; line: number }> = []
  for (const literal of source.matchAll(TEMPLATE_LITERAL)) {
    if (!TEMP_BASE_REF.test(literal[0])) continue
    for (const match of literal[0].matchAll(NAME_BEFORE_INTERPOLATION)) {
      const line = source.slice(0, (literal.index ?? 0) + (match.index ?? 0)).split("\n").length
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

  it("双引号、单引号与模板字符串形态都能识别", () => {
    // 样例由字符拼接生成，避免本文件自身被上一条用例扫成违规
    const sample = (quote: string) => `mkdtempSync(join(tmpdir(), ${quote}legacy-suite-${quote}))`
    for (const quote of ['"', "'", "`"]) {
      expect(extractPrefixes(sample(quote))).toEqual([{ prefix: "legacy-suite-", line: 1 }])
    }
  })

  it("手工拼 TEMP 路径的沙箱名同样以 fxts-tk- 开头", () => {
    const offenders: string[] = []
    // 本文件含守卫正则与样例构造，跳过自扫
    for (const file of readdirSync(TEST_DIR).filter((name) => name.endsWith(".ts") && name !== "temp-prefix.test.ts")) {
      for (const { prefix, line } of extractTemplatePrefixes(readFileSync(join(TEST_DIR, file), "utf8"))) {
        if (!prefix.startsWith(PREFIX)) offenders.push(`${file}:${line} ${prefix}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("模板字符串拼接的两类形态都能识别", () => {
    const slash = "`${base}/legacy-sandbox-${process.pid}`"
    const sep = "`${base}${sep}legacy-sandbox-${process.pid}`"
    expect(extractTemplatePrefixes(slash)).toEqual([{ prefix: "legacy-sandbox", line: 1 }])
    expect(extractTemplatePrefixes(sep)).toEqual([{ prefix: "legacy-sandbox", line: 1 }])
  })
})

describe("临时目录登记与清理", () => {
  it("登记后的目录可被统一清理", () => {
    const dir = tempDir("fxts-tk-registry-")
    expect(existsSync(dir)).toBe(true)
    cleanupTrackedTempDirs()
    expect(existsSync(dir)).toBe(false)
  })

  it("目录已被提前删除时不重复报错", () => {
    const dir = tempDir("fxts-tk-registry-gone-")
    rmSync(dir, { recursive: true, force: true })
    expect(cleanupTrackedTempDirs()).toEqual([])
  })
})
