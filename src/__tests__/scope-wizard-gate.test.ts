// 作用域向导的内容闸门入口：mock 交互 + 伪 TTY，验证开关落盘与产物刷新三路径
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { isSkillGateShell, readSkillsInstallConfig, resetSkillsRootCache } from "../skills"
import { runScopeGate } from "../scope/wizard"

// 交互应答队列：select / confirm 按调用顺序消费（vi.hoisted 保证 mock 工厂可访问）
const answers = vi.hoisted(() => ({ select: [] as string[], confirm: [] as boolean[] }))

vi.mock("../prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prompts")>()
  return {
    ...actual,
    loadPrompts: async () =>
      ({
        select: async () => answers.select.shift(),
        confirm: async () => answers.confirm.shift() ?? true,
      }) as unknown as Awaited<ReturnType<typeof actual.loadPrompts>>,
  }
})

let home = ""

// 伪 TTY：向导入口要求 stdin / stdout 均为终端
function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true })
  Object.defineProperty(process.stdout, "isTTY", { value, configurable: true })
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-wizard-gate-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  answers.select.length = 0
  answers.confirm.length = 0
  setTty(true)
  // 向导输出不进测试报告
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (process.stdin as { isTTY?: boolean }).isTTY
  delete (process.stdout as { isTTY?: boolean }).isTTY
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  rmSync(home, { recursive: true, force: true })
})

describe("scope 向导 · 内容闸门", () => {
  it("保持现状不写开关、不安装", async () => {
    answers.select.push("keep")
    await runScopeGate()
    expect(readSkillsInstallConfig().gate).toBeUndefined()
    expect(existsSync(join(home, ".agents", "skills"))).toBe(false)
  })

  it("关闭并拒绝刷新：写开关但不产生产物", async () => {
    answers.select.push("off")
    answers.confirm.push(false)
    await runScopeGate()
    expect(readSkillsInstallConfig().gate).toBe(false)
    expect(existsSync(join(home, ".agents", "skills", "fxri-plan-to-task"))).toBe(false)
  })

  it("开启并确认刷新：写入入口壳并保存开关", async () => {
    answers.select.push("on")
    answers.confirm.push(true)
    await runScopeGate()
    expect(readSkillsInstallConfig().gate).toBe(true)
    const file = join(home, ".agents", "skills", "fxri-plan-to-task", "SKILL.md")
    expect(existsSync(file)).toBe(true)
    expect(isSkillGateShell(readFileSync(file, "utf8"))).toBe(true)
  })
})
