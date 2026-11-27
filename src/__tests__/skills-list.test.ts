// skill list：已装 / 未装 / 来源不可用兜底三类输出，旧账缺 summary 不报错
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import {
  buildSkillList,
  installSkills,
  listPackageSkills,
  resetSkillGateWarnings,
  resetSkillsRootCache,
  skillSummary,
  skillsStateFile,
  STATE_FORMAT,
  STATE_SCHEMA_VERSION,
} from "../skills"
import { tempDir } from "./helpers"

// 临时 home：产物只落临时目录，不触碰真实用户全局技能目录
let home = ""

// 主目标目录 ~/.agents/skills
function primaryDir(): string {
  return join(home, ".agents", "skills")
}

// 写入手造状态文件：模拟来源不可解析与旧账缺 summary 两类现场
function writeLegacyState(entries: Array<{ name: string; version: string; summary?: string }>): void {
  const file = skillsStateFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(
    file,
    JSON.stringify({
      format: STATE_FORMAT,
      schemaVersion: STATE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      sources: {
        toolkit: {
          kind: "builtin",
          version: "0.0.0",
          temporary: false,
          root: primaryDir(),
          targets: [
            {
              id: "primary",
              dir: primaryDir(),
              label: "主目标",
              kind: "primary",
              entries: entries.map((entry) => ({ name: entry.name, version: entry.version, mode: "copy", ...(entry.summary ? { summary: entry.summary } : {}) })),
            },
          ],
        },
      },
    }),
    "utf8",
  )
  // 现场产物存在才算已安装：状态登记与目录必须同时成立
  for (const entry of entries) {
    const dir = join(primaryDir(), entry.name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), `---\nname: ${entry.name}\n---\n`, "utf8")
  }
}

beforeEach(() => {
  home = tempDir("fxts-tk-list-")
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  process.env.CI = "1"
  process.env.FX_TOOLKIT_NO_UPDATE_CHECK = "1"
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.CI
  delete process.env.FX_TOOLKIT_NO_UPDATE_CHECK
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  resetSkillGateWarnings()
  rmSync(home, { recursive: true, force: true })
})

// 跑一次 CLI：重置模块注册表并注入 home 与 argv，收集 stdout 行
async function runCli(args: string[]): Promise<string[]> {
  vi.resetModules()
  const config = await import("../config")
  config.setHomeDirForTest(home)
  config.resetToolkitConfigCache()
  const log: string[] = []
  vi.spyOn(console, "log").mockImplementation((...items: unknown[]) => {
    log.push(items.join(" "))
  })
  vi.spyOn(process.stdout, "write").mockImplementation((() => true) as unknown as typeof process.stdout.write)
  const originalArgv = process.argv
  process.argv = ["node", "toolkit", ...args]
  try {
    const cli = await import("../cli")
    await cli.cliReady
  } finally {
    process.argv = originalArgv
    process.exitCode = 0
  }
  return log
}

describe("skill list", () => {
  it("已装技能带简介、版本与形态，JSON 保留目标数", () => {
    // 取 core 技能：skills 模式下 core 恒装，选择结果稳定
    const pkg = listPackageSkills().find((skill) => skill.tier === "core")!
    installSkills({ skills: [pkg.name] })
    const entries = buildSkillList()
    const entry = entries.find((item) => item.name === pkg.name)
    expect(entry).toBeDefined()
    expect(entry!.installed).toBe(true)
    // 简介与真源同源：期望值取真实实现的摘要结果，不在测试内重写截断逻辑
    expect(entry!.summary).toBe(skillSummary(pkg.description ?? ""))
    expect(entry!.version).toBe(pkg.version)
    expect(entry!.form).toBe("全文安装")
    expect(entry!.targets).toBeGreaterThan(0)
  })

  it("默认不列未装技能，--all 补全并标未安装", () => {
    const pkg = listPackageSkills().find((skill) => skill.tier === "core")!
    const missing = listPackageSkills().find((skill) => skill.tier === "optional")!
    installSkills({ skills: [pkg.name] })

    const installed = buildSkillList()
    expect(installed.every((item) => item.installed)).toBe(true)
    expect(installed.map((item) => item.name)).not.toContain(missing.name)
    // 名称升序：脚本消费方依赖稳定顺序
    expect(installed.map((item) => item.name)).toEqual([...installed.map((item) => item.name)].sort())

    const all = buildSkillList({ all: true })
    const entry = all.find((item) => item.name === missing.name)
    expect(entry).toBeDefined()
    expect(entry!.installed).toBe(false)
    expect(entry!.targets).toBe(0)
    expect(all.map((item) => item.name)).toEqual([...all.map((item) => item.name)].sort())
  })

  it("来源不可解析时用登记简介兜底，旧账缺 summary 不报错", () => {
    writeLegacyState([
      { name: "legacy-ghost", version: "9.9.9", summary: "状态保留的说明" },
      { name: "legacy-old", version: "8.8.8" },
    ])
    const entries = buildSkillList()
    const ghost = entries.find((item) => item.name === "legacy-ghost")
    expect(ghost!.installed).toBe(true)
    expect(ghost!.summary).toBe("状态保留的说明")
    expect(ghost!.version).toBe("9.9.9")
    const old = entries.find((item) => item.name === "legacy-old")
    expect(old!.summary).toBe("")
    expect(old!.installed).toBe(true)
  })

  it("文本行不展示目标数；未安装条目形态位显示「未安装」", async () => {
    const pkg = listPackageSkills().find((skill) => skill.tier === "core")!
    const missing = listPackageSkills().find((skill) => skill.tier === "optional")!
    installSkills({ skills: [pkg.name] })
    const log = await runCli(["skill", "list", "--all"])

    const installedLine = log.find((item) => item.includes(pkg.name))
    expect(installedLine).toBeDefined()
    expect(installedLine).toContain("全文安装")
    expect(installedLine).not.toContain("个目标")

    const uninstalledLine = log.find((item) => item.includes(missing.name))
    expect(uninstalledLine).toBeDefined()
    expect(uninstalledLine).toContain("未安装")
    expect(uninstalledLine).not.toContain("全文安装（未安装）")
    expect(uninstalledLine).not.toContain("个目标")
  })
})
