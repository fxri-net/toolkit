// 多 Agent 适配单测：camelCase 兼容、transcript 提取与跨适配器去重
import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { codexAdapter } from "../telemetry/adapters/codex"
import { copilotAdapter } from "../telemetry/adapters/copilot"
import { cursorAdapter } from "../telemetry/adapters/cursor"
import { DEFAULT_TELEMETRY_CONFIG } from "../telemetry/config"
import { appendEvent, dedupeStore, readAllEvents, telemetryPaths } from "../telemetry/store"
import { parseTranscript } from "../telemetry/transcript"
import type { SkillUsageEvent } from "../telemetry/types"

// 临时目录统一清理
const tempDirs: string[] = []

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// 夹具路径：ESM 下没有 __dirname
function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/telemetry/${name}`, import.meta.url))
}

// 造一条最小事件
function makeEvent(overrides: Partial<SkillUsageEvent> = {}): SkillUsageEvent {
  return {
    schemaVersion: 1,
    eventId: overrides.eventId ?? `sha256:${Math.random().toString(16).slice(2)}`,
    occurredAt: "2026-11-06T10:00:00.000+08:00",
    agent: "trae",
    sessionId: "s1",
    skill: "fxri-plan-to-task",
    skillSource: "toolkit-first-party",
    managedBy: "toolkit",
    originAdapter: "test",
    toolkitVersion: "0.0.0",
    ...overrides,
  }
}

describe("多 Agent 适配", () => {
  it("Cursor / Codex / Copilot 的 camelCase 与 snake_case 均可解析", () => {
    const cursor = cursorAdapter.parseHookEvent(JSON.parse(readFileSync(fixture("cursor-post-tool-use.json"), "utf8")))
    expect(cursor).toMatchObject({ agent: "cursor", sessionId: "cursor-session-1", toolUseId: "cursor-1", toolName: "Skill" })
    const codex = codexAdapter.parseHookEvent(JSON.parse(readFileSync(fixture("codex-post-tool-use.json"), "utf8")))
    expect(codex).toMatchObject({ agent: "codex", sessionId: "codex-session-1", toolUseId: "codex-1" })
    const copilot = copilotAdapter.parseHookEvent(JSON.parse(readFileSync(fixture("copilot-post-tool-use.json"), "utf8")))
    expect(copilot).toMatchObject({ agent: "copilot", sessionId: "copilot-session-1", project: "/repo" })
  })

  it("transcript 提取 tool_use 并去重，附带最近一次用户提示", () => {
    const events = parseTranscript(readFileSync(fixture("claude-transcript.jsonl"), "utf8"))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      agent: "claude",
      sessionId: "claude-t1",
      toolUseId: "tu1",
      toolName: "Skill",
      prompt: "帮我归档任务",
      project: "/repo",
    })
  })
})

describe("跨适配器去重", () => {
  it("同一 session + toolUseId 被不同 Agent 捕获时只保留首条", () => {
    const paths = telemetryPaths(tempDir("tk-telemetry-agents-"))
    const config = DEFAULT_TELEMETRY_CONFIG
    const first = makeEvent({ eventId: "sha256:a", agent: "trae", sessionId: "s1", toolUseId: "t1" })
    const second = makeEvent({ eventId: "sha256:b", agent: "claude", sessionId: "s1", toolUseId: "t1" })
    expect(appendEvent(paths, first, config).written).toBe(true)
    expect(appendEvent(paths, second, config)).toEqual({ written: false, reason: "duplicate" })
    expect(readAllEvents(paths)).toHaveLength(1)
  })

  it("dedupe 清理历史跨适配器重复行", () => {
    const root = tempDir("tk-telemetry-agents-dedupe-")
    const paths = telemetryPaths(root)
    const dir = join(root, "events")
    mkdirSync(dir, { recursive: true })
    const first = makeEvent({ eventId: "sha256:a", agent: "trae", sessionId: "s1", toolUseId: "t1" })
    const second = makeEvent({ eventId: "sha256:b", agent: "claude", sessionId: "s1", toolUseId: "t1" })
    writeFileSync(join(dir, "2026-11.jsonl"), `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`, { encoding: "utf8", flag: "w" })
    expect(dedupeStore(paths)).toBe(1)
    expect(readAllEvents(paths)).toHaveLength(1)
  })
})
