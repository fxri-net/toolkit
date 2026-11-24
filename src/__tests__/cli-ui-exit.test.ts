// 交互基座的首步 / 子流程出口：末位补「退出」或「← 返回」，选中与 ESC 同口径返回 null
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  selectAnswers: [] as unknown[],
  checkboxAnswers: [] as unknown[],
  selectCalls: [] as Array<{ choices: Array<{ name: string; value: string }> }>,
  checkboxCalls: [] as Array<{ choices: Array<{ name: string; value: string }> ; message: string }>,
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
        checkbox: async (options: { choices: Array<{ name: string; value: string }>; message: string }) => {
          state.checkboxCalls.push(options)
          return state.checkboxAnswers.shift()
        },
        input: async () => "",
        confirm: async () => true,
      }) as never,
  }
})

import { askCheckboxBack, askCheckboxOrExit, askSelectBack, askSelectOrExit } from "../cli-ui"

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

  it("多选末位补「退出」，勾了退出即整体取消", async () => {
    state.checkboxAnswers.push(["a", "exit"])
    await expect(askCheckboxOrExit({ message: "多选", choices: [{ name: "a", value: "a" }] })).resolves.toBeNull()
    expect(state.checkboxCalls[0]?.choices.at(-1)?.value).toBe("exit")
  })

  it("多选正常值剔除哨兵后返回", async () => {
    state.checkboxAnswers.push(["a"])
    await expect(askCheckboxOrExit({ message: "多选", choices: [{ name: "a", value: "a" }] })).resolves.toEqual(["a"])
  })
})

describe("子流程出口", () => {
  it("单选末位补「← 返回」，选中即回上一步", async () => {
    state.selectAnswers.push("back")
    await expect(askSelectBack({ message: "选一个", choices: [{ name: "a", value: "a" }] })).resolves.toBeNull()
    expect(state.selectCalls[0]?.choices.at(-1)?.name).toBe("← 返回")
  })

  it("多选末位补「← 返回」，勾了返回即回上一步", async () => {
    state.checkboxAnswers.push(["back"])
    await expect(askCheckboxBack({ message: "多选", choices: [{ name: "a", value: "a" }] })).resolves.toBeNull()
    expect(state.checkboxCalls[0]?.choices.at(-1)?.value).toBe("back")
  })

  it("多选未带操作提示时由基座补齐", async () => {
    state.checkboxAnswers.push([])
    await askCheckboxBack({ message: "多选", choices: [{ name: "a", value: "a" }] })
    expect(state.checkboxCalls[0]?.message).toContain("空格切换")
  })
})
