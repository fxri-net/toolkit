// 文档类型检查配置：防止 .vue 未被 vue-tsc 收录、生成类型退回只读断言
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("文档类型检查配置", () => {
  it("docs tsconfig 显式包含 RuleComposer.vue", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "docs/tsconfig.json"), "utf8")) as {
      files?: string[]
      include?: string[]
    }
    // TS 的 include 不会展开 .vue，必须有 files 显式列出
    expect(config.files).toContain(".vitepress/theme/components/RuleComposer.vue")
    expect(config.include).toContain("**/*.vue")
  })

  it("生成的 RULESET 使用可变类型，不再退回 as const 只读断言", () => {
    const generated = readFileSync(join(process.cwd(), "docs/.vitepress/theme/components/rules.generated.ts"), "utf8")
    expect(generated).toContain("export const RULESET: Ruleset")
    expect(generated).not.toContain("as const")
  })
})
