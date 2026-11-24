// 文档叙事口径守卫：面向使用者的页面不得出现「本仓纪律 / 强制」类表述，对应 C-58 的机检部分。
// 技术参考页（CLI / 配置 / API / 变更日志 / 规则模板 / 使用统计）以命令与规则正文为主体，不在扫描范围。
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const DOCS_DIR = join(process.cwd(), "docs")
// 参考页与模板页前缀：按目录/文件名排除，新增叙事页会被自动纳入扫描
const REFERENCE_PREFIXES = ["cli/", "config", "api", "changelog/", "rules/", "usage/"]
// 禁忌词：本仓开发纪律被写成使用者义务时的典型措辞
const FORBIDDEN = ["核心纪律", "强制约束", "你必须", "建议开启"]

/**
 * 递归收集参与叙事口径检查的页面。
 * @param dir 起始目录
 * @return 页面绝对路径列表
 */
function narrativeFiles(dir = DOCS_DIR): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...narrativeFiles(path))
      continue
    }
    if (!name.endsWith(".md") || name === "404.md") continue
    const rel = relative(DOCS_DIR, path).replace(/\\/g, "/")
    if (REFERENCE_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue
    out.push(path)
  }
  return out
}

/**
 * 在给定文本中查找命中的禁忌词。
 * @param text 页面正文
 * @return 命中的禁忌词列表
 */
function scan(text: string): string[] {
  return FORBIDDEN.filter((word) => text.includes(word))
}

describe("文档叙事口径", () => {
  it("面向使用者的页面不含本仓纪律类表述", () => {
    const offenders: string[] = []
    for (const file of narrativeFiles()) {
      const rel = relative(process.cwd(), file).replace(/\\/g, "/")
      for (const word of scan(readFileSync(file, "utf8"))) offenders.push(`${rel}: ${word}`)
    }
    expect(offenders).toEqual([])
  })

  it("扫描函数能识别禁忌词（词表失效时本用例先红）", () => {
    expect(scan("这里把归档顺序写成核心纪律，并且你必须遵守；另建议开启统计")).toEqual([
      "核心纪律",
      "你必须",
      "建议开启",
    ])
  })
})
