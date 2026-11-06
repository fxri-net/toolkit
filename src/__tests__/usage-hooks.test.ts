// Hook 适配器单测：标准事件解析、安装 / 状态 / 卸载往返、触发词缓存与事件落盘
import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { claudeAdapter } from "../usage/adapters/claude"
import { traeAdapter } from "../usage/adapters/trae"
import { installStandardHooks, parseStandardEvent, standardHookStatus, uninstallStandardHooks } from "../usage/adapters/standard"
import { buildHookCommand, isCurrentHookCommand } from "../usage/hook-command"
import { DEFAULT_USAGE_CONFIG } from "../usage/config"
import { processHookEvent, readPromptCache } from "../usage/ingest"
import { readAllEvents, usagePaths } from "../usage/store"
import type { NormalizedHookEvent, UsageConfig } from "../usage/types"

// 临时目录统一清理
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
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// 全开配置：Hook 事件可直接落盘
function enabledConfig(): UsageConfig {
  return {
    ...DEFAULT_USAGE_CONFIG,
    enabled: true,
    agents: { trae: true, claude: true },
    sources: { firstParty: true, thirdParty: true, unmanaged: true },
    skills: { mode: "all", include: [], exclude: [] },
    capture: { triggerPrompt: true, skillArgs: true, outcome: true },
  }
}

