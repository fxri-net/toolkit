// 会话反查单测：JSONL 解析、Claude 会话定位、Agent 识别与不可用降级
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { parseSessionJsonl } from "../usage/sessions/jsonl"
import { findClaudeSessionFile, lookupClaudeSession } from "../usage/sessions/claude"
import { detectAgent } from "../usage/sessions"

let home = ""

// Claude 会话样本：一次带触发词、参数的技能调用与成功结果
const CLAUDE_LINES = [
  { type: "user", message: { role: "user", content: "把这次方案落档" }, timestamp: "2026-11-07T10:00:00.000+08:00" },
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "调用技能" },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "Skill",
          input: { name: "fxri-plan-to-task", args: { path: "x" } },
        },
      ],
    },
    timestamp: "2026-11-07T10:00:01.000+08:00",
  },
  {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok", is_error: false }],
    },
    timestamp: "2026-11-07T10:00:02.500+08:00",
  },
]

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-usage-sessions-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
})

afterEach(() => {
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  delete process.env.CLAUDE_CONFIG_DIR
  delete process.env.TOOLKIT_USAGE_AGENT
  delete process.env.CLAUDE_SESSION_ID
  delete process.env.TRAE_SESSION_ID
  delete process.env.DSH_SESSION_ID
  rmSync(home, { recursive: true, force: true })
})

describe("会话 JSONL 解析", () => {
  it("提取技能名、触发词、参数、结果与耗时", () => {
    const calls = parseSessionJsonl(CLAUDE_LINES.map((line) => JSON.stringify(line)).join("\n"))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.skill).toBe("fxri-plan-to-task")
    expect(calls[0]?.prompt).toBe("把这次方案落档")
    expect(calls[0]?.args).toContain('"path"')
    expect(calls[0]?.outcome).toBe("success")
    expect(calls[0]?.durationMs).toBe(1500)
  })

  it("无技能调用的记录返回空数组，损坏行被跳过", () => {
    const text = ["{broken", JSON.stringify({ type: "user", message: { content: "hi" } })].join("\n")
    expect(parseSessionJsonl(text)).toEqual([])
  })
})

describe("Claude 会话定位", () => {
  it("按 session id 命中同名文件并解析出调用", () => {
    const dir = join(home, ".claude", "projects", "-d-work-demo")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "sess-1.jsonl"), CLAUDE_LINES.map((line) => JSON.stringify(line)).join("\n"), "utf8")
    expect(findClaudeSessionFile("sess-1")).toBe(join(dir, "sess-1.jsonl"))
    const found = lookupClaudeSession("sess-1")
    expect(found?.calls[0]?.skill).toBe("fxri-plan-to-task")
  })

  it("目录不存在或文件无调用时返回 null", () => {
    expect(findClaudeSessionFile("nope")).toBeNull()
    expect(lookupClaudeSession("nope")).toBeNull()
  })
})

describe("Agent 识别", () => {
  it("显式变量优先，其次各 Agent 变量与目录", () => {
    expect(detectAgent({ TOOLKIT_USAGE_AGENT: "custom" })).toBe("custom")
    expect(detectAgent({ CLAUDE_SESSION_ID: "s" })).toBe("claude")
    expect(detectAgent({ TRAE_SESSION_ID: "s" })).toBe("trae")
    expect(detectAgent({ DSH_SESSION_ID: "s" })).toBe("dsh")
    mkdirSync(join(home, ".trae-cn"), { recursive: true })
    expect(detectAgent({})).toBe("trae")
  })
})
