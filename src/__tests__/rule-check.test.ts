// 规则锚点检查：模块与规则页同源、格式校验与非法现场报错
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkRuleAnchors } from "../commands/rule"

let root = ""

// 写文件：自动创建父目录
function put(rel: string, content: string): void {
  const file = join(root, rel)
  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(file, content, "utf8")
}

// 最小规则集：两个模块、两页（一页组合两模块，一页单模块）
function fixture(a?: { b?: string; pageA?: string }): void {
  put(
    "templates/rules/ruleset.json",
    JSON.stringify({
      modules: [
        { id: "a", file: "a.md" },
        { id: "b", file: "b.md" },
      ],
      pages: [
        { page: "ai", modules: ["a", "b"] },
        { page: "b", modules: ["b"] },
      ],
    }),
  )
  put("templates/rules/a.md", "> 规则更新时间 2026-11-20 10:00\n\n## A\n")
  put("templates/rules/b.md", `> 规则更新时间 ${a?.b ?? "2026-11-21 11:00"}\n\n## B\n`)
  put("docs/rules/ai.md", `# AI\n\n\`\`\`\`markdown\n> 规则更新时间 ${a?.pageA ?? "2026-11-21 11:00"}\n\n## A\n\`\`\`\`\n`)
  put("docs/rules/b.md", "> 规则更新时间 2026-11-21 11:00\n")
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tk-rule-check-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("checkRuleAnchors", () => {
  it("模块与规则页锚点一致时通过", () => {
    fixture()
    const report = checkRuleAnchors(root)
    expect(report.ok).toBe(true)
    expect(report.issues).toEqual([])
  })

  it("页面锚点落后于所含模块最大值时报错", () => {
    fixture({ pageA: "2026-11-20 10:00" })
    const report = checkRuleAnchors(root)
    expect(report.ok).toBe(false)
    expect(report.issues.some((issue) => issue.file === "docs/rules/ai.md" && issue.message.includes("最大值"))).toBe(true)
  })

  it("模块锚点格式非法时报错", () => {
    fixture({ b: "2026-11-21" })
    const report = checkRuleAnchors(root)
    expect(report.ok).toBe(false)
    expect(report.issues.some((issue) => issue.file === "templates/rules/b.md")).toBe(true)
  })

  it("规则集缺失时报错", () => {
    const report = checkRuleAnchors(root)
    expect(report.ok).toBe(false)
    expect(report.issues[0]?.file).toBe("templates/rules/ruleset.json")
  })
})