// 测试夹具绝对路径：ESM 下没有 __dirname
function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/usage/${name}`, import.meta.url))
}

describe("标准 Hook 事件解析", () => {
  it("解析 Trae PostToolUse 与 UserPromptSubmit", () => {
    const post = JSON.parse(readFileSync(fixture("trae-post-tool-use.json"), "utf8"))
    const event = parseStandardEvent("trae", "trae-hooks", post)
    expect(event).toMatchObject({
      agent: "trae",
      sessionId: "trae-session-1",
      toolUseId: "call-1",
      toolName: "Skill",
      project: "/repo",
    })
    const prompt = JSON.parse(readFileSync(fixture("trae-user-prompt.json"), "utf8"))
    expect(parseStandardEvent("trae", "trae-hooks", prompt)).toMatchObject({
      sessionId: "trae-session-1",
      prompt: "全部任务落档，按计划执行",
    })
  })

  it("解析 Claude 读取 SKILL.md 的工具调用", () => {
    const raw = JSON.parse(readFileSync(fixture("claude-post-tool-use.json"), "utf8"))
    const event = parseStandardEvent("claude", "claude-hooks", raw)
    expect(event?.toolName).toBe("Read")
    expect(event?.toolInput).toMatchObject({ file_path: "/repo/skills/fxri-release-changelog/SKILL.md" })
  })
})

describe("Hook 配置安装与卸载", () => {
  it("安装幂等、状态可查、卸载后不残留", () => {
    const home = tempDir("tk-hook-home-")
    setHomeDirForTest(home)
    mkdirSync(join(home, ".trae-cn"), { recursive: true })
    const command = `"node" "cli.js" usage ingest --agent trae`
    const first = traeAdapter.installHooks({ command })
    expect(first.changed).toBe(true)
    const config = JSON.parse(readFileSync(join(home, ".trae-cn", "hooks.json"), "utf8"))
    expect(config.version).toBe(1)
    expect(config.hooks.PostToolUse).toHaveLength(1)
    expect(config.hooks.UserPromptSubmit).toHaveLength(1)
    expect(traeAdapter.status().installed).toBe(true)
    expect(traeAdapter.installHooks({ command }).changed).toBe(false)
    const removed = traeAdapter.uninstallHooks()
    expect(removed.changed).toBe(true)
    const after = JSON.parse(readFileSync(join(home, ".trae-cn", "hooks.json"), "utf8"))
    expect(after.hooks.PostToolUse).toBeUndefined()
    expect(after.hooks.UserPromptSubmit).toBeUndefined()
    expect(traeAdapter.status().installed).toBe(false)
  })

  it("识别并清理旧版 telemetry Hook", () => {
    const file = join(tempDir("tk-hook-legacy-"), "hooks.json")
    const legacy = `"node" "cli.js" telemetry ingest --agent trae`
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        hooks: {
          PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: legacy, timeout: 10 }] }],
          UserPromptSubmit: [{ hooks: [{ type: "command", command: legacy, timeout: 10 }] }],
        },
      }),
      "utf8",
    )
    const status = standardHookStatus(file, "trae", "Trae")
    expect(status.installed).toBe(false)
    expect(status.legacyCommand).toContain("telemetry ingest")
    expect(installStandardHooks(file, "trae", `"node" "cli.js" usage ingest --agent trae`).changed).toBe(true)
    const text = JSON.stringify(JSON.parse(readFileSync(file, "utf8")))
    expect(text).not.toContain("telemetry ingest")
    expect(text).toContain("usage ingest")
    expect(standardHookStatus(file, "trae", "Trae").legacyCommand).toBeUndefined()
  })

  it("Hook 命令中的 node / CLI 路径失效时状态可报出", () => {
    const file = join(tempDir("tk-hook-missing-"), "hooks.json")
    const command = `"C:\\no-such-dir\\node.exe" "C:\\no-such-dir\\cli.js" usage ingest --agent trae`
    writeFileSync(file, JSON.stringify({ version: 1, hooks: { PostToolUse: [{ hooks: [{ type: "command", command, timeout: 10 }] }] } }), "utf8")
    const status = standardHookStatus(file, "trae", "Trae")
    expect(status.installed).toBe(true)
    expect(status.missingPaths).toHaveLength(2)
  })

  it("非法 JSON 不覆盖原文件", () => {
    const file = join(tempDir("tk-hook-bad-"), "hooks.json")
    writeFileSync(file, "{bad", "utf8")
    expect(() => installStandardHooks(file, "trae", "cmd")).toThrow()
    expect(readFileSync(file, "utf8")).toBe("{bad")
    expect(() => uninstallStandardHooks(file, "trae")).toThrow()
    expect(readFileSync(file, "utf8")).toBe("{bad")
  })

  it("Claude 使用 settings.json 且保留其它设置", () => {
    const home = tempDir("tk-hook-claude-")
    setHomeDirForTest(home)
    mkdirSync(join(home, ".claude"), { recursive: true })
    const file = join(home, ".claude", "settings.json")
    writeFileSync(file, JSON.stringify({ permissions: { allow: ["Read"] } }), "utf8")
    claudeAdapter.installHooks({ command: `"node" "cli.js" usage ingest --agent claude` })
    const config = JSON.parse(readFileSync(file, "utf8"))
    expect(config.permissions.allow).toEqual(["Read"])
    expect(config.hooks.PostToolUse).toHaveLength(1)
    expect(claudeAdapter.status().installed).toBe(true)
  })
})

describe("Hook 命令的平台形态", () => {
  it("Windows 经 PowerShell 调用运算符拼接，POSIX 用单引号原样拼接", () => {
    expect(buildHookCommand("trae", "/opt/cli.js", "/opt/node", "win32")).toBe(
      `powershell -NoProfile -Command "& '/opt/node' '/opt/cli.js' usage ingest --agent trae"`,
    )
    expect(buildHookCommand("trae", "/opt/cli.js", "/opt/node", "linux")).toBe(`'/opt/node' '/opt/cli.js' usage ingest --agent trae`)
    expect(buildHookCommand("trae", "/opt/cli.js", "/opt/node", "darwin")).toBe(`'/opt/node' '/opt/cli.js' usage ingest --agent trae`)
  })

  it("路径含单引号时按各自 shell 规则转义", () => {
    // POSIX：' → '\''；PowerShell：' → ''
    expect(buildHookCommand("trae", "/tmp/o'b/cli.js", "/tmp/o'b/node", "linux")).toBe(
      `'/tmp/o'\\''b/node' '/tmp/o'\\''b/cli.js' usage ingest --agent trae`,
    )
    expect(buildHookCommand("trae", "C:\\o'b\\cli.js", "C:\\o'b\\node.exe", "win32")).toBe(
      `powershell -NoProfile -Command "& 'C:\\o''b\\node.exe' 'C:\\o''b\\cli.js' usage ingest --agent trae"`,
    )
  })

  it("判定已安装命令是否为当前平台形态", () => {
    const win = buildHookCommand("trae", "/opt/cli.js", "/opt/node", "win32")
    const posix = buildHookCommand("trae", "/opt/cli.js", "/opt/node", "linux")
    const old = `"node" "cli.js" usage ingest --agent trae`
    expect(isCurrentHookCommand(win, "trae", "win32")).toBe(true)
    expect(isCurrentHookCommand(posix, "trae", "linux")).toBe(true)
    expect(isCurrentHookCommand(old, "trae", "win32")).toBe(false)
    expect(isCurrentHookCommand(win, "trae", "linux")).toBe(false)
    expect(isCurrentHookCommand(posix, "claude", "linux")).toBe(false)
  })

  it("旧形态命令在状态中标记为过期，新形态不标", () => {
    const oldFile = join(tempDir("tk-hook-outdated-"), "hooks.json")
    const old = `"C:\\no-such-dir\\node.exe" "C:\\no-such-dir\\cli.js" usage ingest --agent trae`
    writeFileSync(oldFile, JSON.stringify({ version: 1, hooks: { PostToolUse: [{ hooks: [{ type: "command", command: old, timeout: 10 }] }] } }), "utf8")
    const oldStatus = standardHookStatus(oldFile, "trae", "Trae")
    expect(oldStatus.outdatedCommand).toBe(old)
    // 旧形态仍按双引号提取路径，失效路径照常报出
    expect(oldStatus.missingPaths).toHaveLength(2)

    const newFile = join(tempDir("tk-hook-current-"), "hooks.json")
    const current = buildHookCommand("trae", "/opt/cli.js", "/opt/node", process.platform)
    writeFileSync(newFile, JSON.stringify({ version: 1, hooks: { PostToolUse: [{ hooks: [{ type: "command", command: current, timeout: 10 }] }] } }), "utf8")
    const newStatus = standardHookStatus(newFile, "trae", "Trae")
    expect(newStatus.outdatedCommand).toBeUndefined()
    expect(newStatus.missingPaths).toHaveLength(2)
  })

  it("重装会把旧形态命令替换为新形态", () => {
    const file = join(tempDir("tk-hook-replace-"), "hooks.json")
    const old = `"node" "cli.js" usage ingest --agent trae`
    installStandardHooks(file, "trae", old)
    const next = buildHookCommand("trae", "/opt/cli.js", "/opt/node", process.platform)
    expect(installStandardHooks(file, "trae", next).changed).toBe(true)
    const config = JSON.parse(readFileSync(file, "utf8"))
    const commands = [...config.hooks.PostToolUse, ...config.hooks.UserPromptSubmit].flatMap((group: { hooks: { command: string }[] }) =>
      group.hooks.map((hook) => hook.command),
    )
    // 两个事件组都用新命令，旧形态不再残留
    expect(commands).toEqual([next, next])
    expect(standardHookStatus(file, "trae", "Trae").outdatedCommand).toBeUndefined()
  })
})

describe("Hook 事件处理", () => {
  it("缓存触发词并在 PostToolUse 中写入事件", () => {
    const root = tempDir("tk-hook-ingest-")
    const paths = usagePaths(root)
    const config = enabledConfig()
    const promptEvent: NormalizedHookEvent = {
      agent: "trae",
      sessionId: "s1",
      prompt: "全部任务落档",
      originAdapter: "trae-hooks",
    }
    expect(processHookEvent(promptEvent, config, paths).status).toBe("cached")
    expect(readPromptCache(paths, "s1")).toBe("全部任务落档")

    const postEvent: NormalizedHookEvent = {
      agent: "trae",
      sessionId: "s1",
      toolUseId: "call-1",
      toolName: "Skill",
      toolInput: { name: "fxri-plan-to-task" },
      toolResponse: { success: true, duration_ms: 1200 },
      originAdapter: "trae-hooks",
    }
    expect(processHookEvent(postEvent, config, paths)).toMatchObject({ status: "written", skill: "fxri-plan-to-task" })
    expect(processHookEvent(postEvent, config, paths).status).toBe("duplicate")
    const events = readAllEvents(paths)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      skill: "fxri-plan-to-task",
      triggerPrompt: "全部任务落档",
      outcome: "success",
      durationMs: 1200,
    })
  })

  it("未启用时不写事件也不缓存触发词", () => {
    const root = tempDir("tk-hook-disabled-")
    const paths = usagePaths(root)
    const config = { ...enabledConfig(), enabled: false }
    const promptEvent: NormalizedHookEvent = { agent: "trae", sessionId: "s1", prompt: "x", originAdapter: "trae-hooks" }
    expect(processHookEvent(promptEvent, config, paths).status).toBe("disabled")
    expect(readAllEvents(paths)).toHaveLength(0)
    expect(readPromptCache(paths, "s1")).toBeUndefined()
  })
})
