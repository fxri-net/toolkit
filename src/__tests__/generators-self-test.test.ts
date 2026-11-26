// 生成器与守卫自检入口：--self-test 里的假现场必须真跑一遍，避免自检代码随实现漂移后无人发现
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const scripts = [
  "scripts/check-exit-codes.mjs",
  "scripts/check-active-tasks-staged.mjs",
  "scripts/generate-exit-codes.mjs",
  "scripts/generate-upgrade-table.mjs",
  "scripts/generate-skill-dirs.mjs",
  "scripts/generate-env-table.mjs",
]

describe("脚本自检可执行", () => {
  for (const script of scripts) {
    it(`${script} --self-test 通过`, () => {
      const result = spawnSync(process.execPath, [join(process.cwd(), script), "--self-test"], { encoding: "utf8" })
      expect(result.stderr, result.stderr).toBe("")
      expect(result.status).toBe(0)
    })
  }
})
