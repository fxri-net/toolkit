// 规则模块化单测：清单校验、组合顺序、锚点取值、缓存与剪贴板
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { setHomeDirForTest } from "../config"
import { composeRules, listRules, loadRuleModules, loadRuleset } from "../rules"
import { CLIP_FILE_ENV, clipboardCommands, copyToClipboard } from "../rules/clipboard"
import { clearRulesSelection, readRulesSelection, rulesSelectionPath, writeRulesSelection } from "../rules/cache"
import { CUSTOM_PRESET, defaultPreset } from "../rules/select"
import { tempDir } from "./helpers"

let home = ""

beforeEach(() => {
  home = tempDir("fxts-tk-rules-")
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
    expect(ruleset.modules.map((mod) => mod.id)).toEqual(["core", "output", "workflow", "preferences", "commit", "usage"])
    expect(modules).toHaveLength(6)
    for (const mod of modules) {
      expect(mod.anchor, `${mod.id} 锚点格式`).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
      expect(mod.body.length).toBeGreaterThan(0)
    }
  })

  it("极简预设含工作流与可裁剪偏好，推荐预设含可裁剪偏好与提交信息", () => {
    const ruleset = loadRuleset()
    expect(ruleset.presets.minimal?.modules).toEqual(["workflow", "preferences"])
    expect(ruleset.presets.recommended?.modules).toEqual(["core", "output", "workflow", "preferences", "commit"])
    expect(ruleset.presets.complete).toBeUndefined()
    // 预设说明供交互与文档派生：显示名非空，说明写清适合谁
    for (const [name, preset] of Object.entries(ruleset.presets)) {
      expect(preset.label, `预设 ${name} 缺少显示名`).not.toBe("")
      expect(preset.summary, `预设 ${name} 缺少说明`).not.toBe("")
    }
  })

  it("组合顺序按传入 id，锚点取最大值", () => {
    const text = composeRules(["usage", "core"])
    const lines = text.split("\n")
    // 期望值取参与模块真源的锚点最大值：锚点随规则变更递增，不在测试里写死具体时刻
    const anchors = loadRuleModules()
      .filter((mod) => mod.id === "usage" || mod.id === "core")
      .map((mod) => mod.anchor)
      .sort()
    expect(lines[0]).toContain(anchors[anchors.length - 1])
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

  it("可裁剪偏好单独组合以二级标题开头，旧 id practices 仍可用", () => {
    expect(composeRules(["preferences"], { anchor: false }).startsWith("## 可裁剪偏好")).toBe(true)
    expect(composeRules(["practices"], { anchor: false }).startsWith("## 可裁剪偏好")).toBe(true)
  })

  it("listRules 返回预设归属与当前锚点", () => {
    const listed = listRules()
    const workflow = listed.modules.find((mod) => mod.id === "workflow")
    const preferences = listed.modules.find((mod) => mod.id === "preferences")
    const core = listed.modules.find((mod) => mod.id === "core")
    const coreAnchor = loadRuleModules().find((mod) => mod.id === "core")?.anchor
    expect(workflow?.presets).toEqual(expect.arrayContaining(["minimal", "recommended", "full"]))
    expect(preferences?.presets).toEqual(expect.arrayContaining(["minimal", "recommended", "full"]))
    expect(core?.presets).toEqual(expect.arrayContaining(["recommended", "full"]))
    expect(core?.anchor).toBe(coreAnchor)
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

  it("旧模块 id practices 自动迁移为 preferences 并回写缓存", () => {
    mkdirSync(dirname(rulesSelectionPath()), { recursive: true })
    writeFileSync(rulesSelectionPath(), JSON.stringify({ schema: 1, modules: ["workflow", "practices"] }), "utf8")
    expect(readRulesSelection(["workflow", "preferences"])).toEqual({ schema: 1, modules: ["workflow", "preferences"] })
    const persisted = JSON.parse(readFileSync(rulesSelectionPath(), "utf8")) as { modules: string[] }
    expect(persisted.modules).toEqual(["workflow", "preferences"])
  })

  it("记录预设名，自定义组合不残留旧预设", () => {
    writeRulesSelection(["workflow"], "minimal")
    expect(readRulesSelection()).toEqual({ schema: 1, modules: ["workflow"], preset: "minimal" })
    writeRulesSelection(["workflow", "core"])
    expect(readRulesSelection()).toEqual({ schema: 1, modules: ["workflow", "core"] })
  })

  it("交互默认预设：缓存预设仍存在时沿用，否则自定义或推荐", () => {
    const presets = loadRuleset().presets
    const custom = { modules: ["workflow"] }
    const withPreset = { modules: ["workflow"], preset: "minimal" }
    const stalePreset = { modules: ["workflow"], preset: "absent" }
    expect(defaultPreset(null, presets)).toBe("recommended")
    expect(defaultPreset(custom, presets)).toBe(CUSTOM_PRESET)
    expect(defaultPreset(withPreset, presets)).toBe("minimal")
    // 预设已从清单移除时回落到自定义
    expect(defaultPreset(stalePreset, presets)).toBe(CUSTOM_PRESET)
  })
})

describe("剪贴板命令", () => {
  it("平台候选命令顺序固定", () => {
    expect(clipboardCommands("win32")[0]?.[0]).toBe("powershell")
    // clip 走 ANSI 通道会乱码，不再作为兜底
    expect(clipboardCommands("win32")).toHaveLength(1)
    expect(clipboardCommands("darwin")).toEqual([["pbcopy"]])
    expect(clipboardCommands("linux")).toEqual([["wl-copy"], ["xclip", "-selection", "clipboard"]])
  })

  it("Windows 经 UTF-8 临时文件传给 PowerShell，调用后清理", () => {
    let capturedText = ""
    let capturedPath = ""
    const fake = ((_command: string, _args: string[], options: { env?: NodeJS.ProcessEnv }) => {
      capturedPath = options.env?.[CLIP_FILE_ENV] ?? ""
      capturedText = readFileSync(capturedPath, "utf8")
      return { status: 0 }
    }) as unknown as typeof import("node:child_process").spawnSync
    const result = copyToClipboard("规则更新时间：2026-11-21 中文", "win32", fake)
    expect(result.ok).toBe(true)
    expect(result.label).toBe("powershell")
    expect(result.command).toContain("powershell")
    expect(capturedText).toBe("规则更新时间：2026-11-21 中文")
    expect(existsSync(capturedPath)).toBe(false)
  })

  it("首个成功命令即返回；全部失败返回错误", () => {
    const success = copyToClipboard("text", "linux", (() => ({ status: 0 })) as unknown as typeof import("node:child_process").spawnSync)
    expect(success.ok).toBe(true)
    expect(success.label).toBe("wl-copy")
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
