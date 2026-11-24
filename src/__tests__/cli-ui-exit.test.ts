// 交互基座的出口口径：单选末位补「退出 / ← 返回」；多选不设出口项，改由提示文案声明 ESC 语义
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  selectAnswers: [] as unknown[],
  checkboxAnswers: [] as unknown[],
  selectCalls: [] as Array<{ choices: Array<{ name: string; value: string }> }>,
  checkboxCalls: [] as Array<{ choices: unknown[]; message: string }>,
}))

vi.mock("../prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prompts")>()
  return {
    ...actual,
    loadPrompts: async () =>
      ({
        select: async (options: { choices: Array<{ name: string; value: string }> }) => {
          state.selectCalls.push(options)
          return state.selectAnswers.shift()
        },
        checkbox: async (options: { choices: unknown[]; message: string }) => {
          state.checkboxCalls.push(options)
          const next = state.checkboxAnswers.shift()
          // 用 CancelPromptError 模拟 ESC：askWithBack 据此折成「返回上一级」
          if (next instanceof Error) throw next
          return next
        },
        input: async () => "",
        confirm: async () => true,
      }) as never,
  }
})

import { askCheckbox, askSelectBack, askSelectOrExit } from "../cli-ui"

// 构造 ESC 取消错误：名称与 inquirer 内部一致
function cancelError(): Error {
  const error = new Error("cancel")
  error.name = "CancelPromptError"
  return error
}

beforeEach(() => {
  state.selectAnswers.length = 0
  state.checkboxAnswers.length = 0
  state.selectCalls.length = 0
  state.checkboxCalls.length = 0
})

describe("首步出口", () => {
  it("单选末位补「退出」，选中即返回 null", async () => {
    state.selectAnswers.push("exit")
    await expect(askSelectOrExit({ message: "选一个", choices: [{ name: "a", value: "a" }] })).resolves.toBeNull()
    expect(state.selectCalls[0]?.choices.at(-1)?.value).toBe("exit")
  })

  it("单选正常值原样返回", async () => {
    state.selectAnswers.push("a")
    await expect(askSelectOrExit({ message: "选一个", choices: [{ name: "a", value: "a" }] })).resolves.toBe("a")
  })
})

describe("子流程出口", () => {
  it("单选末位补「← 返回」，选中即回上一步", async () => {
    state.selectAnswers.push("back")
    await expect(askSelectBack({ message: "选一个", choices: [{ name: "a", value: "a" }] })).resolves.toBeNull()
    expect(state.selectCalls[0]?.choices.at(-1)?.name).toBe("← 返回")
  })
})

describe("多选出口", () => {
  it("选项列表不追加出口项，避免全选键把出口一并勾上", async () => {
    state.checkboxAnswers.push(["a"])
    await expect(askCheckbox({ message: "多选", choices: [{ name: "a", value: "a" }], escape: "back" })).resolves.toEqual(["a"])
    expect(state.checkboxCalls[0]?.choices).toHaveLength(1)
  })

  it("escape=back 在提示里声明 ESC 返回上一步", async () => {
    state.checkboxAnswers.push([])
    await askCheckbox({ message: "多选", choices: [{ name: "a", value: "a" }], escape: "back" })
    expect(state.checkboxCalls[0]?.message).toBe("多选（空格切换，回车确认）；ESC 返回上一步")
  })

  it("escape=cancel 在提示里声明 ESC 取消", async () => {
    state.checkboxAnswers.push([])
    await askCheckbox({ message: "多选", choices: [{ name: "a", value: "a" }], escape: "cancel" })
    expect(state.checkboxCalls[0]?.message).toBe("多选（空格切换，回车确认）；ESC 取消")
  })

  it("未指定 escape 时只补操作提示", async () => {
    state.checkboxAnswers.push([])
    await askCheckbox({ message: "多选", choices: [{ name: "a", value: "a" }] })
    expect(state.checkboxCalls[0]?.message).toBe("多选（空格切换，回车确认）")
  })

  it("提示里已声明 ESC 语义时不重复追加", async () => {
    state.checkboxAnswers.push([])
    await askCheckbox({ message: "多选（ESC 返回上一步）", choices: [{ name: "a", value: "a" }], escape: "back" })
    expect(state.checkboxCalls[0]?.message).toBe("多选（ESC 返回上一步）")
  })

  it("ESC 返回 null，由调用方决定回上一步还是取消", async () => {
    state.checkboxAnswers.push(cancelError())
    await expect(askCheckbox({ message: "多选", choices: [{ name: "a", value: "a" }], escape: "cancel" })).resolves.toBeNull()
  })
})
