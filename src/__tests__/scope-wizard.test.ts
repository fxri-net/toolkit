// 作用域向导：菜单退出、加白 / 加黑、条目互转、默认值、清除限制与高级规则
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { setHomeDirForTest } from "../config"
import { runScopeWizard } from "../scope/wizard"
import * as skills from "../skills"

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

// 整份配置：技能矩阵需要 skillProfiles 等段
function seedConfig(config: Record<string, unknown>): void {
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`)
}

function readConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(configFile, "utf8")) as Record<string, unknown>
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

describe("技能矩阵", () => {
  // 读取矩阵写入的唯一策略
  function matrixPolicy(): Record<string, unknown> {
    const policies = readConfig().policies as Array<Record<string, unknown>> | undefined
    expect(policies).toHaveLength(1)
    return policies![0]!
  }

  it("只允许模式写入 allowlist 技能策略", async () => {
    answers.select.push("global", "matrix", "cwd", "allowlist", "exit")
    answers.checkbox.push(["skill::fxri-plan-review"])
    answers.input.push("", "")
    answers.confirm.push(true)
    await runScopeWizard()
    const policy = matrixPolicy()
    expect(policy.name).toBe("技能矩阵")
    expect(policy.effect).toBe("allow")
    expect(policy.when).toEqual({ paths: [process.cwd()] })
    expect(policy.skills).toEqual({ mode: "allowlist", allow: ["fxri-plan-review"] })
  })

  it("全部允许模式只收集排除项", async () => {
    answers.select.push("global", "matrix", "cwd", "denylist", "exit")
    answers.checkbox.push(["skill::fxri-text-encoding"])
    answers.input.push("", "")
    answers.confirm.push(true)
    await runScopeWizard()
    expect(matrixPolicy().skills).toEqual({ mode: "denylist", deny: ["fxri-text-encoding"] })
  })

  it("只允许模式可同时勾选档案与技能", async () => {
    seedConfig({
      activation: { mode: "all", include: [], exclude: [] },
      skillProfiles: { front: { allow: ["fxri-*"] } },
    })
    answers.select.push("global", "matrix", "cwd", "allowlist", "exit")
    answers.checkbox.push(["profile::front", "skill::fxri-plan-review"])
    answers.input.push("", "")
    answers.confirm.push(true)
    await runScopeWizard()
    expect(matrixPolicy().skills).toEqual({
      mode: "allowlist",
      profiles: ["front"],
      allow: ["fxri-plan-review"],
    })
  })

  it("高级条件写入标记与远端", async () => {
    answers.select.push("global", "matrix", "cwd", "allowlist", "exit")
    answers.checkbox.push(["skill::fxri-plan-review"])
    answers.input.push("AGENTS.md", "github.com/acme/**")
    answers.confirm.push(true)
    await runScopeWizard()
    expect(matrixPolicy().when).toEqual({
      paths: [process.cwd()],
      markers: ["AGENTS.md"],
      gitRemotes: ["github.com/acme/**"],
    })
  })

  it("空场景给出提示且不写空规则", async () => {
    vi.spyOn(skills, "listPackageSkills").mockReturnValue([])
    answers.select.push("global", "matrix", "cwd", "allowlist", "exit")
    const log = vi.spyOn(console, "log")
    await runScopeWizard()
    expect(log.mock.calls.flat().join("\n")).toContain("没有可用技能或档案")
    expect(readConfig().policies).toBeUndefined()
  })

  it("ESC 从范围选择返回主菜单，不写配置", async () => {
    answers.select.push("global", "matrix", "back", "exit")
    await runScopeWizard()
    expect(readConfig().policies).toBeUndefined()
  })

  it("ESC 从模式选择返回上一层，可重新选择后继续写入", async () => {
    answers.select.push("global", "matrix", "cwd", "back", "cwd", "allowlist", "exit")
    answers.checkbox.push(["skill::fxri-plan-review"])
    answers.input.push("", "")
    answers.confirm.push(true)
    await runScopeWizard()
    expect(matrixPolicy().skills).toEqual({ mode: "allowlist", allow: ["fxri-plan-review"] })
  })

  it("未勾选技能时取消，不写配置", async () => {
    answers.select.push("global", "matrix", "cwd", "allowlist", "exit")
    answers.checkbox.push([])
    await runScopeWizard()
    expect(readConfig().policies).toBeUndefined()
  })
})
