// 作用域模式：语法层（glob / re: 编译与校验）与路径层（归一化后匹配）分离
// 语法层只处理模式文本，供路径名单与技能名匹配共用；路径层负责 ~ / 相对路径 / 真实形态归一
import { homedir } from "node:os"
import { isAbsolute, resolve } from "node:path"
import { canonicalPath, normalizePathForCompare } from "../git-ignore"
import { globToRegExp } from "./glob"
import { expandHome } from "./paths"

// 模式类型：glob 为默认语法，re: 前缀切换为正则
export type PatternKind = "glob" | "regex"
// 正则前缀：避免与含特殊字符的 Windows 路径（如 C:\work\[x]）混淆
export const REGEX_PREFIX = "re:"
// 复杂度上限：只拦形态明确的风险，不做完备的正则安全分析
const MAX_PATTERN_CHARS = 200
const MAX_QUANTIFIERS = 20
// 嵌套量词（如 (a+)+）是回溯爆炸的典型形态
const NESTED_QUANTIFIER = /\([^()]*[+*][^()]*\)[+*{]/
const QUANTIFIERS = /[+*?]|\{\d+(?:,\d*)?\}/g

export interface CompiledPattern {
  source: string
  kind: PatternKind
  test(value: string): boolean
}

export type CompileResult = { ok: true; pattern: CompiledPattern } | { ok: false; reason: string }

// 量词计数：只数正则主体里的 + * ? 与 {m,n} 形态
function countQuantifiers(body: string): number {
  return body.match(QUANTIFIERS)?.length ?? 0
}

// 编译模式：非法或过于复杂时返回原因，由调用方告警并剔除（降级不静默）
// 大小写默认不区分，与既有 glob 口径保持一致；如需区分由调用方显式传 false
export function compilePattern(source: string, caseInsensitive = true): CompileResult {
  if (source.length > MAX_PATTERN_CHARS) {
    return { ok: false, reason: `超过 ${MAX_PATTERN_CHARS} 字符上限` }
  }
  if (source.startsWith(REGEX_PREFIX)) {
    const body = source.slice(REGEX_PREFIX.length)
    if (!body) return { ok: false, reason: "正则内容为空" }
    if (NESTED_QUANTIFIER.test(body)) return { ok: false, reason: "包含嵌套量词，可能引发回溯爆炸" }
    if (countQuantifiers(body) > MAX_QUANTIFIERS) {
      return { ok: false, reason: `量词超过 ${MAX_QUANTIFIERS} 个，可能引发回溯爆炸` }
    }
    try {
      const regexp = new RegExp(body, caseInsensitive ? "i" : "")
      return { ok: true, pattern: { source, kind: "regex", test: (value) => regexp.test(value) } }
    } catch (error) {
      return { ok: false, reason: `正则无效：${(error as Error).message}` }
    }
  }
  const regexp = globToRegExp(source, caseInsensitive)
  return { ok: true, pattern: { source, kind: "glob", test: (value) => regexp.test(value) } }
}

// 语法层匹配：只比较文本，不做路径归一（技能名等扁平标识用它）
export function matchPattern(value: string, pattern: string, caseInsensitive = true): boolean {
  const compiled = compilePattern(pattern, caseInsensitive)
  return compiled.ok ? compiled.pattern.test(value) : false
}

export interface PathPatternOptions {
  // 相对路径的解析基准（判定基准：项目根）
  baseDir: string
  // home 目录：测试与跨平台场景可注入，缺省取当前用户
  home?: string
  caseInsensitive?: boolean
}

// 路径层匹配：目标取真实形态；glob 规则先展开 ~ 与相对路径，正则按归一后的路径匹配
// 大小写口径全平台一致：glob 与正则都按不区分大小写处理（目标已折小写，正则恒定带 i）
export function matchPathPattern(path: string, pattern: string, options: PathPatternOptions): boolean {
  const home = options.home ?? homedir()
  const expanded = expandHome(pattern, home)
  const isRegex = expanded.startsWith(REGEX_PREFIX)
  // 正则按原文匹配归一后的目标路径；glob 需要先把规则解析为绝对路径并统一分隔符
  const source = isRegex
    ? expanded
    : normalizePathForCompare(canonicalPath(isAbsolute(expanded) ? expanded : resolve(options.baseDir, expanded)))
  const compiled = compilePattern(source, true)
  if (!compiled.ok) return false
  const target = normalizePathForCompare(canonicalPath(isAbsolute(path) ? path : resolve(options.baseDir, path)))
  return compiled.pattern.test(target)
}
