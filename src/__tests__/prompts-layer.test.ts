// 交互层：TTY 判定、非 TTY 口径、命令层收口与统一词汇
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BACK_CHOICE, EXIT_CHOICE, INTERACTIVE_EXIT, exitOnPromptCancel, isInteractive, requireInteractive, runInteractive } from "../prompts"

// 伪 TTY：分别控制 stdin / stdout
function setTty(stdin: boolean, stdout: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value: stdin, configurable: true })
  Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true })
}

// inquirer 风格的取消错误
function cancelError(): Error {
  return Object.assign(new Error("User force closed the prompt with SIGINT"), { name: "ExitPromptError" })
}

beforeEach(() => {
  process.exitCode = 0
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (process.stdin as { isTTY?: boolean }).isTTY
  delete (process.stdout as { isTTY?: boolean }).isTTY
  process.exitCode = 0
})

describe("交互可用性", () => {
  it("stdin 与 stdout 同时为 TTY 才算可交互", () => {
    setTty(true, true)
    expect(isInteractive()).toBe(true)
    setTty(true, false)
    expect(isInteractive()).toBe(false)
    setTty(false, true)
    expect(isInteractive()).toBe(false)
    setTty(false, false)
    expect(isInteractive()).toBe(false)
  })

  it("不可交互且无等价路径时提示并以退出码 2 结束", () => {
    setTty(false, false)
    expect(requireInteractive({ action: "作用域菜单", hint: "用 scope status" })).toBe(false)
    expect(process.exitCode).toBe(INTERACTIVE_EXIT)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("当前环境不支持交互（作用域菜单）"))
  })

  it("有等价路径时静默回落，不置退出码", () => {
    setTty(false, false)
    expect(requireInteractive({ action: "usage init", hint: "用 --yes", fallback: true })).toBe(false)
    expect(process.exitCode).toBe(0)
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe("命令层交互收口", () => {
  it("取消以 130 结束进程", async () => {
    setTty(true, true)
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)
    await runInteractive(async () => {
      throw cancelError()
    })
    expect(exit).toHaveBeenCalledWith(130)
    expect(process.exitCode).toBe(130)
  })

  it("非 TTY 的输入关闭按无交互退出码结束", () => {
    setTty(false, false)
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)
    expect(exitOnPromptCancel(cancelError())).toBe(true)
    expect(exit).toHaveBeenCalledWith(INTERACTIVE_EXIT)
    expect(process.exitCode).toBe(INTERACTIVE_EXIT)
  })

  it("普通异常输出提示信息并以 1 收尾", async () => {
    await runInteractive(async () => {
      throw new Error("磁盘写入失败")
    })
    expect(console.error).toHaveBeenCalledWith("⚠️ 磁盘写入失败")
    expect(process.exitCode).toBe(1)
  })

  it("成功路径不改退出码", async () => {
    await runInteractive(async () => {})
    expect(process.exitCode).toBe(0)
  })

  it("命令自身的 catch 可用 exitOnPromptCancel 把取消收口为 130", () => {
    setTty(true, true)
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)
    expect(exitOnPromptCancel(cancelError())).toBe(true)
    expect(exit).toHaveBeenCalledWith(130)
    // 普通异常不由它处理，交回调用方按业务失败提示
    expect(exitOnPromptCancel(new Error("磁盘写入失败"))).toBe(false)
  })
})

describe("统一词汇", () => {
  it("返回与退出项的值固定，供各命令复用", () => {
    expect(BACK_CHOICE.value).toBe("back")
    expect(BACK_CHOICE.name).toBe("← 返回")
    expect(EXIT_CHOICE.value).toBe("exit")
    expect(EXIT_CHOICE.name).toBe("退出")
  })
})
