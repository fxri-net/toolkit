// 上传向导三步：第 2、3 步可退回上一步，首步取消即整体退出，确认后写配置
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { setHomeDirForTest } from "../config"

const ui = vi.hoisted(() => ({
  selects: [] as unknown[],
  inputs: [] as unknown[],
  confirms: [] as unknown[],
  selectCalls: 0,
  inputCalls: 0,
  cancelled: 0,
}))

vi.mock("../cli-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cli-ui")>()
  return {
    ...actual,
    askSelectOrExit: async () => {
      ui.selectCalls += 1
      return ui.selects.shift()
    },
    askInput: async () => {
      ui.inputCalls += 1
      return ui.inputs.shift()
    },
    confirmWrite: async () => ui.confirms.shift(),
  }
})

vi.mock("../prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prompts")>()
  return {
    ...actual,
    requireInteractive: () => true,
    reportCancelled: () => {
      ui.cancelled += 1
    },
  }
})

const updateSpy = vi.hoisted(() => vi.fn())
vi.mock("../usage/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../usage/config")>()
  return { ...actual, updateUsageConfig: updateSpy }
})

import { runUploadSetup } from "../usage/upload"

let home = ""

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fxts-tk-upload-"))
  setHomeDirForTest(home)
  ui.selects.length = 0
  ui.inputs.length = 0
  ui.confirms.length = 0
  ui.selectCalls = 0
  ui.inputCalls = 0
  ui.cancelled = 0
  updateSpy.mockReset()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  setHomeDirForTest(undefined)
  rmSync(home, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe("上传向导的返回与取消", () => {
  it("第 2、3 步按 ESC 退回上一步，确认拒绝后不写配置", async () => {
    ui.selects.push("file", "webhook")
    ui.inputs.push(null, "https://a.example", null, "https://b.example", "{}")
    ui.confirms.push(false)
    await runUploadSetup({})
    expect(ui.selectCalls).toBe(2)
    expect(ui.inputCalls).toBe(5)
    expect(ui.cancelled).toBe(1)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("首步取消即整体退出，不再问后续步骤", async () => {
    ui.selects.push(null)
    await runUploadSetup({})
    expect(ui.inputCalls).toBe(0)
    expect(ui.cancelled).toBe(1)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("完整走完三步并确认后写入配置", async () => {
    ui.selects.push("file")
    ui.inputs.push("out.jsonl", "{}")
    ui.confirms.push(true)
    await runUploadSetup({})
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy.mock.calls[0]?.[0]).toMatchObject({ upload: { enabled: true, protocol: "file", endpoint: "out.jsonl" } })
  })
})
