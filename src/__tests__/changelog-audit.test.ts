// 净变更审计单测：同对象多类型候选、不同对象不误报、审计不修改文件
import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { auditChangesets } from "../changelog/audit"

// 临时目录统一清理
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// 造变更集目录
function changesetDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tk-audit-"))
  tempDirs.push(dir)
  const changeset = join(dir, ".changeset")
  mkdirSync(changeset, { recursive: true })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(changeset, name), content, "utf8")
  return changeset
}

describe("auditChangesets", () => {
  it("同对象新增与修复列为候选，不同对象不误报", () => {
    const dir = changesetDir({
      "a.md": "---\n\"@fxri/toolkit\": minor\n---\n\n- 新增：`toolkit telemetry` 命令域\n",
      "b.md": "---\n\"@fxri/toolkit\": patch\n---\n\n- 修复：`toolkit telemetry` 统计错误\n",
      "c.md": "---\n\"@fxri/toolkit\": patch\n---\n\n- 修复：其他独立问题\n",
      "d.md": "---\n\"@fxri/toolkit\": patch\n---\n\n- 新增：无显式标识的描述\n",
    })
    const candidates = auditChangesets(dir)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.object).toBe("toolkit telemetry")
    expect(candidates[0]?.entries.map((entry) => entry.type).sort()).toEqual(["修复", "新增"])
  })

  it("英文前缀归一后同样参与候选", () => {
    const dir = changesetDir({
      "a.md": "---\n\"@fxri/toolkit\": minor\n---\n\n- Added: `toolkit telemetry` 命令域\n",
      "b.md": "---\n\"@fxri/toolkit\": patch\n---\n\n- Fixed: `toolkit telemetry` 统计错误\n",
    })
    expect(auditChangesets(dir)[0]?.entries.map((entry) => entry.type).sort()).toEqual(["修复", "新增"])
  })

  it("纯自然语言描述也能识别同对象候选", () => {
    const dir = changesetDir({
      "a.md": "---\n\"@fxri/toolkit\": minor\n---\n\n- 新增：技能使用遥测支持本地统计\n",
      "b.md": "---\n\"@fxri/toolkit\": patch\n---\n\n- 修复：技能使用遥测统计结果偶发重复\n",
      "c.md": "---\n\"@fxri/toolkit\": patch\n---\n\n- 修复：登录超时时间过短\n",
    })
    const candidates = auditChangesets(dir)
    expect(candidates.some((candidate) => candidate.object.startsWith("自然语言相似："))).toBe(true)
    expect(candidates.some((candidate) => candidate.object.includes("登录超时"))).toBe(false)
  })

  it("审计只读，不修改变更集文件", () => {
    const dir = changesetDir({
      "a.md": "---\n\"@fxri/toolkit\": minor\n---\n\n- 新增：`fxri-release-changelog` 净变更规则\n",
      "b.md": "---\n\"@fxri/toolkit\": patch\n---\n\n- 优化：`fxri-release-changelog` 判定边界\n",
    })
    const before = readFileSync(join(dir, "a.md"), "utf8")
    auditChangesets(dir)
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(before)
  })
})
