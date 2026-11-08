#!/usr/bin/env node
// 生成文档站规则数据模块：避免 ?raw 导入在部分 IDE 中无法识别
import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const rulesDir = join(root, "templates", "rules")
const outFile = join(root, "docs", ".vitepress", "theme", "components", "rules.generated.ts")
const ruleset = JSON.parse(readFileSync(join(rulesDir, "ruleset.json"), "utf8"))
const modules = Object.fromEntries(
  ruleset.modules.map((mod) => [mod.id, readFileSync(join(rulesDir, mod.file), "utf8").replace(/\r\n/g, "\n")]),
)
const content = `// 由 scripts/generate-docs-rules.mjs 生成，请勿手改
// 修改 templates/rules 后运行 pnpm sync:docs-rules 重新生成
export interface Ruleset {
  schema: number
  modules: Array<{ id: string; title: string; summary: string; file: string }>
  presets: Record<string, string[]>
  pages: Array<{ page: string; modules: string[] }>
}

export const RULESET: Ruleset = ${JSON.stringify(ruleset, null, 2)}

export const RULE_MODULES: Record<string, string> = ${JSON.stringify(modules, null, 2)}
`

const check = process.argv.includes("--check")
const current = (() => {
  try {
    return readFileSync(outFile, "utf8").replace(/\r\n/g, "\n")
  } catch {
    return null
  }
})()

if (check) {
  if (current !== content) {
    console.error("⚠️ 文档规则数据模块未同步：运行 pnpm sync:docs-rules")
    process.exit(1)
  }
  console.log("文档规则数据模块已同步")
} else {
  // 先写临时文件再改名：多终端同时启动 docs:dev 时避免读到半截内容
  const tmp = `${outFile}.tmp`
  writeFileSync(tmp, content, "utf8")
  renameSync(tmp, outFile)
  console.log(`已生成：${outFile}`)
}
