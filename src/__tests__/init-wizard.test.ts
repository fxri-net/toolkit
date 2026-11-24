// 接入向导：非交互与预演路径（交互多选在真实 TTY 由 tty 测试覆盖）
import { afterEach, describe, expect, it, vi } from "vitest"
import { runInitWizard } from "../init"

// 收集 stdout，断言用户可见文案
function capture(): { logs: string[]; restore: () => void } {
  const logs: string[] = []
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  })
  return { logs, restore: () => spy.mockRestore() }
}

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = 0
})

describe("init 接入向导", () => {
  it("非 TTY 且未给 --yes：提示改用 --yes 并以 2 退出", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    const out = capture()
    await runInitWizard({})
    expect(process.exitCode).toBe(2)
    expect(err.mock.calls.flat().join(" ")).toContain("--yes")
    expect(out.logs.join("\n")).not.toContain("将执行")
  })

  it("--yes --dry-run：只预览无交互步骤，不含设置生效范围与开启使用统计", async () => {
    const out = capture()
    await runInitWizard({ yes: true, dryRun: true, skills: "global", rules: "full" })
    const text = out.logs.join("\n")
    expect(text).toContain("将执行")
    expect(text).toContain("安装 AI 技能")
    expect(text).toContain("--preset full")
    expect(text).not.toContain("设置生效范围")
    expect(text).not.toContain("开启使用统计")
  })

  it("--no-scope --no-usage 与显式勾选口径一致：不出现对应步骤", async () => {
    const out = capture()
    await runInitWizard({ yes: true, dryRun: true, skills: "global", scope: false, usage: false })
    const text = out.logs.join("\n")
    expect(text).toContain("安装 AI 技能")
    expect(text).not.toContain("设置生效范围")
    expect(text).not.toContain("开启使用统计")
  })
})
