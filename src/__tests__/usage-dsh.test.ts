// DeepSeek Harness 适配单测：cordis.patch.yml 标记块、桥接插件检测、Hook 安装往返与事件解析
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { resolveAdapters } from "../usage/adapters"
import { dshAdapter } from "../usage/adapters/dsh"
import {
  DSH_BLOCK_START,
  DSH_BRIDGE_PLUGIN,
  profileHasBridgePlugin,
  profileHasToolkitBlock,
  profilePatchIsArray,
  removeToolkitBlock,
  upsertToolkitBlock,
} from "../usage/dsh-profile"
import { extractSkillName } from "../usage/event"
import { buildHookCommand } from "../usage/hook-command"

let home = ""

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk dsh home-"))
  setHomeDirForTest(home)
  // 显式钉住 dsh 家目录，避免读本机真实配置
  process.env.DSH_HOME = join(home, ".dsh")
  resetToolkitConfigCache()
})

afterEach(() => {
  delete process.env.DSH_HOME
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  rmSync(home, { recursive: true, force: true })
})

// 造一个 profile：补丁文件内容按用例给定
function makeProfile(name: string, patch: string, dependencies: Record<string, string> = {}): string {
  const dir = join(home, ".dsh", "profiles", name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "cordis.patch.yml"), patch, "utf8")
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `dsh-profile-${name}`, dependencies }, null, 2), "utf8")
  return dir
}

describe("cordis.patch.yml 标记块", () => {
  it("空文件与注释文件都能追加，且幂等", () => {
    const appended = upsertToolkitBlock("", "/home/.dsh/hooks.json")
    expect(appended.startsWith(DSH_BLOCK_START)).toBe(true)
    expect(appended.endsWith("\n")).toBe(true)
    expect(upsertToolkitBlock(appended, "/home/.dsh/hooks.json")).toBe(appended)

    const commentOnly = "# 我的补丁层\n"
    const withBlock = upsertToolkitBlock(commentOnly, "/home/.dsh/hooks.json")
    expect(withBlock).toContain("# 我的补丁层")
    expect(withBlock).toContain(DSH_BLOCK_START)
  })

  it("文件内已有空数组 [] 时整体替换，不并存", () => {
    const next = upsertToolkitBlock("# 补丁层\n[]\n", "/home/.dsh/hooks.json")
    expect(next).not.toContain("[]")
    expect(next).toContain("configPath: '/home/.dsh/hooks.json'")
  })

  it("已有其它条目时追加到末尾，configPath 变更原位替换", () => {
    const original = "# 补丁层\n- id: ui-chat\n  name: \"@deepseek-ai/dsh-client-ui-chat\"\n"
    const first = upsertToolkitBlock(original, "/home/.dsh/hooks.json")
    expect(first).toContain("- id: ui-chat")
    expect(first.indexOf(DSH_BLOCK_START)).toBeGreaterThan(first.indexOf("ui-chat"))

    const moved = upsertToolkitBlock(first, "D:/Tools/.dsh/hooks.json")
    expect(moved.match(new RegExp(DSH_BLOCK_START, "g"))).toHaveLength(1)
    expect(moved).toContain("configPath: 'D:/Tools/.dsh/hooks.json'")
    expect(moved).not.toContain("/home/.dsh/hooks.json")
  })

  it("删除后无其它条目时补回 []，有其它条目时保持原样", () => {
    const only = upsertToolkitBlock("# 补丁层\n[]\n", "/home/.dsh/hooks.json")
    const cleaned = removeToolkitBlock(only)
    expect(cleaned).not.toContain(DSH_BLOCK_START)
    expect(cleaned).toContain("[]")

    const withOther = upsertToolkitBlock("- id: ui-chat\n  name: \"@deepseek-ai/dsh-client-ui-chat\"\n", "/home/.dsh/hooks.json")
    const cleanedOther = removeToolkitBlock(withOther)
    expect(cleanedOther).not.toContain(DSH_BLOCK_START)
    expect(cleanedOther).toContain("- id: ui-chat")
    expect(cleanedOther).not.toContain("[]")
  })

  it("保留原文件行尾（CRLF）", () => {
    const next = upsertToolkitBlock("[]\r\n", "/home/.dsh/hooks.json")
    expect(next).toContain("\r\n")
    expect(next.replace(/\r\n/g, "")).not.toContain("\n")
  })
})

