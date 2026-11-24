// 接入向导：默认勾选、勾选记忆、非交互与预演路径（真实 TTY 多选另由 tty 测试覆盖）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { setHomeDirForTest } from "../config"
import { runSetupWizard } from "../setup"
import { inspectSetupSteps } from "../setup/steps"
import { readSetupSelection, setupSelectionPath, writeSetupSelection } from "../setup/selection"

// 交互应答与调用记录：picks 按调用顺序消费，prompts 留存每次勾选页选项
const harness = vi.hoisted(() => ({
  picks: [] as (string[] | null)[],
  prompts: [] as Array<{ choices: Array<{ value: string; checked?: boolean }> }>,
  steps: [] as string[][],
}))

// 勾选页替身：只记录选项并返回预设应答，不进入真实终端
vi.mock("../cli-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cli-ui")>()
  return {
    ...actual,
    askCheckbox: (async (options: { choices: Array<{ value: string; checked?: boolean }> }) => {
      harness.prompts.push(options)
      return harness.picks.shift() ?? null
    }) as unknown as typeof actual.askCheckbox,
  }
})

// 步骤执行替身：只记录参数，避免用例真的安装技能或写作用域
vi.mock("../setup/steps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../setup/steps")>()
  return {
    ...actual,
    runSetupStep: async (argv: string[]) => {
      harness.steps.push(argv)
    },
  }
})

const originalTty = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY }

let home = ""

// 伪 TTY：勾选页与步骤内交互都要求 stdin / stdout 均为终端
function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true })
  Object.defineProperty(process.stdout, "isTTY", { value, configurable: true })
}

// 收集 stdout，断言用户可见文案
function capture(): { logs: string[]; restore: () => void } {
  const logs: string[] = []
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  })
  return { logs, restore: () => spy.mockRestore() }
}

// 取最近一次勾选页的初始勾选状态
function checkedOfPrompt(): Record<string, boolean | undefined> {
  const prompt = harness.prompts.at(-1)
  if (!prompt) throw new Error("未进入勾选页")
  return Object.fromEntries(prompt.choices.map((choice) => [choice.value, choice.checked]))
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fxts-tk-setup-"))
  setHomeDirForTest(home)
  setTty(false)
  harness.picks.length = 0
  harness.prompts.length = 0
  harness.steps.length = 0
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  setHomeDirForTest(undefined)
  Object.defineProperty(process.stdin, "isTTY", { value: originalTty.stdin, configurable: true })
  Object.defineProperty(process.stdout, "isTTY", { value: originalTty.stdout, configurable: true })
  rmSync(home, { recursive: true, force: true })
  process.exitCode = 0
})

