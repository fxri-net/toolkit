import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

// 被测脚本以 process.cwd() 为仓库根，测试用临时目录模拟最小仓库结构并以子进程实跑
const script = join(process.cwd(), "scripts", "check-consistency.mjs")
const fixtures: string[] = []

const skillDoc = [
  "---",
  "name: fxri-demo",
  "metadata:",
  '  version: "1.0.0"',
  "  tier: core",
  "---",
  "",
  "# 演示技能",
  "",
  "> 本技能版本 1.0.0（随 @fxri/toolkit 同批分发）",
  "",
  "细则见 `references/task-spec.md`。",
  "",
].join("\n")

const skillTable = [
  "| 技能 | 版本 | 用途 | 层级 |",
  "| --- | --- | --- | --- |",
  "| [fxri-demo](./fxri-demo/SKILL.md) | 1.0.0 | 演示用技能 | core |",
  "",
].join("\n")

function createFixture(references: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fxri-consistency-"))
  fixtures.push(root)
  const files: Record<string, string> = {
    "skills/fxri-demo/SKILL.md": skillDoc,
    "skills/README.md": skillTable,
    "docs/guide.md": skillTable,
  }
  for (const [rel, content] of Object.entries(references)) files[rel] = content
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, "utf8")
  }
  return root
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("规范一致性：技能 references 引用", () => {
  it("SKILL 指向的 references 文件缺失时报 error", () => {
    const root = createFixture({})
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("引用的 references/task-spec.md 不存在")
  })

  it("references 文件存在时通过", () => {
    const root = createFixture({ "skills/fxri-demo/references/task-spec.md": "# 任务规范\n" })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("references 引用可解析")
  })
})
