// 作用域快照缓存守卫：resolveScope 在同一进程内复用编译结果，测试改写配置后必须重置，
// 否则用例之间会读到旧快照；本文件扫描同目录源码，拦住新测试漏调用 resetScopeCache
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const TEST_DIR = join(process.cwd(), "src", "__tests__")
// 直接消费进程内快照的入口（resolveScopeProjected 绕过缓存，不在约束内）
const USES_SCOPE = /resolveScope\(|loadActivation\(/
const RESETS_SCOPE = /resetScopeCache\(/

describe("作用域快照缓存重置", () => {
  it("使用 resolveScope / loadActivation 的测试文件都重置了快照缓存", () => {
    const offenders: string[] = []
    for (const file of readdirSync(TEST_DIR).filter((name) => name.endsWith(".ts"))) {
      const source = readFileSync(join(TEST_DIR, file), "utf8")
      if (USES_SCOPE.test(source) && !RESETS_SCOPE.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
