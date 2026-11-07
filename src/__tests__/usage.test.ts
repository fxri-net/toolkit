// 使用情况内核单测：默认关闭、过滤链、事件 ID、技能识别、存储去重与统计聚合
import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { buildEvent, computeEventId, extractSkillName, resolveSkillMeta, toLocalIsoString } from "../usage/event"
import { shouldRecord } from "../usage/filter"
import { DEFAULT_USAGE_CONFIG, loadUsageConfig, normalizeUsageConfig, resetUsageConfigWarnings, resolveUsageDir, updateUsageConfig } from "../usage/config"
import { appendEvent, dedupeStore, purgeEvents, readAllEvents, readIndex, usagePaths } from "../usage/store"
import { eventsToCsv, filterEvents, parseSince, summarize, unusedSkills } from "../usage/stats"
import type { SkillUsageEvent, UsageConfig } from "../usage/types"

// 造一个全开配置：便于测试过滤链与事件字段
function enabledConfig(patch: Partial<UsageConfig> = {}): UsageConfig {
  return {
    ...DEFAULT_USAGE_CONFIG,
    enabled: true,
    agents: { trae: true },
    sources: { firstParty: true, thirdParty: true, unmanaged: true },
    skills: { mode: "all", include: [], exclude: [] },
    capture: { triggerPrompt: true, skillArgs: true, outcome: true },
    ...patch,
  }
}

// 造一条最小事件：存储统计用例直接构造，避免依赖技能清单
function makeEvent(overrides: Partial<SkillUsageEvent> = {}): SkillUsageEvent {
  return {
    schemaVersion: 1,
    eventId: overrides.eventId ?? `sha256:${Math.random().toString(16).slice(2)}`,
    occurredAt: overrides.occurredAt ?? "2026-11-06T10:00:00.000+08:00",
    agent: "trae",
    sessionId: "session-1",
    skill: "fxri-plan-to-task",
    skillSource: "toolkit-first-party",
    managedBy: "toolkit",
    originAdapter: "test",
    toolkitVersion: "0.0.0",
    ...overrides,
  }
}

// 临时目录：用例结束统一清理
const tempDirs: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetUsageConfigWarnings()
  delete process.env.TOOLKIT_TELEMETRY_DIR
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("使用情况配置", () => {
  it("默认全部关闭，非法值回落默认", () => {
    const defaults = normalizeUsageConfig(undefined)
    expect(defaults.enabled).toBe(false)
    expect(defaults.skills.mode).toBe("none")
    expect(defaults.sources).toEqual({ firstParty: false, thirdParty: false, unmanaged: false })

    vi.spyOn(console, "warn").mockImplementation(() => {})
    const parsed = normalizeUsageConfig({
      enabled: "yes",
      agents: { trae: true, claude: "on" },
      sources: { firstParty: true },
      skills: { mode: "bad", include: ["a", 1] },
      storage: { rotation: "bad", retentionDays: -1 },
    })
    expect(parsed.enabled).toBe(false)
    expect(parsed.agents).toEqual({ trae: true })
    expect(parsed.sources.firstParty).toBe(true)
    expect(parsed.skills.mode).toBe("none")
    expect(parsed.skills.include).toEqual(["a"])
    expect(parsed.storage.rotation).toBe("monthly")
    expect(parsed.storage.retentionDays).toBe(180)
  })

  it("只读全局层，并能写回 usage 段", () => {
    const home = tempDir("tk-usage-home-")
    setHomeDirForTest(home)
    resetToolkitConfigCache()
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ tasks: { dir: "tasks" }, usage: { enabled: true } }), "utf8")
    const config = loadUsageConfig()
    expect(config.enabled).toBe(true)
    updateUsageConfig({ sources: { firstParty: true } })
    const raw = JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8"))
    expect(raw.tasks.dir).toBe("tasks")
    expect(raw.usage.sources.firstParty).toBe(true)
    expect(resolveUsageDir(undefined, config)).toBe(join(home, ".toolkit", "usage"))
  })

  it("旧版 telemetry 段、环境变量与数据目录只提示不生效", () => {
    const home = tempDir("tk-usage-legacy-")
    setHomeDirForTest(home)
    resetToolkitConfigCache()
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ telemetry: { enabled: true } }), "utf8")
    mkdirSync(join(home, ".toolkit", "telemetry"), { recursive: true })
    const warns: string[] = []
    vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warns.push(String(message))
    })
    process.env.TOOLKIT_TELEMETRY_DIR = join(home, "legacy-env")
    const config = loadUsageConfig()
    expect(config.enabled).toBe(false)
    expect(resolveUsageDir(undefined, config)).toBe(join(home, ".toolkit", "usage"))
    expect(warns.join("\n")).toContain("telemetry 段")
    expect(warns.join("\n")).toContain("TOOLKIT_TELEMETRY_DIR")
    expect(warns.join("\n")).toContain("旧数据目录")
  })
})

