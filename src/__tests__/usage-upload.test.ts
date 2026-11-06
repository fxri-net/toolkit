// 上传单测：端点校验、dry-run 不联网、文件导出、Webhook 发送与账本幂等
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { DEFAULT_USAGE_CONFIG, normalizeUsageConfig } from "../usage/config"
import { appendEvent, usagePaths } from "../usage/store"
import { buildOtlpPayload, uploadOnce, uploadStatus, validateUploadEndpoint } from "../usage/upload"
import type { SkillUsageEvent } from "../usage/types"

// 临时现场
let home = ""
let dataDir = ""

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-usage-upload-home-"))
  dataDir = mkdtempSync(join(tmpdir(), "tk-usage-upload-data-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
})

afterEach(() => {
  vi.restoreAllMocks()
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  rmSync(home, { recursive: true, force: true })
  rmSync(dataDir, { recursive: true, force: true })
})

// 写全局配置：按需开启上传
function writeConfig(upload: Record<string, unknown>): void {
  writeFileSync(
    join(home, ".toolkitrc.json"),
    JSON.stringify({
      usage: {
        enabled: true,
        agents: { trae: true },
        sources: { firstParty: true, thirdParty: false, unmanaged: false },
        skills: { mode: "all", include: [], exclude: [] },
        capture: { triggerPrompt: false, skillArgs: false, outcome: false },
        storage: { dir: dataDir, rotation: "monthly", retentionDays: 180 },
        upload: { enabled: true, protocol: "file", endpoint: "", headers: {}, allowInsecure: false, batchSize: 100, ...upload },
      },
    }),
    "utf8",
  )
  resetToolkitConfigCache()
}

// 造一条事件并写入本地存储
function seedEvent(): SkillUsageEvent {
  const event: SkillUsageEvent = {
    schemaVersion: 1,
    eventId: "sha256:upload-1",
    occurredAt: "2026-11-06T10:00:00.000+08:00",
    agent: "trae",
    sessionId: "s1",
    skill: "fxri-plan-to-task",
    skillSource: "toolkit-first-party",
    managedBy: "toolkit",
    originAdapter: "test",
    toolkitVersion: "0.0.0",
  }
  appendEvent(usagePaths(dataDir), event, DEFAULT_USAGE_CONFIG)
  return event
}

describe("上传端点校验", () => {
  it("非 localhost 必须 HTTPS，localhost 可用 HTTP", () => {
    const base = normalizeUsageConfig({ upload: { enabled: true, protocol: "webhook", endpoint: "http://example.com/hook" } })
    expect(() => validateUploadEndpoint(base)).toThrow("HTTPS")
    const local = normalizeUsageConfig({ upload: { enabled: true, protocol: "webhook", endpoint: "http://localhost:8080/hook" } })
    expect(validateUploadEndpoint(local)?.hostname).toBe("localhost")
    const secure = normalizeUsageConfig({ upload: { enabled: true, protocol: "webhook", endpoint: "https://example.com/hook" } })
    expect(validateUploadEndpoint(secure)?.protocol).toBe("https:")
  })

  it("OTLP 载荷包含 resourceLogs 与 logRecords", () => {
    const event = seedEvent()
    const payload = buildOtlpPayload([event]) as { resourceLogs: Array<{ scopeLogs: Array<{ logRecords: unknown[] }> }> }
    expect(payload.resourceLogs[0]?.scopeLogs[0]?.logRecords).toHaveLength(1)
  })
})

describe("上传执行", () => {
  it("dry-run 不发请求、不写账本；文件协议发送后账本幂等", async () => {
    const target = join(dataDir, "export", "events.jsonl")
    writeConfig({ protocol: "file", endpoint: target })
    seedEvent()
    const preview = await uploadOnce({ dryRun: true })
    expect(preview.pending).toBe(1)
    expect(existsSync(target)).toBe(false)
    expect(existsSync(join(dataDir, "upload-ledger.json"))).toBe(false)

    const sent = await uploadOnce({})
    expect(sent.sent).toBe(1)
    expect(readFileSync(target, "utf8")).toContain("sha256:upload-1")
    const ledger = JSON.parse(readFileSync(join(dataDir, "upload-ledger.json"), "utf8"))
    expect(ledger.sent).toEqual(["sha256:upload-1"])

    const again = await uploadOnce({})
    expect(again.sent).toBe(0)
    expect(again.pending).toBe(0)
  })

  it("Webhook dry-run 不调用 fetch，发送一次后进入账本", async () => {
    writeConfig({ protocol: "webhook", endpoint: "https://example.com/hook" })
    seedEvent()
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response)
    vi.stubGlobal("fetch", fetchMock)
    await uploadOnce({ dryRun: true })
    expect(fetchMock).not.toHaveBeenCalled()
    const result = await uploadOnce({})
    expect(result.sent).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const status = uploadStatus()
    expect(status.sent).toBe(1)
    expect(status.pending).toBe(0)
  })

  it("未启用上传时直接报错", async () => {
    writeConfig({ enabled: false })
    await expect(uploadOnce({})).rejects.toThrow("上传未启用")
  })
})

describe("静态网络边界", () => {
  it("除 upload.ts 外，使用情况模块不出现网络调用", () => {
    const root = join(process.cwd(), "src", "usage")
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (name.endsWith(".ts") && name !== "upload.ts") files.push(full)
      }
    }
    walk(root)
    for (const file of files) {
      const content = readFileSync(file, "utf8")
      expect(content, file).not.toMatch(/\bfetch\s*\(/)
      expect(content, file).not.toMatch(/https?\.request\s*\(/)
    }
  })
})
