// 提交规则显式同步：无差异 / 有差异 / 预演不写盘 / 不存在时创建
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { inspectRuleSync, RULE_SYNC_TARGET, ruleSyncBody, writeRuleSync } from "../rules/sync"

let cwd = ""

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "fxts-tk-rule-sync-"))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

function target(): string {
  return join(cwd, RULE_SYNC_TARGET)
}

describe("提交规则显式同步", () => {
  it("文件不存在：检查只报缺失，不写盘", () => {
    const state = inspectRuleSync(cwd)
    expect(state.exists).toBe(false)
    expect(state.upToDate).toBe(false)
    expect(() => readFileSync(target(), "utf8")).toThrow()
  })

  it("写入后无差异，重复同步零改动", () => {
    writeRuleSync(inspectRuleSync(cwd))
    const before = readFileSync(target(), "utf8")
    const state = inspectRuleSync(cwd)
    expect(state.exists).toBe(true)
    expect(state.upToDate).toBe(true)
    expect(state.handEdited).toBe(false)
    expect(state.added + state.removed).toBe(0)
    writeRuleSync(state)
    expect(readFileSync(target(), "utf8")).toBe(before)
  })

  it("正文与规则模块一致且不含更新时间锚点，生成标记不进正文", () => {
    writeRuleSync(inspectRuleSync(cwd))
    const text = readFileSync(target(), "utf8")
    expect(text).toContain("generated_by: \"@fxri/toolkit ")
    expect(text).toContain("<!-- 由 toolkit 生成")
    expect(text).not.toContain("规则更新时间")
    const state = inspectRuleSync(cwd)
    expect(state.body).toBe(ruleSyncBody())
  })

  it("有差异时给出差异摘要与 patch，手改按摘要识别", () => {
    writeRuleSync(inspectRuleSync(cwd))
    writeFileSync(target(), `${readFileSync(target(), "utf8")}\n- 手改行\n`, "utf8")
    const state = inspectRuleSync(cwd)
    expect(state.upToDate).toBe(false)
    expect(state.handEdited).toBe(true)
    expect(state.removed).toBeGreaterThan(0)
    expect(state.patch).toContain("---")
  })

  it("无生成标记的旧文件按手改处理，不默认覆盖", () => {
    mkdirSync(dirname(target()), { recursive: true })
    writeFileSync(target(), "---\nalwaysApply: true\nscene: git_message\n---\n\n## 提交信息规则\n\n- 旧内容\n", "utf8")
    const state = inspectRuleSync(cwd)
    expect(state.currentVersion).toBeNull()
    expect(state.handEdited).toBe(true)
  })
})