describe("profile 现场检测", () => {
  it("桥接插件依赖与标记块分别可查", () => {
    const dir = makeProfile("desktop", "[]\n")
    expect(profileHasToolkitBlock(dir)).toBe(false)
    expect(profileHasBridgePlugin(dir)).toBe(false)
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { [DSH_BRIDGE_PLUGIN]: "0.0.1-rc.5" } }), "utf8")
    expect(profileHasBridgePlugin(dir)).toBe(true)
  })

  it("顶层数组与其它结构可区分", () => {
    expect(profilePatchIsArray(makeProfile("array-empty", "[]\n"))).toBe(true)
    expect(profilePatchIsArray(makeProfile("array-items", "# 注释\n- id: ui-chat\n  name: x\n"))).toBe(true)
    expect(profilePatchIsArray(makeProfile("object", "agent:\n  model: deepseek-flash\n"))).toBe(false)
  })

  it("非数组结构不写入并给出告警", () => {
    const dir = makeProfile("objects", "agent:\n  model: deepseek-flash\n")
    const install = dshAdapter.installHooks({ command: "cmd" })
    expect(profileHasToolkitBlock(dir)).toBe(false)
    expect(readFileSync(join(dir, "cordis.patch.yml"), "utf8")).toBe("agent:\n  model: deepseek-flash\n")
    expect(install.warnings?.join("\n")).toContain("不是顶层数组")
    expect(dshAdapter.status().warnings?.join("\n")).toContain("不是顶层数组")
  })
})

describe("dsh 适配器", () => {
  it("安装同时写 Hook 文件与 profile 标记块，缺插件时告警；卸载精确回滚", () => {
    const dir = makeProfile("desktop", "[]\n")
    const command = buildHookCommand("dsh", "/opt/cli.js", "/opt/node", process.platform)
    const install = dshAdapter.installHooks({ command })
    expect(install.changed).toBe(true)
    expect(install.file.endsWith(join(".dsh", "hooks.json"))).toBe(true)
    expect(profileHasToolkitBlock(dir)).toBe(true)
    expect(install.warnings?.join("\n")).toContain("未安装桥接插件")

    const event = JSON.parse(readFileSync(join(home, ".dsh", "hooks.json"), "utf8")) as {
      hooks: { PostToolUse: Array<{ hooks: Array<{ command: string }> }> }
    }
    expect(event.hooks.PostToolUse[0]?.hooks[0]?.command).toBe(command)
    expect(dshAdapter.status().installed).toBe(true)
    expect(dshAdapter.status().warnings?.join("\n")).toContain("未安装桥接插件")

    // 装好插件后状态告警消失
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { [DSH_BRIDGE_PLUGIN]: "0.0.1-rc.5" } }), "utf8")
    expect(dshAdapter.status().warnings).toHaveLength(0)

    const removed = dshAdapter.uninstallHooks()
    expect(removed.changed).toBe(true)
    expect(profileHasToolkitBlock(dir)).toBe(false)
    expect(readFileSync(join(dir, "cordis.patch.yml"), "utf8")).toContain("[]")
    expect(dshAdapter.status().installed).toBe(false)
  })

  it("dry-run 不落盘", () => {
    const dir = makeProfile("desktop", "[]\n")
    const install = dshAdapter.installHooks({ command: "cmd", dryRun: true })
    expect(install.changed).toBe(true)
    expect(profileHasToolkitBlock(dir)).toBe(false)
    expect(() => readFileSync(join(home, ".dsh", "hooks.json"), "utf8")).toThrow()
  })

  it("解析 Claude Code 方言的 skill 工具调用", () => {
    const event = dshAdapter.parseHookEvent({
      session_id: "dsh-session-1",
      hook_event_name: "PostToolUse",
      tool_name: "skill",
      tool_input: { name: "fxri-plan-to-task" },
      tool_response: "ok",
      cwd: "/repo",
    })
    expect(event).toMatchObject({ agent: "dsh", sessionId: "dsh-session-1", toolName: "skill", project: "/repo" })
    expect(extractSkillName(event?.toolName, event?.toolInput)).toBe("fxri-plan-to-task")
  })
})

describe("本机安装检测", () => {
  it("未安装 dsh 时显式指定进入 unavailable，清理场景仍可处理", () => {
    mkdirSync(join(home, ".dsh"), { recursive: true })
    expect(dshAdapter.detect()).toBe(true)
    expect(resolveAdapters(["dsh"]).adapters.map((adapter) => adapter.id)).toEqual(["dsh"])

    rmSync(join(home, ".dsh"), { recursive: true, force: true })
    expect(dshAdapter.detect()).toBe(false)
    const resolved = resolveAdapters(["dsh"])
    expect(resolved.adapters).toHaveLength(0)
    expect(resolved.unavailable).toEqual(["dsh"])
    expect(resolveAdapters(["dsh"], { allowUnavailable: true }).adapters.map((adapter) => adapter.id)).toEqual(["dsh"])
  })
})
