// 作用域模式：语法层（glob / re: 编译与校验）与路径层（字符串归一后匹配）分离
// 语法层只处理模式文本，供路径名单与技能名匹配共用；路径层负责 ~ / 相对路径 / 统一口径归一
import { homedir } from "node:os"
import { normalizeRulePath } from "./paths"
import { globToRegExp } from "./glob"

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
}

// 路径层匹配：两侧都走字符串口径归一（展开 ~、按基准解析、统一分隔符与大小写），不解析符号链接
// 正则规则按原文匹配归一后的目标；大小写口径全平台一致，恒定不区分
export function matchPathPattern(path: string, pattern: string, options: PathPatternOptions): boolean {
  const home = options.home ?? homedir()
  // 正则按原文匹配归一后的目标路径；glob 需要先把规则解析为绝对路径并统一分隔符
  const source = pattern.startsWith(REGEX_PREFIX) ? pattern : normalizeRulePath(pattern, options.baseDir, home)
  const compiled = compilePattern(source, true)
  if (!compiled.ok) return false
  const target = normalizeRulePath(path, options.baseDir, home)
  if (compiled.pattern.test(target)) return true
  // Windows 归一的绝对路径带盘符：规则按 `/...` 书写时再去盘符比对一次，使同一份规则在各系统结论一致
  const withoutDrive = target.replace(/^[a-z]:/, "")
  return withoutDrive !== target && compiled.pattern.test(withoutDrive)
}
