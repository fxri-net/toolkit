// 交互取消：验证取消向外传播、返回项、退出码与 ESC 返回键
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { setHomeDirForTest } from "../config"
import { askWithBack, exitOnPromptCancel, exitWithCancel, isPromptCancel } from "../prompts"
import { runScopeWizard } from "../scope/wizard"

let home = ""

// 交互应答队列：按调用顺序消费；throwAt 指定第几次 select 抛取消
const answers = vi.hoisted(() => ({
  select: [] as unknown[],
  selectCalls: [] as unknown[],
  throwAt: 0,
  cancelName: "ExitPromptError",
}))

// 构造 inquirer 风格的取消错误
function cancelError(name = "ExitPromptError"): Error {
  return Object.assign(new Error("User force closed the prompt with SIGINT"), { name })
}

vi.mock("../prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prompts")>()
  return {
    ...actual,
    loadPrompts: async () =>
      ({
        select: async (options: unknown) => {
          answers.selectCalls.push(options)
          if (answers.throwAt > 0 && answers.selectCalls.length === answers.throwAt) throw cancelError(answers.cancelName)
          return answers.select.shift()
        },
        checkbox: async () => [],
        confirm: async () => true,
        input: async () => "",
      }) as unknown as Awaited<ReturnType<typeof actual.loadPrompts>>,
  }
})

// 伪 TTY：设置生效范围要求 stdin / stdout 均为终端
function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true })
  Object.defineProperty(process.stdout, "isTTY", { value, configurable: true })
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-scope-cancel-"))
  setHomeDirForTest(home)
  answers.select.length = 0
  answers.selectCalls.length = 0
  answers.throwAt = 0
  answers.cancelName = "ExitPromptError"
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

describe("取消判定", () => {
  it("只认 inquirer 的错误名与 force closed", () => {
    expect(isPromptCancel(cancelError("ExitPromptError"))).toBe(true)
    expect(isPromptCancel(cancelError("AbortPromptError"))).toBe(true)
    expect(isPromptCancel(cancelError("CancelPromptError"))).toBe(true)
    expect(isPromptCancel(new Error("User force closed the prompt with SIGINT"))).toBe(true)
    expect(isPromptCancel(new Error("cannot cancel the transfer"))).toBe(false)
    expect(isPromptCancel(undefined)).toBe(false)
  })

  it("命中取消才以 130 结束进程", () => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true })
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)
    process.exitCode = 0
    expect(exitOnPromptCancel(new Error("普通失败"))).toBe(false)
    expect(exit).not.toHaveBeenCalled()
    expect(exitOnPromptCancel(cancelError())).toBe(true)
    expect(exit).toHaveBeenCalledWith(130)
    expect(process.exitCode).toBe(130)
  })

  it("无错误对象时也能按取消退出", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)
    process.exitCode = 0
    exitWithCancel()
    expect(exit).toHaveBeenCalledWith(130)
    expect(process.exitCode).toBe(130)
  })
})

describe("ESC 返回", () => {
  it("escape 触发提示 cancel 后返回 back，并移除监听", async () => {
    const before = process.stdin.listenerCount("keypress")
    let cancel = (): void => {}
    const prompt = Object.assign(
      new Promise<string>((_, reject) => {
        cancel = () => reject(cancelError("CancelPromptError"))
      }),
      { cancel: () => cancel() },
    )
    const task = askWithBack(() => prompt)
    process.stdin.emit("keypress", "", { name: "escape", meta: true })
    await expect(task).resolves.toEqual({ back: true })
    expect(process.stdin.listenerCount("keypress")).toBe(before)
  })

  it("普通按键不触发返回，正常应答原样返回", async () => {
    const before = process.stdin.listenerCount("keypress")
    const task = askWithBack(() => Promise.resolve("ok"))
    expect(await task).toEqual({ value: "ok" })
    expect(process.stdin.listenerCount("keypress")).toBe(before)
  })
})

describe("作用域向导取消与返回", () => {
  it("层选择按 ESC 返回并结束向导", async () => {
    answers.cancelName = "CancelPromptError"
    answers.throwAt = 1
    await expect(runScopeWizard()).resolves.toBeUndefined()
    expect(answers.selectCalls).toHaveLength(1)
  })

  it("层选择 Ctrl+C 向外抛出", async () => {
    answers.cancelName = "ExitPromptError"
    answers.throwAt = 1
    await expect(runScopeWizard()).rejects.toMatchObject({ name: "ExitPromptError" })
    expect(answers.selectCalls).toHaveLength(1)
  })

  it("主菜单取消只发起两次提示并向外抛出", async () => {
    answers.select.push("global")
    answers.cancelName = "ExitPromptError"
    answers.throwAt = 2
    await expect(runScopeWizard()).rejects.toMatchObject({ name: "ExitPromptError" })
    expect(answers.selectCalls).toHaveLength(2)
  })
})
