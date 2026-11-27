// 破坏性删除门禁：命中裸递归删除时给出 safeRemoveArtifact 修复提示
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { tempDir } from "./helpers"

const script = join(process.cwd(), "scripts", "check-destructive-fs.mjs")
const fixtures: string[] = []

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("破坏性删除门禁的修复提示", () => {
  it("命中裸递归删除时失败并给出 safeRemoveArtifact 示例", () => {
    const root = tempDir("fxts-tk-destructive-")
    fixtures.push(root)
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, "src", "bad.ts"), 'rmSync(dir, { recursive: true })\n', "utf8")
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("src/bad.ts:1")
    expect(result.stderr).toContain("safeRemoveArtifact")
  })
})
