// 文档示例与实现一致性：activation 页里的示例配置必须能按文档描述命中
// 期望直接调用真实实现，不在测试内重写匹配逻辑（C-17）
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { matchPathPattern } from "../scope/pattern"
import { compilePolicies, decidePolicy } from "../scope/policy"
import type { ScopeContext } from "../scope/types"

interface ActivationExample {
  include: string[]
  exclude: string[]
}

// 读取文档里第一个 json 代码块中的 activation 示例
function exampleActivation(): ActivationExample {
  const text = readFileSync("docs/config/activation.md", "utf8")
  const blocks = [...text.matchAll(/```json\n([\s\S]*?)```/g)]
  const source = blocks[0]?.[1]
  if (!source) throw new Error("docs/config/activation.md 未找到 json 示例")
  const parsed = JSON.parse(source) as { activation: ActivationExample }
  return parsed.activation
}

describe("activation 文档示例与实现一致", () => {
  const options = { baseDir: "/home/u/work", home: "/home/u" }

  it("白名单示例命中工作目录，未命中其他目录", () => {
    const activation = exampleActivation()
    expect(activation.include.some((pattern) => matchPathPattern("/home/u/work/a", pattern, options))).toBe(true)
    expect(activation.include.some((pattern) => matchPathPattern("/home/u/other", pattern, options))).toBe(false)
  })

  it("黑名单示例命中 legacy 目录，且优先级高于白名单", () => {
    const activation = exampleActivation()
    expect(activation.exclude.some((pattern) => matchPathPattern("/home/u/work/legacy/a", pattern, options))).toBe(true)
  })
})

// 读取策略 / 档案示例：第一个含 policies 的 json 块
function policyExample(): { policies: Array<Record<string, unknown>>; skillProfiles: Record<string, { allow: string[] }> } {
  const text = readFileSync("docs/config/activation.md", "utf8")
  const blocks = [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1] as string)
  const source = blocks.find((block) => block.includes('"policies"'))
  if (!source) throw new Error("docs/config/activation.md 未找到 policies 示例")
  return JSON.parse(source) as { policies: Array<Record<string, unknown>>; skillProfiles: Record<string, { allow: string[] }> }
}

describe("策略文档示例与实现一致", () => {
  const baseDir = "/home/u/work"
  const context: ScopeContext = {
    cwd: "/home/u/work/team/repo",
    baseDir: "/home/u/work/team/repo",
    skill: "fxri-plan-review",
    gitRoot: "/home/u/work/team/repo",
    gitRemote: "git@github.com:acme/repo.git",
    markers: new Set<string>(),
  }

  it("示例策略允许档案内技能，拒绝档案外技能", () => {
    const example = policyExample()
    const policies = example.policies.map((policy, index) => ({ id: `demo-${index}`, layer: "global" as const, ...policy }))
    const set = compilePolicies(policies, baseDir, { home: "/home/u", profiles: example.skillProfiles })
    expect(decidePolicy(set, context).active).toBe(true)
    expect(decidePolicy(set, { ...context, skill: "fxri-code-encoding" }).active).toBe(false)
  })

  it("文档包含策略、档案、优先级、子目录与软限制五个小节", () => {
    const text = readFileSync("docs/config/activation.md", "utf8")
    for (const heading of ["## 策略规则", "## 档案", "## 优先级与合并", "## 子目录", "## 软限制边界"]) {
      expect(text).toContain(heading)
    }
  })

  it("命令文档包含策略 / 技能快捷视图与联动提示", () => {
    const scopeDoc = readFileSync("docs/cli/scope.md", "utf8")
    expect(scopeDoc).toContain("scope allow")
    expect(scopeDoc).toContain("scope deny --skill")
    expect(scopeDoc).toContain("policy:<id>")
    const skillsDoc = readFileSync("docs/cli/skill.md", "utf8")
    expect(skillsDoc).toContain("## 策略与内容闸门")
    expect(skillsDoc).toContain("策略对该技能无效：已显式设为全文安装")
  })
})
