// usage init 步骤机：前进、ESC 回上一步与取消传播
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { loadUsageConfig } from "../usage/config"
import { runUsageInitInteractive, runUsageInteractive } from "../usage/interactive"

// 调用计数：用于断言某一步被重新提问
const calls = vi.hoisted(() => ({
  trigger: 0,
  backOnTrigger: false,
  selectMessages: [] as string[],
}))

// inquirer 风格的取消错误
function cancelError(): Error {
  return Object.assign(new Error("Prompt was canceled"), { name: "CancelPromptError" })
}

// 可被 ESC 取消的待定提示：暴露 cancel() 供 askWithBack 调用
function pendingConfirm(): Promise<boolean> {
  let rejectFn: (error: unknown) => void = () => {}
  const promise = new Promise<boolean>((_, reject) => {
    rejectFn = reject
  })
  Object.assign(promise, { cancel: () => rejectFn(cancelError()) })
  setTimeout(() => process.stdin.emit("keypress", "", { name: "escape", meta: true }), 0)
  return promise
}

vi.mock("../prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prompts")>()
  return {
    ...actual,
    loadPrompts: async () =>
      ({
        select: async (options: { message?: string; default?: unknown; choices?: Array<{ value: unknown }> }) => {
          calls.selectMessages.push(String(options.message ?? ""))
          // 顶层菜单选「退出」，避免用例里循环回菜单
          if (String(options.message ?? "") === "技能使用情况") return "exit"
          return options.default ?? options.choices?.[0]?.value
        },
        checkbox: async () => [],
        input: async (options: { default?: unknown }) => String(options.default ?? ""),
        confirm: (options: { message?: string; default?: unknown }) => {
          if (String(options.message ?? "").includes("采集触发词")) {
            calls.trigger += 1
            // 用例显式要求时，第一次按 ESC 退出该步
            if (calls.backOnTrigger && calls.trigger === 1) return pendingConfirm()
          }
          return Promise.resolve(Boolean(options.default))
        },
      }) as unknown as Awaited<ReturnType<typeof actual.loadPrompts>>,
  }
})

let home = ""

// 伪 TTY：向导要求 stdin / stdout 均为终端
function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true })
  Object.defineProperty(process.stdout, "isTTY", { value, configurable: true })
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fxts-tk-usage-steps-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  calls.trigger = 0
  calls.backOnTrigger = false
  calls.selectMessages.length = 0
  setTty(true)
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (process.stdin as { isTTY?: boolean }).isTTY
  delete (process.stdout as { isTTY?: boolean }).isTTY
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  rmSync(home, { recursive: true, force: true })
  process.exitCode = 0
})

describe("usage init 步骤机", () => {
  it("逐步前进并写入配置", async () => {
    await runUsageInitInteractive()
    const config = loadUsageConfig()
    expect(config.enabled).toBe(true)
    expect(config.channel).toBe("rule")
    expect(config.sources.thirdParty).toBe(true)
    expect(calls.trigger).toBe(1)
    expect(calls.selectMessages).toContain("采集通道")
  })

  it("ESC 回到上一步并重新提问，而不是放弃整个向导", async () => {
    calls.backOnTrigger = true
    await runUsageInitInteractive()
    // 第一次触发词确认被 ESC 取消，随后重新提问一次
    expect(calls.trigger).toBe(2)
    expect(loadUsageConfig().enabled).toBe(true)
  })

  it("菜单顶层选「退出」：不改任何配置", async () => {
    await runUsageInteractive()
    expect(loadUsageConfig().enabled).toBe(false)
  })
})
