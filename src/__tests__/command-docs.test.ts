// 命令总览对照脚本单测：已移除命令能被发现、内建命令放行、缺表报错
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { check } from "../../scripts/check-command-docs.mjs"

const REGISTRY = `export const COMMAND_REGISTRY = [
  { path: "rule", stage: "current" },
  { path: "rule sync", stage: "current" },
  { path: "skill", stage: "current" },
  { path: "skill reconcile", stage: "current" },
  { path: "future", stage: "planned" },
]`

const docs = (row: string) => `# CLI\n\n## 命令总览\n\n| 命令 | 用途 | 常用子命令 | 分页 |\n| --- | --- | --- | --- |\n${row}\n\n## 下一节\n`

describe("命令总览对照", () => {
  it("文档命令均存在时通过", () => {
    const result = check(REGISTRY, docs("| `toolkit rule` | 规则 | `sync` | — |"))
    expect(result.ok).toBe(true)
    expect(result.count).toBe(2)
  })

  it("已移除的子命令被报错", () => {
    const result = check(REGISTRY, docs("| `toolkit rule` | 规则 | `list` | — |"))
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain("未注册的命令「rule list」")
  })

  it("planned 命令不算已注册", () => {
    const result = check(REGISTRY, docs("| `toolkit future` | 未来 | — | — |"))
    expect(result.ok).toBe(false)
  })

  it("help 内建命令放行", () => {
    const result = check(REGISTRY, docs("| `toolkit help` | 帮助 | — | — |"))
    expect(result.ok).toBe(true)
  })

  it("缺少命令总览表时报错", () => {
    const result = check(REGISTRY, "# CLI\n\n## 其他\n")
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain("未找到")
  })

  it("真实文档与注册表一致", () => {
    const root = process.cwd()
    const result = check(
      readFileSync(join(root, "src", "command-registry.ts"), "utf8"),
      readFileSync(join(root, "docs", "cli.md"), "utf8"),
    )
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })
})
