// 使用情况 CLI 单测：命令注册、配置写入、统计查询、导出导入与 Hook 管理
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Command } from "commander"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { registerUsageCommands } from "../usage/commands"
import { recordHookActivity } from "../usage/ingest"
import { readAllEvents, usagePaths } from "../usage/store"
import type { SkillUsageEvent } from "../usage/types"
import { tempDir } from "./helpers"

// 临时目录与输出缓存
let home = ""
let dataDir = ""
let logs: string[] = []
let errors: string[] = []

// 初始化现场：全局配置启用使用情况，数据目录指向临时目录
beforeEach(() => {
  home = tempDir("fxts-tk-usage-cli-home-")
  dataDir = tempDir("fxts-tk-usage-cli-data-")
  mkdirSync(join(home, ".trae-cn"), { recursive: true })
  writeFileSync(
    join(home, ".toolkitrc.json"),
    JSON.stringify({
      usage: {
        enabled: true,
        agents: { trae: true },
        sources: { firstParty: true, thirdParty: false, unmanaged: false },
        skills: { mode: "all", include: [], exclude: [] },
        capture: { triggerPrompt: true, skillArgs: true, outcome: true },
        storage: { dir: dataDir, rotation: "monthly", retentionDays: 180 },
      },
    }),
    "utf8",
  )
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
  // 与真实 CLI 同口径：位置选项开启后，子命令后的选项归子命令，不被父级同名选项吞掉
  const program = new Command().enablePositionalOptions()
  registerUsageCommands(program)
  await program.parseAsync(["node", "toolkit", "usage", ...args])
}

// 造一条可导入事件
function event(overrides: Partial<SkillUsageEvent> = {}): SkillUsageEvent {
  return {
    schemaVersion: "1.0",
    eventId: "sha256:imported",
    occurredAt: "2026-11-06T10:00:00.000+08:00",
    agent: "trae",
    sessionId: "s1",
    skill: "fxri-plan-task",
    skillSource: "toolkit-first-party",
    managedBy: "toolkit",
    originAdapter: "import",
    toolkitVersion: "0.0.0",
    ...overrides,
  }
}

describe("usage CLI", () => {
  it("状态与开关命令回显并写全局配置", async () => {
    await run(["show", "--format", "json"])
    const payload = JSON.parse(logs.join("\n")) as { command: string; code: number; data: { enabled: boolean; hooks: unknown; upload: unknown } }
    expect(payload.command).toBe("usage show")
    expect(payload.code).toBe(200)
    expect(payload.data.enabled).toBe(true)
    expect(payload.data.hooks).toBeDefined()
    expect(payload.data.upload).toBeDefined()

    await run(["config", "origins", "--no-first-party"])
    await run(["config", "scope", "--mode", "all"])
    await run(["config", "capture", "--no-trigger"])
    await run(["config", "storage", "--retention", "30"])
    const config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.sources.firstParty).toBe(false)
    expect(config.usage.skills.mode).toBe("all")
    expect(config.usage.capture.triggerPrompt).toBe(false)
    expect(config.usage.storage.retentionDays).toBe(30)
  })

  it("补录、统计、导出、导入与清理", async () => {
    await run(["log", "--skill", "fxri-plan-task", "--session", "s1", "--prompt", "全部任务落档", "--outcome", "success"])
    expect(logs.join("\n") || errors.join("\n")).toContain("已补录")

    logs = []
    await run(["show", "stats", "--format", "json"])
    const statsPayload = JSON.parse(logs.join("\n")) as { command: string; data: { total: number } }
    expect(statsPayload.command).toBe("usage show stats")
    expect(statsPayload.data.total).toBe(1)
    await run(["show", "stats", "--by", "session"])
    await run(["show", "stats", "--by", "trigger"])

    const out = join(dataDir, "events.csv")
    await run(["data", "export", "--type", "csv", "--out", out])
    expect(readFileSync(out, "utf8")).toContain("fxri-plan-task")

    const input = join(dataDir, "import.jsonl")
    writeFileSync(input, `${JSON.stringify(event())}\n`, "utf8")
    await run(["data", "import", "--type", "jsonl", "--file", input])
    expect(readAllEvents(usagePaths(dataDir))).toHaveLength(2)

    await run(["data", "dedupe"])
    await run(["data", "doctor", "--format", "json"])
    await run(["data", "rebuild"])

    await run(["data", "purge", "--older-than", "30d", "--dry-run"])
    expect(logs.join("\n")).toContain("[预演] 将删除")
    expect(readAllEvents(usagePaths(dataDir))).toHaveLength(2)

    await run(["data", "purge", "--all"])
    expect(readAllEvents(usagePaths(dataDir))).toHaveLength(0)
  })

  it("doctor 输出结构化诊断项，rule 通道下不误报 dsh 桥接条目", async () => {
    const profile = join(home, ".dsh", "profiles", "desktop")
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, "cordis.patch.yml"), "[]\n", "utf8")
    await run(["data", "doctor", "--format", "json"])
    const text = logs.join("\n")
    const parsed = JSON.parse(text.slice(text.indexOf("{"))) as {
      command: string
      data: { items: Array<{ code: string; level: string; message: string }> }
    }
    expect(parsed.command).toBe("usage data doctor")
    expect(Array.isArray(parsed.data.items)).toBe(true)
    expect(parsed.data.items.every((i) => i.code !== "" && (i.level === "warn" || i.level === "info"))).toBe(true)
    expect(parsed.data.items.some((i) => i.message.includes("桥接条目"))).toBe(false)
    expect(parsed.data.items.some((i) => i.code === "rule-channel-with-hooks")).toBe(false)
  })

  it("Hook 安装、状态与卸载", async () => {
    await run(["setup", "hooks", "install", "--agent", "trae", "--yes"])
    expect(logs.join("\n")).toContain("已安装 Hook")
    const hookConfig = JSON.parse(readFileSync(join(home, ".trae-cn", "hooks.json"), "utf8"))
    expect(hookConfig.hooks.PostToolUse).toHaveLength(1)

    logs = []
    await run(["setup", "hooks", "status", "--agent", "trae"])
    expect(logs.join("\n")).toContain("已安装")
    expect(logs.join("\n")).toContain("尚未执行")

    await run(["setup", "hooks", "remove", "--agent", "trae", "--yes"])
    const after = JSON.parse(readFileSync(join(home, ".trae-cn", "hooks.json"), "utf8"))
    expect(after.hooks.PostToolUse).toBeUndefined()
  })

  it("Hook 写操作在非交互环境需显式 --yes", async () => {
    await run(["setup", "hooks", "install", "--agent", "trae"])
    expect(errors.join("\n")).toContain("--yes")
    expect(process.exitCode).toBe(2)
    process.exitCode = 0

    await run(["setup", "hooks", "remove", "--agent", "trae"])
    expect(errors.join("\n")).toContain("--yes")
    expect(process.exitCode).toBe(2)
    process.exitCode = 0
  })

  it("裸 usage 输出摘要成功退出，setup --interactive 在非交互环境报错退出", async () => {
    await run([])
    expect(logs.join("\n")).toContain("技能使用情况")
    expect(logs.join("\n")).toContain("toolkit usage setup")
    expect(process.exitCode).toBe(0)

    logs = []
    errors = []
    await run(["setup", "--interactive"])
    expect(errors.join("\n")).toContain("toolkit usage setup")
    expect(process.exitCode).toBe(2)
    process.exitCode = 0
  })

  it("配置类命令的 --format json 在信封 data 内只输出本段载荷", async () => {
    await run(["config", "channel", "--format", "json"])
    const channel = JSON.parse(logs.join("\n")) as { command: string; data: { channel: string } }
    expect(channel.command).toBe("usage config channel")
    expect(channel.data).toHaveProperty("channel")

    logs = []
    await run(["config", "origins", "--format", "json"])
    const sources = JSON.parse(logs.join("\n")) as { command: string; data: { sources: { firstParty: boolean }; enabled?: boolean } }
    expect(sources.command).toBe("usage config origins")
    expect(sources.data.sources.firstParty).toBe(true)
    expect(sources.data.enabled).toBeUndefined()

    logs = []
    await run(["config", "scope", "--format", "json"])
    expect((JSON.parse(logs.join("\n")) as { data: Record<string, unknown> }).data).toHaveProperty("skills")

    logs = []
    await run(["config", "capture", "--format", "json"])
    expect((JSON.parse(logs.join("\n")) as { data: Record<string, unknown> }).data).toHaveProperty("capture")

    logs = []
    await run(["config", "storage", "--format", "json"])
    expect((JSON.parse(logs.join("\n")) as { data: Record<string, unknown> }).data).toHaveProperty("storage")
  })

  it("非交互初始化、上传配置与卸载", async () => {
    await run(["setup", "init", "--yes", "--preset", "recommended", "--channel", "hook", "--agent", "trae"])
    let config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.enabled).toBe(true)
    expect(config.usage.agents.trae).toBe(true)
    expect(config.usage.sources.firstParty).toBe(true)
    expect(readFileSync(join(home, ".trae-cn", "hooks.json"), "utf8")).toContain("usage ingest --agent trae")

    const endpoint = join(dataDir, "upload.jsonl")
    await run(["config", "upload", "setup", "--yes", "--protocol", "file", "--endpoint", endpoint])
    config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.upload.enabled).toBe(true)
    expect(config.usage.upload.protocol).toBe("file")

    recordHookActivity(usagePaths(dataDir), "trae", "written")
    logs = []
    await run(["setup", "hooks", "status", "--agent", "trae", "--dir", dataDir])
    expect(logs.join("\n")).toMatch(/最近触发：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)

    await run(["setup", "uninstall", "--yes", "--agent", "trae"])
    config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.enabled).toBe(false)
    const hooks = JSON.parse(readFileSync(join(home, ".trae-cn", "hooks.json"), "utf8"))
    expect(hooks.hooks.PostToolUse).toBeUndefined()
  })

  it("上传默认关闭，dry-run 直接报错", async () => {
    await run(["config", "upload", "status", "--format", "json"])
    const upload = JSON.parse(logs.join("\n")) as { command: string; data: { enabled: boolean } }
    expect(upload.command).toBe("usage config upload status")
    expect(upload.data.enabled).toBe(false)
    await run(["config", "upload"])
    expect(logs.join("\n")).toContain("待上传")
    logs = []
    errors = []
    await run(["config", "upload", "send", "--dry-run"])
    expect(errors.join("\n")).toContain("上传未启用")
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })

  it("非法参数不静默回落", async () => {
    await run(["data", "purge", "--older-than", "30"])
    expect(errors.join("\n")).toContain("30d / 24h / 60m")
    expect(process.exitCode).toBe(1)
    process.exitCode = 0

    await run(["show", "stats", "--since", "bad"])
    expect(errors.join("\n")).toContain("--since")
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
  })

  it("卸载预演只打印动作，不改配置", async () => {
    await run(["setup", "uninstall", "--yes", "--dry-run", "--agent", "trae"])
    expect(logs.join("\n")).toContain("[预演]")
    const config = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(config.usage.enabled).toBe(true)
  })
})