describe("setup 接入向导", () => {
  it("默认勾选安装 AI 技能，不默认勾选设置生效范围与开启使用统计", () => {
    const checked = Object.fromEntries(inspectSetupSteps("recommended").map((step) => [step.id, step.selected]))
    expect(checked).toEqual({ skills: true, rules: true, scope: false, usage: false })
  })

  it("非 TTY 且未给 --yes：提示改用 --yes 并以 2 退出", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    const out = capture()
    await runSetupWizard({})
    expect(process.exitCode).toBe(2)
    expect(err.mock.calls.flat().join(" ")).toContain("--yes")
    expect(out.logs.join("\n")).not.toContain("将执行")
  })

  it("--yes --dry-run：只预览无交互步骤，不含设置生效范围与开启使用统计", async () => {
    const out = capture()
    await runSetupWizard({ yes: true, dryRun: true, skills: "global", rules: "full" })
    const text = out.logs.join("\n")
    expect(text).toContain("将执行")
    expect(text).toContain("安装 AI 技能")
    expect(text).toContain("--preset full")
    expect(text).not.toContain("设置生效范围")
    expect(text).not.toContain("开启使用统计")
  })

  it("--yes 不受勾选记忆影响：范围与统计仍不执行", async () => {
    writeSetupSelection(["skills", "scope", "usage"])
    const out = capture()
    await runSetupWizard({ yes: true, dryRun: true })
    const text = out.logs.join("\n")
    expect(text).not.toContain("设置生效范围")
    expect(text).not.toContain("开启使用统计")
  })

  it("--no-scope --no-usage 与显式勾选口径一致：不出现对应步骤", async () => {
    const out = capture()
    await runSetupWizard({ yes: true, dryRun: true, skills: "global", scope: false, usage: false })
    const text = out.logs.join("\n")
    expect(text).toContain("安装 AI 技能")
    expect(text).not.toContain("设置生效范围")
    expect(text).not.toContain("开启使用统计")
  })

  it("勾选技能与规则后进交互：交互参数不带 --yes / --preset，零交互参数保留默认值", () => {
    const steps = inspectSetupSteps("recommended")
    const skills = steps.find((step) => step.id === "skills")
    const rules = steps.find((step) => step.id === "rules")
    expect(skills?.interactive).toBe(true)
    expect(skills?.argv).toEqual(["skill", "install"])
    expect(skills?.argvYes).toEqual(["skill", "install", "--yes"])
    expect(rules?.interactive).toBe(true)
    expect(rules?.argv).toEqual(["rule", "compose", "--copy"])
    expect(rules?.argvYes).toEqual(["rule", "compose", "--preset", "recommended", "--copy", "--no-cache"])
  })

  it("显式指定 --rules 时按预设直接组合，不再进模块选择", () => {
    const rules = inspectSetupSteps("full", true).find((step) => step.id === "rules")
    expect(rules?.argv).toEqual(["rule", "compose", "--preset", "full", "--copy"])
  })
})

describe("setup 勾选记忆", () => {
  it("写入后读回四项完整状态，未勾选记为 false", () => {
    writeSetupSelection(["skills", "usage"])
    expect(existsSync(setupSelectionPath())).toBe(true)
    expect(readSetupSelection()).toEqual({ skills: true, rules: false, scope: false, usage: true })
  })

  it("文件缺失、JSON 非法或结构不符时忽略并告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(readSetupSelection()).toBeNull()
    mkdirSync(dirname(setupSelectionPath()), { recursive: true })
    writeFileSync(setupSelectionPath(), "{not json")
    expect(readSetupSelection()).toBeNull()
    writeFileSync(setupSelectionPath(), JSON.stringify({ schema: 2, selected: { skills: false } }))
    expect(readSetupSelection()).toBeNull()
    writeFileSync(setupSelectionPath(), JSON.stringify({ schema: 1, selected: [] }))
    expect(readSetupSelection()).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it("交互勾选页以上次记忆为初始勾选，确认后写入新选择", async () => {
    setTty(true)
    writeSetupSelection(["scope"])
    harness.picks.push(["skills", "scope"])
    capture()
    await runSetupWizard({})
    expect(checkedOfPrompt()).toEqual({ skills: false, rules: false, scope: true, usage: false })
    expect(readSetupSelection()).toEqual({ skills: true, rules: false, scope: true, usage: false })
    expect(harness.steps).toEqual([["skill", "install"], ["scope"]])
  })

  it("dry-run 与 ESC 取消不更新记忆", async () => {
    setTty(true)
    writeSetupSelection(["skills"])
    harness.picks.push(["skills", "scope"])
    capture()
    await runSetupWizard({ dryRun: true })
    expect(readSetupSelection()).toEqual({ skills: true, rules: false, scope: false, usage: false })
    harness.picks.push(null)
    await runSetupWizard({})
    expect(readSetupSelection()).toEqual({ skills: true, rules: false, scope: false, usage: false })
  })

  it("显式参数覆盖记忆勾选", async () => {
    setTty(true)
    writeSetupSelection(["skills", "scope", "usage"])
    harness.picks.push([])
    capture()
    await runSetupWizard({ skills: "project", scope: false, usage: false })
    expect(checkedOfPrompt()).toEqual({ skills: true, rules: false, scope: false, usage: false })
  })
})
