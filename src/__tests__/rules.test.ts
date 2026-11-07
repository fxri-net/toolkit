// 规则模块化单测：清单校验、组合顺序、锚点取值、缓存与剪贴板
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { setHomeDirForTest } from "../config"
import { composeRules, listRules, loadRuleModules, loadRuleset } from "../rules"
import { clipboardCommands, copyToClipboard } from "../rules/clipboard"
import { clearRulesSelection, readRulesSelection, rulesSelectionPath, writeRulesSelection } from "../rules/cache"
import { usageGlobalRule } from "../usage/rule"

let home = ""

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-rules-"))
  setHomeDirForTest(home)
})

afterEach(() => {
  setHomeDirForTest(undefined)
  rmSync(home, { recursive: true, force: true })
})

describe("规则清单与模块", () => {
  it("清单包含 6 个模块，id 唯一且首行锚点合法", () => {
    const ruleset = loadRuleset()
    const modules = loadRuleModules()
    expect(ruleset.modules.map((mod) => mod.id)).toEqual(["core", "output", "workflow", "env", "commit", "usage"])
    expect(modules).toHaveLength(6)
    for (const mod of modules) {
      expect(mod.anchor, `${mod.id} 锚点格式`).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
      expect(mod.body.length).toBeGreaterThan(0)
    }
  })

  it("推荐预设不含 env，完整预设等于 ai 页组合", () => {
    const ruleset = loadRuleset()
    expect(ruleset.presets.recommended).toEqual(["core", "output", "workflow"])
    const aiPage = ruleset.pages.find((page) => page.page === "ai")!
    expect(composeRules(ruleset.presets.complete!)).toBe(composeRules(aiPage.modules))
  })

  it("组合顺序按传入 id，锚点取最大值", () => {
    const text = composeRules(["usage", "core"])
    const lines = text.split("\n")
    expect(lines[0]).toContain("2026-11-08 02:21")
    expect(text.indexOf("## 技能使用情况")).toBeLessThan(text.indexOf("## 代码规范"))
    // 锚点与顺序无关
    expect(composeRules(["core", "usage"]).split("\n")[0]).toBe(lines[0])
  })

  it("重复模块保留首次位置，空选择与未知模块报错", () => {
    const text = composeRules(["output", "core", "output"])
    expect(text.indexOf("## 输出要求")).toBeLessThan(text.indexOf("## 代码规范"))
    expect(text.match(/## 输出要求/g)).toHaveLength(1)
    expect(() => composeRules([])).toThrow("至少选择一个规则模块")
    expect(() => composeRules(["absent"])).toThrow("未知规则模块「absent」")
  })

  it("--no-anchor 等价只输出正文", () => {
    const text = composeRules(["core"], { anchor: false })
    expect(text.startsWith("> 规则更新时间")).toBe(false)
    expect(text.startsWith("你是一个严谨的编程助手")).toBe(true)
  })

  it("listRules 返回预设归属与当前锚点", () => {
    const listed = listRules()
    const core = listed.modules.find((mod) => mod.id === "core")
    expect(core?.presets).toEqual(expect.arrayContaining(["minimal", "recommended", "complete", "full"]))
    expect(core?.anchor).toBe("2026-11-08 02:21")
  })
})

describe("规则组合缓存", () => {
  it("写入后往返读取，清空后不可再读", () => {
    expect(readRulesSelection()).toBeNull()
    writeRulesSelection(["workflow", "core"])
    expect(readRulesSelection()).toEqual({ schema: 1, modules: ["workflow", "core"] })
    expect(clearRulesSelection()).toBe(true)
    expect(readRulesSelection()).toBeNull()
    expect(clearRulesSelection()).toBe(false)
  })

  it("读写都去重，并剔除缓存中的未知模块 id", () => {
    writeRulesSelection(["core", "core", "output"])
    expect(readRulesSelection(["core", "output", "workflow"])).toEqual({ schema: 1, modules: ["core", "output"] })
    mkdirSync(dirname(rulesSelectionPath()), { recursive: true })
    writeFileSync(rulesSelectionPath(), JSON.stringify({ schema: 1, modules: ["core", "absent"] }), "utf8")
    expect(readRulesSelection(["core", "output"])).toEqual({ schema: 1, modules: ["core"] })
  })
  it("usage rule 模板缺失时给出可读错误", () => {
    expect(() => usageGlobalRule(join(tmpdir(), "missing-rules-dir"))).toThrow("无法读取规则模板")
  })
})

describe("剪贴板命令", () => {
  it("平台候选命令顺序固定", () => {
    expect(clipboardCommands("win32")[0]?.[0]).toBe("powershell")
    expect(clipboardCommands("darwin")).toEqual([["pbcopy"]])
    expect(clipboardCommands("linux")).toEqual([["wl-copy"], ["xclip", "-selection", "clipboard"]])
  })

  it("首个成功命令即返回；全部失败返回错误", () => {
    const success = copyToClipboard("text", "linux", (() => ({ status: 0 })) as unknown as typeof import("node:child_process").spawnSync)
    expect(success.ok).toBe(true)
    expect(success.command).toContain("wl-copy")
    const failure = copyToClipboard(
      "text",
      "linux",
      (() => ({ status: 1, error: new Error("not found") })) as unknown as typeof import("node:child_process").spawnSync,
    )
    expect(failure.ok).toBe(false)
    expect(failure.error).toContain("wl-copy")
  })
})
