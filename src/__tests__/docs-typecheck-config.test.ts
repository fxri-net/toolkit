// 文档类型检查配置：防止 .vue 未被 vue-tsc 收录、生成类型退回只读断言
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

const docsRoot = join(process.cwd(), "docs")

// 递归收集 docs 下的 .vue；跳过依赖与构建产物
function walkVue(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "cache" || entry.name === "dist") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkVue(full))
    else if (entry.name.endsWith(".vue")) files.push(full)
  }
  return files
}

describe("文档类型检查配置", () => {
  it("docs tsconfig 显式包含 RuleComposer.vue", () => {
    const config = JSON.parse(readFileSync(join(docsRoot, "tsconfig.json"), "utf8")) as {
      files?: string[]
    }
    // TS 的 include 不会展开 .vue，必须有 files 显式列出
    expect(config.files).toContain(".vitepress/theme/components/RuleComposer.vue")
  })

  it("docs 下所有 .vue 都显式列入 tsconfig files", () => {
    const config = JSON.parse(readFileSync(join(docsRoot, "tsconfig.json"), "utf8")) as { files?: string[] }
    const files = config.files ?? []
    const missing = walkVue(docsRoot)
      .map((file) => relative(docsRoot, file).replace(/\\/g, "/"))
      .filter((file) => !files.includes(file))
    expect(missing, `以下 .vue 未加入 docs/tsconfig.json 的 files：${missing.join("、")}`).toEqual([])
  })

  it("生成的 RULESET 使用可变类型，不再退回 as const 只读断言", () => {
    const generated = readFileSync(join(docsRoot, ".vitepress", "theme", "components", "rules.generated.ts"), "utf8")
    expect(generated).toContain("export const RULESET: Ruleset")
    expect(generated).not.toContain("as const")
  })
})
