// 规则上报与采集通道单测：批量写入、静默、配置过滤、通道互斥与 init --channel
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Command } from "commander"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { registerUsageCommands } from "../usage/commands"
import { ingestFromStdin } from "../usage/ingest"
import { resolveRecordSession } from "../usage/record"
import { readAllEvents, usagePaths } from "../usage/store"

let home = ""
let dataDir = ""
let logs: string[] = []
let errors: string[] = []

// 写入全局 usage 配置：默认规则通道 + 一方来源全量统计，用例按需覆盖
function writeUsageConfig(patch: Record<string, unknown> = {}): void {
  const usage = {
    enabled: true,
    channel: "rule",
    agents: {},
    sources: { firstParty: true, thirdParty: false, unmanaged: false },
    skills: { mode: "all", include: [], exclude: [] },
    capture: { triggerPrompt: true, skillArgs: true, outcome: true },
    storage: { dir: dataDir, rotation: "monthly", retentionDays: 180 },
    ...patch,
  }
  writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ usage }), "utf8")
  resetToolkitConfigCache()
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-usage-record-home-"))
  dataDir = mkdtempSync(join(tmpdir(), "tk-usage-record-data-"))
  mkdirSync(join(home, ".trae-cn"), { recursive: true })
  writeUsageConfig()
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  logs = []
  errors = []
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => logs.push(args.map(String).join(" ")))
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => errors.push(args.map(String).join(" ")))
})

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = 0
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  rmSync(home, { recursive: true, force: true })
  rmSync(dataDir, { recursive: true, force: true })
})

// 执行 usage 子命令
async function run(args: string[]): Promise<void> {
  const program = new Command()
  registerUsageCommands(program)
  await program.parseAsync(["node", "toolkit", "usage", ...args])
}

// 读取已写入事件
function events() {
  return readAllEvents(usagePaths(dataDir))
}

describe("usage record：批量上报", () => {
  it("多个技能合并上报、成功静默，且不产生触发词与参数", async () => {
    await run(["record", "--skill", "fxri-plan-to-task", "--skill", "fxri-plan-review"])
    const written = events()
    expect(written).toHaveLength(2)
    expect(written.map((event) => event.skill).sort()).toEqual(["fxri-plan-review", "fxri-plan-to-task"])
    for (const event of written) {
      expect(event.agent).toBe("rule")
      expect(event.originAdapter).toBe("rule")
      expect(event.triggerPrompt).toBeUndefined()
      expect(event.skillArgs).toBeUndefined()
    }
    // 成功时 stdout 为空
    expect(logs).toEqual([])
    expect(process.exitCode).toBe(0)
  })

  it("同一批内同名技能只记一条，逗号分隔与重复参数等价", async () => {
    await run(["record", "--skill", "fxri-plan-to-task,fxri-plan-to-task", "--skill", "fxri-plan-to-task"])
    expect(events()).toHaveLength(1)
  })

  it("显式会话标识优先于环境变量与日期兜底", async () => {
    await run(["record", "--skill", "fxri-plan-to-task", "--session", "s-explicit"])
    expect(events()[0]?.sessionId).toBe("s-explicit")
    expect(resolveRecordSession("s1", { TOOLKIT_USAGE_SESSION: "env" })).toBe("s1")
    expect(resolveRecordSession(undefined, { CLAUDE_SESSION_ID: "claude" })).toBe("claude")
    expect(resolveRecordSession(undefined, {})).toMatch(/^rule-\d{4}-\d{2}-\d{2}$/)
  })
})

