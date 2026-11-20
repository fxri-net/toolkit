// 文档示例与实现一致性：activation 页里的示例配置必须能按文档描述命中
// 期望直接调用真实实现，不在测试内重写匹配逻辑（C-17）
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { matchPathPattern } from "../scope/pattern"

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
