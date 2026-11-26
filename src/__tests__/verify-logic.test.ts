// 构建触发面：测试文件不触发构建，源码、构建配置与 tsconfig 仍触发
import { describe, expect, it } from "vitest"
import { touchesBuild } from "../../scripts/verify-logic.mjs"

describe("verify 构建触发面", () => {
  it("测试文件不触发构建", () => {
    for (const name of ["src/__tests__/trash.test.ts", "src/skills/__tests__/helper.ts", "src/foo.test.ts"]) {
      expect(touchesBuild(name), name).toBe(false)
    }
  })

  it("源码、构建配置与 tsconfig 触发构建", () => {
    for (const name of [
      "src/index.ts",
      "src/trash/store.ts",
      "package.json",
      "pnpm-lock.yaml",
      "tsup.config.ts",
      "tsup.dev.config.ts",
      "tsconfig.json",
      "tsconfig.typecheck.json",
    ]) {
      expect(touchesBuild(name), name).toBe(true)
    }
  })

  it("文档、技能、任务区与脚本不触发构建", () => {
    for (const name of ["docs/cli.md", "skills/README.md", "README.md", ".tasks/active/x.md", "scripts/verify.mjs"]) {
      expect(touchesBuild(name), name).toBe(false)
    }
  })
})
