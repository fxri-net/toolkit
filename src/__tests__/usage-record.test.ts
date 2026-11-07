// 规则上报队列与 worker 单测：按次计数、基础事件必成、反查补字段与失败降级
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Command } from "commander"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { registerUsageCommands } from "../usage/commands"
import { flushQueue } from "../usage/flush"
import { ingestFromStdin } from "../usage/ingest"
import { listQueueFiles, queueDir } from "../usage/queue"
import { createBatchId, resolveRecordSession } from "../usage/record"
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
  home = mkdtempSync(join(tmpdir(), "tk-usage-queue-home-"))
  dataDir = mkdtempSync(join(tmpdir(), "tk-usage-queue-data-"))
  mkdirSync(join(home, ".trae-cn"), { recursive: true })
  process.env.TOOLKIT_USAGE_NO_WORKER = "1"
  delete process.env.TOOLKIT_USAGE_AGENT
  delete process.env.CLAUDE_SESSION_ID
  delete process.env.TRAE_SESSION_ID
  delete process.env.DSH_SESSION_ID
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
  delete process.env.TOOLKIT_USAGE_NO_WORKER
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

// 队列目录里的条目数
function queued(): number {
  return listQueueFiles(usagePaths(dataDir)).length
}

describe("usage record：入队", () => {
  it("入队即返回、静默，技能按出现次数保留", async () => {
    await run(["record", "--skill", "fxri-plan-to-task", "--skill", "fxri-plan-to-task", "--skill", "fxri-plan-review"])
    expect(queued()).toBe(1)
    expect(events()).toHaveLength(0)
    expect(logs).toEqual([])
    expect(process.exitCode).toBe(0)
    const file = listQueueFiles(usagePaths(dataDir))[0] as string
    const entry = JSON.parse(readFileSync(file, "utf8"))
    expect(entry.skills).toEqual(["fxri-plan-to-task", "fxri-plan-to-task", "fxri-plan-review"])
    expect(entry.agentHint).toBeTypeOf("string")
  })

  it("通道为 hook 或总开关关闭时不入队", async () => {
    writeUsageConfig({ channel: "hook" })
    await run(["record", "--skill", "fxri-plan-to-task"])
    expect(queued()).toBe(0)

    writeUsageConfig({ enabled: false })
    await run(["record", "--skill", "fxri-plan-to-task"])
    expect(queued()).toBe(0)
    expect(logs).toEqual([])
  })

  it("入队失败只走 stderr，退出码仍为 0", async () => {
    const broken = join(home, "not-a-dir")
    writeFileSync(broken, "x", "utf8")
    writeUsageConfig({ storage: { dir: broken, rotation: "monthly", retentionDays: 180 } })
    await run(["record", "--skill", "fxri-plan-to-task"])
    expect(errors.join("\n")).toContain("技能使用上报失败")
    expect(process.exitCode).toBe(0)
  })

  it("批次 ID 唯一，会话标识三级兜底", () => {
    expect(createBatchId()).not.toBe(createBatchId())
    expect(resolveRecordSession("s1", { TOOLKIT_USAGE_SESSION: "env" })).toBe("s1")
    expect(resolveRecordSession(undefined, { CLAUDE_SESSION_ID: "claude" })).toBe("claude")
    expect(resolveRecordSession(undefined, {})).toMatch(/^rule-\d{4}-\d{2}-\d{2}$/)
  })
})