describe("过滤链", () => {
  it("总开关、Agent、来源、技能范围逐层生效", () => {
    const meta = resolveSkillMeta("fxri-plan-to-task")
    expect(shouldRecord(DEFAULT_USAGE_CONFIG, "trae", meta)).toBe(false)
    expect(shouldRecord(enabledConfig(), "cursor", meta)).toBe(false)
    expect(shouldRecord(enabledConfig({ sources: { firstParty: false, thirdParty: true, unmanaged: true } }), "trae", meta)).toBe(false)
    expect(shouldRecord(enabledConfig({ skills: { mode: "include", include: [], exclude: [] } }), "trae", meta)).toBe(false)
    expect(shouldRecord(enabledConfig({ skills: { mode: "include", include: [meta.name], exclude: [] } }), "trae", meta)).toBe(true)
    expect(shouldRecord(enabledConfig({ skills: { mode: "exclude", include: [], exclude: [meta.name] } }), "trae", meta)).toBe(false)
  })
})

describe("事件构造", () => {
  it("事件 ID 对同一 toolUseId 稳定，缺少 toolUseId 时按 2 秒窗口去重", () => {
    const now = new Date("2026-11-06T10:00:00.000Z")
    const first = computeEventId("trae", "s1", "call-1", "fxri-plan-to-task", now)
    expect(computeEventId("trae", "s1", "call-1", "fxri-plan-to-task", now)).toBe(first)
    expect(computeEventId("trae", "s1", "call-2", "fxri-plan-to-task", now)).not.toBe(first)
    const fallback = computeEventId("trae", "s1", undefined, "fxri-plan-to-task", now)
    expect(computeEventId("trae", "s1", undefined, "fxri-plan-to-task", new Date(now.getTime() + 1000))).toBe(fallback)
    expect(computeEventId("trae", "s1", undefined, "fxri-plan-to-task", new Date(now.getTime() + 3000))).not.toBe(fallback)
  })

  it("从 Skill 工具与 SKILL.md 路径识别技能名", () => {
    expect(extractSkillName("Skill", { name: "fxri-plan-to-task" })).toBe("fxri-plan-to-task")
    expect(extractSkillName("Read", { file_path: "/repo/skills/fxri-release-changelog/SKILL.md" })).toBe("fxri-release-changelog")
    expect(extractSkillName("Read", { file_path: "/repo/README.md" })).toBeNull()
  })

  it("字段开关关闭时不写入触发词与参数", () => {
    const input = {
      agent: "trae",
      sessionId: "s1",
      toolUseId: "call-1",
      skill: "fxri-plan-to-task",
      triggerPrompt: "全部任务落档",
      skillArgs: "归档任务 2",
      outcome: "success" as const,
      originAdapter: "test",
      occurredAt: new Date("2026-11-06T10:00:00.000Z"),
    }
    const off = buildEvent(input, { ...enabledConfig(), capture: { triggerPrompt: false, skillArgs: false, outcome: false } })
    expect(off.triggerPrompt).toBeUndefined()
    expect(off.skillArgs).toBeUndefined()
    expect(off.outcome).toBeUndefined()
    const on = buildEvent(input, enabledConfig())
    expect(on.triggerPrompt).toBe("全部任务落档")
    expect(on.skillArgs).toBe("归档任务 2")
    expect(on.outcome).toBe("success")
    expect(toLocalIsoString(new Date("2026-11-06T10:00:00.000Z"))).toMatch(/^2026-11-06T\d{2}:\d{2}:00\.000[+-]\d{2}:\d{2}$/)
  })
})

