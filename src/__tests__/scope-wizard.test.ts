// 作用域向导：菜单退出、加白 / 加黑、条目互转、默认值、清除限制与高级规则
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { setHomeDirForTest } from "../config"
import { runScopeWizard } from "../scope/wizard"

// 提示应答队列：按调用顺序消费
const answers = vi.hoisted(() => ({
  select: [] as unknown[],
  checkbox: [] as unknown[],
  input: [] as unknown[],
  confirm: [] as unknown[],
}))

vi.mock("../prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prompts")>()
  return {
    ...actual,
    loadPrompts: async () =>
      ({
        select: async () => answers.select.shift(),
        checkbox: async () => answers.checkbox.shift(),
        input: async () => answers.input.shift(),
        confirm: async () => answers.confirm.shift(),
      }) as unknown as Awaited<ReturnType<typeof actual.loadPrompts>>,
  }
})

let home = ""
let configFile = ""

function seed(activation: Record<string, unknown>): void {
  writeFileSync(configFile, `${JSON.stringify({ activation }, null, 2)}\n`)
}

function readActivation(): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(configFile, "utf8")) as { activation: Record<string, unknown> }
  return parsed.activation
}

function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true })
  Object.defineProperty(process.stdout, "isTTY", { value, configurable: true })
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-scope-wizard-"))
  configFile = join(home, ".toolkitrc.json")
  setHomeDirForTest(home)
  seed({ mode: "all", include: [], exclude: [] })
  answers.select.length = 0
  answers.checkbox.length = 0
  answers.input.length = 0
  answers.confirm.length = 0
  setTty(true)
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  setHomeDirForTest(undefined)
  rmSync(home, { recursive: true, force: true })
  vi.restoreAllMocks()
  delete (process.stdin as { isTTY?: boolean }).isTTY
  delete (process.stdout as { isTTY?: boolean }).isTTY
  process.exitCode = 0
})

describe("作用域向导菜单", () => {
  it("顶层退出不写任何配置", async () => {
    answers.select.push("global", "exit")
    await runScopeWizard()
    expect(readActivation().mode).toBe("all")
    expect(readActivation().include).toEqual([])
  })

  it("高级规则只读展示，不写配置", async () => {
    answers.select.push("global", "advanced", "exit")
    const log = vi.spyOn(console, "log")
    await runScopeWizard()
    expect(log.mock.calls.flat().join("\n")).toContain("高级规则只读")
    expect(readActivation().include).toEqual([])
  })
})

describe("名单写入", () => {
  it("加入白名单并切换默认值", async () => {
    answers.select.push("global", "add-include", "cwd", "exit")
    answers.confirm.push(true)
    await runScopeWizard()
    const activation = readActivation()
    expect(activation.mode).toBe("allowlist")
    expect(activation.include).toEqual([process.cwd()])
  })

  it("加入黑名单保持默认值", async () => {
    answers.select.push("global", "add-exclude", "cwd", "exit")
    answers.confirm.push(true)
    await runScopeWizard()
    const activation = readActivation()
    expect(activation.mode).toBe("all")
    expect(activation.exclude).toEqual([process.cwd()])
  })
})

describe("条目管理与默认值", () => {
  it("勾选条目转到另一侧", async () => {
    const target = join(home, "work")
    mkdirSync(target, { recursive: true })
    seed({ mode: "all", include: [target], exclude: [] })
    answers.select.push("global", "manage", "flip", "exit")
    answers.checkbox.push([`include::${target}`])
    answers.confirm.push(true)
    await runScopeWizard()
    const activation = readActivation()
    expect(activation.include).toEqual([])
    expect(activation.exclude).toEqual([target])
  })

  it("切换为仅名单内生效", async () => {
    answers.select.push("global", "default", "off", "exit")
    answers.confirm.push(true)
    await runScopeWizard()
    expect(readActivation().mode).toBe("allowlist")
  })

  it("清除限制清空两列表", async () => {
    seed({ mode: "allowlist", include: ["/a"], exclude: ["/b"] })
    answers.select.push("global", "reset", "exit")
    answers.confirm.push(true)
    await runScopeWizard()
    const activation = readActivation()
    expect(activation.mode).toBe("all")
    expect(activation.include).toEqual([])
    expect(activation.exclude).toEqual([])
  })
})
