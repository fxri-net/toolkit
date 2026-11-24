// skills lint 命令行面：退出码、stdout 纯净度、JSON 结构与基准跳过提示
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const originalArgv = process.argv
const fixtures: string[] = []
let home = ""

interface CliRun {
  code: number
  log: string[]
  err: string[]
  out: string[]
}

// 写一个结构完整的技能；bodyLines 用于构造篇幅超限夹具
function writeSkill(root: string, name: string, options: { license?: boolean; bodyLines?: number } = {}): string {
  const dir = join(root, name)
  mkdirSync(join(dir, "references"), { recursive: true })
  const lines = ["---", `name: ${name}`, "description: 测试技能"]
  if (options.license !== false) lines.push("license: MIT")
  lines.push("metadata:", '  version: "1.0.0"', "  tier: core", "  author: fxri", "  source: https://github.com/fxri-net/toolkit", "---", "", `# ${name}`, "", "> 本技能版本 1.0.0（测试）", "", "## 参考", "", "- 指南：`references/guide.md`", "")
  if (options.bodyLines) lines.push(...Array.from({ length: options.bodyLines }, (_, index) => `- 行 ${index}`), "")
  writeFileSync(join(dir, "SKILL.md"), lines.join("\n"), "utf8")
  writeFileSync(join(dir, "references", "guide.md"), "# 指南\n", "utf8")
  return dir
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "fxts-tk-lint-cli-"))
  fixtures.push(root)
  return root
}

// 跑一次 CLI：注入 home 与 argv，收集三个输出通道
async function runCli(args: string[]): Promise<CliRun> {
  vi.resetModules()
  const config = await import("../config")
  config.setHomeDirForTest(home)
  config.resetToolkitConfigCache()
  const log: string[] = []
  const err: string[] = []
  const out: string[] = []
  vi.spyOn(console, "log").mockImplementation((...value: unknown[]) => {
    log.push(value.join(" "))
  })
  vi.spyOn(console, "error").mockImplementation((...value: unknown[]) => {
    err.push(value.join(" "))
  })
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    out.push(typeof chunk === "string" ? chunk : String(chunk))
    return true
  }) as unknown as typeof process.stdout.write)
  process.argv = ["node", "toolkit", ...args]
  process.exitCode = 0
  const cli = await import("../cli")
  await cli.cliReady
  return { code: Number(process.exitCode ?? 0), log, err, out }
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "fxts-tk-lint-cli-home-"))
  fixtures.push(home)
  process.env.CI = "1"
  process.env.FX_TOOLKIT_NO_UPDATE_CHECK = "1"
})

afterEach(() => {
  delete process.env.CI
  delete process.env.FX_TOOLKIT_NO_UPDATE_CHECK
  process.argv = originalArgv
  process.exitCode = 0
  vi.restoreAllMocks()
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("skills lint", () => {
  it("合规技能退出 0，stdout 只有校验结论", async () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha")
    const result = await runCli(["skill", "lint", root])
    expect(result.code).toBe(0)
    expect(result.log.join("\n")).toContain("1 个技能通过校验")
    expect(result.err).toEqual([])
  })

  it("存在错误时退出 1 并定位到文件", async () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha", { license: false })
    const result = await runCli(["skill", "lint", root])
    expect(result.code).toBe(1)
    expect(result.log.join("\n")).toContain("[field-missing]")
  })

  it("--strict 让告警按失败处理", async () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha", { bodyLines: 160 })
    expect((await runCli(["skill", "lint", root])).code).toBe(0)
    expect((await runCli(["skill", "lint", root, "--strict"])).code).toBe(1)
  })

  it("--json 输出统一信封且 data 带校验结果", async () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha")
    const result = await runCli(["skill", "lint", root, "--json"])
    const payload = JSON.parse(result.log.join("\n")) as {
      schemaVersion: number
      command: string
      code: number
      data: { files: string[]; issues: unknown[]; summary: { skills: number } }
      issues: unknown[]
    }
    expect(payload.schemaVersion).toBe(1)
    expect(payload.command).toBe("skill lint")
    expect(payload.code).toBe(200)
    expect(payload.data.files).toHaveLength(1)
    expect(payload.data.issues).toEqual([])
    expect(payload.data.summary.skills).toBe(1)
    expect(payload.issues).toEqual([])
  })

  it("用法错误退出 2", async () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha")
    const result = await runCli(["skill", "lint", root, "--budget", "0"])
    expect(result.code).toBe(2)
    expect(result.err.join("\n")).toContain("正整数")
  })

  it("基准不可用时在 stderr 说明跳过原因", async () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha")
    const result = await runCli(["skill", "lint", root, "--base", "HEAD"])
    expect(result.code).toBe(0)
    expect(result.err.join("\n")).toContain("跳过版本递增校验")
  })
})