describe("usage flush：按次计数与基础事件", () => {
  it("同技能多次各记一条，toolUseId 不重复", async () => {
    await run(["record", "--skill", "fxri-plan-to-task", "--skill", "fxri-plan-to-task", "--skill", "fxri-plan-review"])
    flushQueue({ lookup: () => null })
    const written = events()
    expect(written).toHaveLength(3)
    expect(written.filter((event) => event.skill === "fxri-plan-to-task")).toHaveLength(2)
    expect(new Set(written.map((event) => event.toolUseId)).size).toBe(3)
    expect(queued()).toBe(0)
  })

  it("反查命中时补齐触发词、参数、结果与耗时", async () => {
    await run(["record", "--skill", "fxri-plan-to-task"])
    flushQueue({
      lookup: () => [
        {
          skill: "fxri-plan-to-task",
          prompt: "把方案落档",
          args: '{"path":"x"}',
          outcome: "success",
          durationMs: 120,
        },
      ],
    })
    const [event] = events()
    expect(event?.triggerPrompt).toBe("把方案落档")
    expect(event?.skillArgs).toBe('{"path":"x"}')
    expect(event?.outcome).toBe("success")
    expect(event?.durationMs).toBe(120)
  })

  it("反查抛错时仍写基础事件", async () => {
    await run(["record", "--skill", "fxri-plan-to-task"])
    flushQueue({
      lookup: () => {
        throw new Error("session broken")
      },
    })
    const written = events()
    expect(written).toHaveLength(1)
    expect(written[0]?.triggerPrompt).toBeUndefined()
    expect(queued()).toBe(0)
  })

  it("同一技能多次按会话内最后 N 次匹配", async () => {
    await run(["record", "--skill", "fxri-plan-to-task", "--skill", "fxri-plan-to-task"])
    flushQueue({
      lookup: () => [
        { skill: "fxri-plan-to-task", prompt: "early" },
        { skill: "fxri-plan-to-task", prompt: "late-1" },
        { skill: "fxri-plan-to-task", prompt: "late-2" },
      ],
    })
    const prompts = events().map((event) => event.triggerPrompt)
    expect(prompts).toEqual(["late-1", "late-2"])
  })
})

describe("usage flush：配置过滤", () => {
  it("来源关闭 / include 未列 / exclude 命中 / 未托管 均不写入", async () => {
    writeUsageConfig({ sources: { firstParty: false, thirdParty: false, unmanaged: false } })
    await run(["record", "--skill", "fxri-plan-to-task"])
    flushQueue({ lookup: () => null })
    expect(events()).toHaveLength(0)

    writeUsageConfig({ skills: { mode: "include", include: ["fxri-plan-review"], exclude: [] } })
    await run(["record", "--skill", "fxri-plan-to-task", "--skill", "some-unmanaged-skill"])
    flushQueue({ lookup: () => null })
    expect(events()).toHaveLength(0)

    writeUsageConfig({ skills: { mode: "exclude", include: [], exclude: ["fxri-plan-to-task"] } })
    await run(["record", "--skill", "fxri-plan-to-task", "--skill", "fxri-plan-review"])
    flushQueue({ lookup: () => null })
    expect(events().map((event) => event.skill)).toEqual(["fxri-plan-review"])
  })

  it("通道切走后 Hook 入口跳过写入", async () => {
    writeUsageConfig({ channel: "rule" })
    const result = await ingestFromStdin("trae")
    expect(result.status).toBe("skipped")
  })

  it("损坏的队列条目被丢弃，不阻塞后续批次", async () => {
    await run(["record", "--skill", "fxri-plan-to-task"])
    const dir = queueDir(usagePaths(dataDir))
    writeFileSync(join(dir, "000-broken.json"), "{not json", "utf8")
    flushQueue({ lookup: () => null })
    expect(events()).toHaveLength(1)
    expect(readdirSync(dir)).toHaveLength(0)
  })
})

describe("usage flush 命令", () => {
  it("命令入口消费队列且不打印", async () => {
    await run(["record", "--skill", "fxri-plan-to-task"])
    logs = []
    await run(["flush"])
    expect(logs).toEqual([])
    expect(events()).toHaveLength(1)
  })

  it("惰性兜底：其它 usage 命令启动时先消费积压队列", async () => {
    await run(["record", "--skill", "fxri-plan-to-task", "--skill", "fxri-plan-to-task"])
    await run(["info"])
    expect(events()).toHaveLength(2)
    expect(queued()).toBe(0)
  })
})

describe("usage channel 与 init（沿用上一版语义）", () => {
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

  it("init 默认 rule 不装 Hook；--preset off 优先；非法通道报错", async () => {
    await run(["init", "--yes", "--preset", "recommended"])
    let config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.channel).toBe("rule")
    expect(config.usage.agents).toEqual({})
    expect(existsSync(join(home, ".trae-cn", "hooks.json"))).toBe(false)

    await run(["init", "--yes", "--preset", "off", "--channel", "hook"])
    config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.enabled).toBe(true)

    errors = []
    await run(["init", "--yes", "--preset", "recommended", "--channel", "bad"])
    expect(errors.join("\n")).toContain("rule / hook")
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })

  it("init --yes 未给 preset 时报错且不写配置", async () => {
    const before = readFileSync(join(home, ".toolkitrc.json"), "utf8")
    errors = []
    await run(["init", "--yes"])
    expect(errors.join("\n")).toContain("--preset")
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
    expect(readFileSync(join(home, ".toolkitrc.json"), "utf8")).toBe(before)
  })
})
