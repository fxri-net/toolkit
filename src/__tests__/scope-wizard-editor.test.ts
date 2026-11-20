// 作用域向导编辑流程：mock 交互 + 伪 TTY，验证归属选择、扫描、冲突互转与写入口径
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { runScopeAdd, runScopeRemove, runScopeSetScope } from "../scope/wizard"

// 交互应答队列：按调用顺序消费，未提供时给出安全默认值
const answers = vi.hoisted(() => ({
  select: [] as unknown[],
  confirm: [] as boolean[],
  checkbox: [] as unknown[],
  input: [] as string[],
}))

vi.mock("../prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prompts")>()
  return {
    ...actual,
    loadPrompts: async () =>
      ({
        select: async () => answers.select.shift(),
        confirm: async () => answers.confirm.shift() ?? true,
        checkbox: async () => answers.checkbox.shift() ?? [],
        input: async () => answers.input.shift() ?? "",
      }) as unknown as Awaited<ReturnType<typeof actual.loadPrompts>>,
  }
})

let home = ""
let scanRoot = ""
let repo = ""
const originalCwd = process.cwd()

// 伪 TTY：编辑流程要求 stdin / stdout 均为终端
function setTty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true })
  Object.defineProperty(process.stdout, "isTTY", { value, configurable: true })
}

function resetAnswers(): void {
  answers.select.length = 0
  answers.confirm.length = 0
  answers.checkbox.length = 0
  answers.input.length = 0
}

// 读取全局层配置
function globalConfig(): { activation?: Record<string, unknown> } {
  return JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-wizard-editor-"))
  scanRoot = mkdtempSync(join(tmpdir(), "tk-wizard-scan-"))
  repo = join(scanRoot, "repo")
  mkdirSync(join(repo, ".git"), { recursive: true })
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetAnswers()
  setTty(true)
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  process.chdir(originalCwd)
  delete (process.stdin as { isTTY?: boolean }).isTTY
  delete (process.stdout as { isTTY?: boolean }).isTTY
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  rmSync(home, { recursive: true, force: true })
  rmSync(scanRoot, { recursive: true, force: true })
})

describe("scope 向导 · 设置生效范围", () => {
  it("扫描选中项目加入白名单，写入全局层并切 allowlist", async () => {
    answers.select.push("global", "scan", "include")
    answers.input.push(scanRoot)
    answers.checkbox.push([repo])
    answers.confirm.push(true)
    await runScopeSetScope()
    const activation = globalConfig().activation ?? {}
    expect(activation.mode).toBe("allowlist")
    expect((activation.include as string[]).some((item) => item.endsWith("repo"))).toBe(true)
  })

  it("已在黑名单的目录加入白名单时就地互转", async () => {
    writeFileSync(
      join(home, ".toolkitrc.json"),
      JSON.stringify({ activation: { mode: "all", include: [], exclude: [repo] } }),
    )
    answers.select.push("global", "scan", "include")
    answers.input.push(scanRoot)
    answers.checkbox.push([repo])
    answers.confirm.push(true, true)
    await runScopeSetScope()
    const activation = globalConfig().activation ?? {}
    expect((activation.exclude as string[]).length).toBe(0)
    expect((activation.include as string[]).some((item) => item.endsWith("repo"))).toBe(true)
  })

  it("未选中目录时不写配置", async () => {
    answers.select.push("global", "scan", "include")
    answers.input.push(scanRoot)
    answers.checkbox.push([])
    await runScopeSetScope()
    expect(existsSync(join(home, ".toolkitrc.json"))).toBe(false)
  })

  it("清除限制写 mode all 并清空两列表", async () => {
    writeFileSync(
      join(home, ".toolkitrc.json"),
      JSON.stringify({ activation: { mode: "allowlist", include: ["/a"], exclude: ["/b"] } }),
    )
    answers.select.push("global", "reset")
    answers.confirm.push(true)
    await runScopeSetScope()
    const activation = globalConfig().activation ?? {}
    expect(activation).toMatchObject({ mode: "all", include: [], exclude: [] })
  })

  it("项目层只做本项目是否生效，并写入项目根配置", async () => {
    process.chdir(repo)
    answers.select.push("project", "yes")
    answers.confirm.push(true)
    await runScopeSetScope()
    const projectConfig = JSON.parse(readFileSync(join(repo, ".toolkitrc.json"), "utf8")) as {
      activation?: { mode?: string; include?: string[] }
    }
    expect(projectConfig.activation?.mode).toBe("allowlist")
    expect(projectConfig.activation?.include?.some((item) => item.endsWith("repo"))).toBe(true)
  })
})

describe("scope add 非交互", () => {
  it("多目录追加白名单，并自动把同路径从黑名单移出", async () => {
    writeFileSync(
      join(home, ".toolkitrc.json"),
      JSON.stringify({ activation: { mode: "all", include: [], exclude: [repo] } }),
    )
    await runScopeAdd([repo])
    const activation = globalConfig().activation ?? {}
    expect(activation.mode).toBe("allowlist")
    expect((activation.include as string[]).some((item) => item.endsWith("repo"))).toBe(true)
    expect((activation.exclude as string[]).length).toBe(0)
  })
})

describe("scope remove 名单管理", () => {
  it("交互模式支持白名单转黑名单", async () => {
    writeFileSync(
      join(home, ".toolkitrc.json"),
      JSON.stringify({ activation: { mode: "allowlist", include: [repo], exclude: [] } }),
    )
    answers.select.push("global", "to-exclude")
    answers.checkbox.push([repo])
    await runScopeRemove()
    const activation = globalConfig().activation ?? {}
    expect((activation.include as string[]).length).toBe(0)
    expect((activation.exclude as string[]).some((item) => item.endsWith("repo"))).toBe(true)
  })

  it("非交互按层移除项目层条目", async () => {
    process.chdir(repo)
    writeFileSync(
      join(repo, ".toolkitrc.json"),
      JSON.stringify({ activation: { mode: "allowlist", include: [repo], exclude: [] } }),
    )
    await runScopeRemove([repo], "project")
    const projectConfig = JSON.parse(readFileSync(join(repo, ".toolkitrc.json"), "utf8")) as {
      activation?: { include?: string[] }
    }
    expect(projectConfig.activation?.include?.length).toBe(0)
  })
})
