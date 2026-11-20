// 交互基座：菜单返回 / 退出、提示 ESC 取消、写前确认、结果块与取值校验
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { assertChoice, askCheckbox, askConfirm, askInput, askSelect, confirmWrite, reportWrite, runMenu } from "../cli-ui"

// 提示应答状态：按用例改写，loadPrompts 的每个方法都从这里取值
const state = vi.hoisted(() => ({
  selectResult: undefined as unknown,
  selectCalls: [] as Array<Record<string, unknown>>,
  checkboxResult: [] as unknown,
  checkboxCalls: [] as Array<Record<string, unknown>>,
  inputResult: "",
  confirmResult: true as boolean | null,
  cancelSelect: false,
  cancelCheckbox: false,
  cancelInput: false,
  cancelConfirm: false,
}))

// inquirer 风格的取消错误
function cancelError(): Error {
  return Object.assign(new Error("User force closed the prompt"), { name: "CancelPromptError" })
}

vi.mock("../prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prompts")>()
  return {
    ...actual,
    loadPrompts: async () =>
      ({
        select: async (options: Record<string, unknown>) => {
          state.selectCalls.push(options)
          if (state.cancelSelect) throw cancelError()
          return state.selectResult
        },
        checkbox: async (options: Record<string, unknown>) => {
          state.checkboxCalls.push(options)
          if (state.cancelCheckbox) throw cancelError()
          return state.checkboxResult
        },
        input: async () => {
          if (state.cancelInput) throw cancelError()
          return state.inputResult
        },
        confirm: async () => {
          if (state.cancelConfirm) throw cancelError()
          return state.confirmResult
        },
      }) as unknown as Awaited<ReturnType<typeof actual.loadPrompts>>,
  }
})

beforeEach(() => {
  state.selectResult = undefined
  state.selectCalls.length = 0
  state.checkboxResult = []
  state.checkboxCalls.length = 0
  state.inputResult = ""
  state.confirmResult = true
  state.cancelSelect = false
  state.cancelCheckbox = false
  state.cancelInput = false
  state.cancelConfirm = false
  process.exitCode = 0
})

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = 0
})

describe("菜单", () => {
  it("顶层菜单末位为退出，选中值原样返回", async () => {
    state.selectResult = "status"
    await expect(runMenu({ message: "作用域", choices: [{ name: "查看状态", value: "status" }] })).resolves.toBe("status")
    const choices = state.selectCalls[0]?.choices as Array<{ value: string }>
    expect(choices.at(-1)?.value).toBe("exit")
  })

  it("子菜单末位为返回，ESC 返回 back", async () => {
    state.cancelSelect = true
    await expect(runMenu({ message: "目录管理", choices: [], back: true })).resolves.toBe("back")
    const choices = state.selectCalls[0]?.choices as Array<{ value: string }>
    expect(choices.at(-1)?.value).toBe("back")
  })

  it("顶层 ESC 等同退出", async () => {
    state.cancelSelect = true
    await expect(runMenu({ message: "作用域", choices: [] })).resolves.toBe("exit")
  })
})

describe("提示返回", () => {
  it("各提示按 ESC 均返回 null", async () => {
    state.cancelSelect = true
    expect(await askSelect({ message: "选择", choices: [] })).toBeNull()
    state.cancelCheckbox = true
    expect(await askCheckbox({ message: "多选", choices: [] })).toBeNull()
    state.cancelInput = true
    expect(await askInput({ message: "输入" })).toBeNull()
    state.cancelConfirm = true
    expect(await askConfirm({ message: "确认" })).toBeNull()
  })

  it("正常应答返回取值", async () => {
    state.selectResult = "a"
    state.checkboxResult = ["b"]
    state.inputResult = "text"
    state.confirmResult = false
    expect(await askSelect({ message: "选择", choices: [] })).toBe("a")
    expect(await askCheckbox({ message: "多选", choices: [] })).toEqual(["b"])
    expect(await askInput({ message: "输入" })).toBe("text")
    expect(await askConfirm({ message: "确认" })).toBe(false)
  })
})

describe("写前确认", () => {
  it("--yes 跳过确认并直接返回 true", async () => {
    state.confirmResult = false
    await expect(confirmWrite({ title: "写入", lines: ["白名单：x"], yes: true })).resolves.toBe(true)
  })

  it("--dry-run 只打印预览，不写盘", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    await expect(confirmWrite({ title: "写入", lines: ["白名单：x"], dryRun: true })).resolves.toBe(false)
    expect(log.mock.calls.flat().join("\n")).toContain("[预演] 未写入任何文件")
  })

  it("确认否与 ESC 都返回 false", async () => {
    state.confirmResult = false
    expect(await confirmWrite({ title: "写入", lines: [] })).toBe(false)
    state.confirmResult = null
    expect(await confirmWrite({ title: "写入", lines: [] })).toBe(false)
  })
})

describe("结果块与校验", () => {
  it("reportWrite 输出写入文件与变更条目", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    reportWrite({ file: "~/.toolkitrc.json", added: ["/work"], removed: ["/legacy"], mode: "allowlist" })
    const text = error.mock.calls.flat().join("\n")
    expect(text).toContain("已写入 ~/.toolkitrc.json")
    expect(text).toContain("新增：/work")
    expect(text).toContain("移除：/legacy")
    expect(text).toContain("当前：allowlist")
  })

  it("assertChoice 未传视为通过，非法值报错并置退出码 1", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(assertChoice(undefined, ["a", "b"], "--mode")).toBe(true)
    expect(assertChoice("a", ["a", "b"], "--mode")).toBe(true)
    expect(assertChoice("c", ["a", "b"], "--mode")).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(error.mock.calls.flat().join("\n")).toContain("--mode 取值须为 a / b")
  })
})
