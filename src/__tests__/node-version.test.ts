// 运行时下限单源：engines 是发布声明（C-46），源码常量与冒烟脚本都必须与它一致
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { MIN_NODE } from "../node-version"

describe("运行时下限单源", () => {
  it("engines.node 与 MIN_NODE 一致", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { engines?: { node?: string } }
    const matched = /(\d+)\.(\d+)/.exec(pkg.engines?.node ?? "")
    expect(matched, "package.json 缺少 engines.node").not.toBeNull()
    expect(Number(matched?.[1])).toBe(MIN_NODE.major)
    expect(Number(matched?.[2])).toBe(MIN_NODE.minor)
  })
})
