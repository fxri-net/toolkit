// 发布包内容：规则模块必须随 templates 分发，否则 rules compose（含 --module usage）会失效
import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

describe("发布包内容", () => {
  it("package.json 的 files 含 templates 与第三方声明，且规则模块文件齐全", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { files?: string[] }
    expect(pkg.files, "package.json files 缺少 templates").toContain("templates")
    expect(pkg.files, "package.json files 缺少 THIRD-PARTY-NOTICES.md").toContain("THIRD-PARTY-NOTICES.md")
    expect(existsSync(join(process.cwd(), "THIRD-PARTY-NOTICES.md")), "THIRD-PARTY-NOTICES.md 缺失").toBe(true)
    for (const file of ["ruleset.json", "core.md", "output.md", "workflow.md", "practices.md", "commit.md", "usage.md"]) {
      expect(existsSync(join(process.cwd(), "templates", "rules", file)), `templates/rules/${file} 缺失`).toBe(true)
    }
  })
})