describe("存储与统计", () => {
  it("追加写、事件 ID 去重、统计与导出", () => {
    const root = tempDir("tk-usage-store-")
    const paths = usagePaths(root)
    const config = enabledConfig()
    const first = makeEvent({ eventId: "sha256:a", occurredAt: "2026-11-06T10:00:00.000+08:00" })
    const second = makeEvent({ eventId: "sha256:b", sessionId: "session-2", occurredAt: "2026-11-06T11:00:00.000+08:00" })
    expect(appendEvent(paths, first, config).written).toBe(true)
    expect(appendEvent(paths, first, config)).toEqual({ written: false, reason: "duplicate" })
    expect(appendEvent(paths, second, config).written).toBe(true)
    expect(readAllEvents(paths)).toHaveLength(2)
    expect(readIndex(paths).eventIds).toEqual(["sha256:a", "sha256:b"])

    const summary = summarize(readAllEvents(paths))
    expect(summary.total).toBe(2)
    expect(summary.bySkill[0]?.skill).toBe("fxri-plan-to-task")
    expect(summary.sessions).toHaveLength(2)
    expect(eventsToCsv(readAllEvents(paths))).toContain("skillSource")
    expect(unusedSkills(readAllEvents(paths))).toContain("fxri-release-changelog")
    expect(filterEvents(readAllEvents(paths), { since: new Date("2026-11-06T10:30:00.000+08:00") })).toHaveLength(1)
  })

  it("触发词聚合记录首末调用时间", () => {
    const events = [
      makeEvent({ eventId: "sha256:t1", triggerPrompt: "归档任务", occurredAt: "2026-11-06T10:00:00.000+08:00" }),
      makeEvent({ eventId: "sha256:t2", triggerPrompt: "归档任务", occurredAt: "2026-11-06T12:30:00.000+08:00" }),
    ]
    const [trigger] = summarize(events).triggers
    expect(trigger).toMatchObject({ prompt: "归档任务", count: 2, firstAt: "2026-11-06T02:00:00.000Z", lastAt: "2026-11-06T04:30:00.000Z" })
  })

  it("去重、按保留期清理与全量清理", () => {
    const root = tempDir("tk-usage-maintenance-")
    const paths = usagePaths(root)
    mkdirSync(paths.eventsDir, { recursive: true })
    const duplicate = makeEvent({ eventId: "sha256:dup", occurredAt: "2020-01-01T00:00:00.000+08:00" })
    writeFileSync(join(paths.eventsDir, "2026-11.jsonl"), `${JSON.stringify(duplicate)}\n${JSON.stringify(duplicate)}\n`, "utf8")
    expect(dedupeStore(paths)).toBe(1)
    expect(readAllEvents(paths)).toHaveLength(1)
    expect(purgeEvents(paths, { olderThanDays: 1 })).toBe(1)
    expect(readAllEvents(paths)).toHaveLength(0)
  })
})

describe("时间参数", () => {
  it("解析相对时间与日期", () => {
    const now = new Date("2026-11-06T12:00:00.000+08:00")
    expect(parseSince("1d", now)?.toISOString()).toBe("2026-11-05T04:00:00.000Z")
    expect(parseSince("2026-11-01", now)?.getFullYear()).toBe(2026)
    expect(parseSince("bad", now)).toBeNull()
  })
})