describe("usage record：按 usage 配置过滤", () => {
  it("总开关关闭时不写入", async () => {
    writeUsageConfig({ enabled: false })
    await run(["record", "--skill", "fxri-plan-to-task"])
    expect(events()).toHaveLength(0)
    expect(logs).toEqual([])
  })

  it("来源开关关闭时不写入", async () => {
    writeUsageConfig({ sources: { firstParty: false, thirdParty: false, unmanaged: false } })
    await run(["record", "--skill", "fxri-plan-to-task"])
    expect(events()).toHaveLength(0)
  })

  it("include 未列出的技能不写入", async () => {
    writeUsageConfig({ skills: { mode: "include", include: ["fxri-plan-review"], exclude: [] } })
    await run(["record", "--skill", "fxri-plan-to-task", "--skill", "fxri-plan-review"])
    expect(events().map((event) => event.skill)).toEqual(["fxri-plan-review"])
  })

  it("exclude 命中的技能不写入", async () => {
    writeUsageConfig({ skills: { mode: "exclude", include: [], exclude: ["fxri-plan-to-task"] } })
    await run(["record", "--skill", "fxri-plan-to-task", "--skill", "fxri-plan-review"])
    expect(events().map((event) => event.skill)).toEqual(["fxri-plan-review"])
  })

  it("未托管技能静默忽略", async () => {
    await run(["record", "--skill", "some-unmanaged-skill"])
    expect(events()).toHaveLength(0)
    expect(logs).toEqual([])
    expect(errors).toEqual([])
  })

  it("写入失败只走 stderr，退出码仍为 0", async () => {
    // 把数据目录指到一个普通文件：事件目录无法创建，写入必然失败
    const broken = join(home, "not-a-dir")
    writeFileSync(broken, "x", "utf8")
    writeUsageConfig({ storage: { dir: broken, rotation: "monthly", retentionDays: 180 } })
    await run(["record", "--skill", "fxri-plan-to-task"])
    expect(errors.join("\n")).toContain("技能使用上报失败")
    expect(process.exitCode).toBe(0)
  })
})

describe("usage channel：通道互斥", () => {
  it("通道为 hook 时 record 不写入", async () => {
    writeUsageConfig({ channel: "hook" })
    await run(["record", "--skill", "fxri-plan-to-task"])
    expect(events()).toHaveLength(0)
    expect(logs).toEqual([])
  })

  it("通道为 rule 时 Hook 入口跳过写入", async () => {
    writeUsageConfig({ channel: "rule" })
    const result = await ingestFromStdin("trae")
    expect(result.status).toBe("skipped")
  })

  it("查看与切换通道，非法值报错退出", async () => {
    await run(["channel"])
    expect(logs.join("\n")).toContain("rule（全局规则上报）")

    logs = []
    await run(["channel", "hook"])
    expect(logs.join("\n")).toContain("采集通道已切换为 hook")
    const config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.channel).toBe("hook")

    errors = []
    await run(["channel", "bad"])
    expect(errors.join("\n")).toContain("rule / hook")
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
})

describe("usage init --channel", () => {
  it("默认 rule：只写采集配置，不安装 Hook、不依赖 Agent 检测", async () => {
    await run(["init", "--yes", "--preset", "recommended"])
    const config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.enabled).toBe(true)
    expect(config.usage.channel).toBe("rule")
    expect(config.usage.agents).toEqual({})
    expect(existsSync(join(home, ".trae-cn", "hooks.json"))).toBe(false)
  })

  it("--channel hook 维护 Hook 安装路径", async () => {
    await run(["init", "--yes", "--preset", "recommended", "--channel", "hook", "--agent", "trae"])
    const config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.channel).toBe("hook")
    expect(config.usage.agents.trae).toBe(true)
    expect(readFileSync(join(home, ".trae-cn", "hooks.json"), "utf8")).toContain("usage ingest --agent trae")
  })

  it("--preset off 优先于 --channel，保持关闭", async () => {
    writeUsageConfig({ enabled: false })
    await run(["init", "--yes", "--preset", "off", "--channel", "hook"])
    const config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.enabled).toBe(false)
    expect(existsSync(join(home, ".trae-cn", "hooks.json"))).toBe(false)
  })

  it("非法通道值报错退出", async () => {
    await run(["init", "--yes", "--preset", "recommended", "--channel", "bad"])
    expect(errors.join("\n")).toContain("rule / hook")
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })
})
