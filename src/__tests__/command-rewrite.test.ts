// 旧路径重写与命中记录：覆盖分组迁移、参数保留、门闸取值映射与非命令位置不误改
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { rmSync } from "node:fs"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { recordDeprecationHits, rewriteDeprecatedArgv, takeDeprecationHits } from "../command-registry"
import { tempDir } from "./helpers"

let home = ""

beforeEach(() => {
  home = tempDir("fxts-tk-rewrite-")
  setHomeDirForTest(home)
  resetToolkitConfigCache()
})

afterEach(() => {
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  rmSync(home, { recursive: true, force: true })
})

describe("rewriteDeprecatedArgv：旧路径 → 新路径", () => {
  it("域名分组：usage info / stats 与 data / config / setup 组", () => {
    expect(rewriteDeprecatedArgv(["usage", "info", "--dir", "d"]).argv).toEqual(["usage", "show", "--dir", "d"])
    expect(rewriteDeprecatedArgv(["usage", "stats", "--by", "session"]).argv).toEqual(["usage", "show", "stats", "--by", "session"])
    expect(rewriteDeprecatedArgv(["usage", "export", "--type", "csv"]).argv).toEqual(["usage", "data", "export", "--type", "csv"])
    expect(rewriteDeprecatedArgv(["usage", "channel", "hook"]).argv).toEqual(["usage", "config", "channel", "hook"])
    expect(rewriteDeprecatedArgv(["usage", "hooks", "status"]).argv).toEqual(["usage", "setup", "hooks", "status"])
  })

  it("生命周期开关改写到 config set，并注入非交互确认", () => {
    const enabled = rewriteDeprecatedArgv(["usage", "enable"])
    expect(enabled.argv).toEqual(["config", "set", "usage.enabled", "true", "--yes"])
    expect(enabled.note).toContain("config set usage.enabled")
    expect(rewriteDeprecatedArgv(["usage", "disable", "--format", "json"]).argv).toEqual([
      "config",
      "set",
      "usage.enabled",
      "false",
      "--yes",
      "--format",
      "json",
    ])
  })

  it("scope 旧顶层名单命令改写为 allow / deny，当前命令不重写", () => {
    expect(rewriteDeprecatedArgv(["scope", "add", "work", "--layer", "project"]).argv).toEqual([
      "scope",
      "allow",
      "work",
      "--layer",
      "project",
    ])
    expect(rewriteDeprecatedArgv(["scope", "exclude", "legacy"]).argv).toEqual(["scope", "deny", "legacy"])
    expect(rewriteDeprecatedArgv(["scope", "reset"]).argv).toEqual(["scope", "reset"])
    expect(rewriteDeprecatedArgv(["scope", "remove", "work"]).argv).toEqual(["scope", "remove", "work"])
  })

  it("发版子命令改名与 changeset 分组", () => {
    expect(rewriteDeprecatedArgv(["changelog", "version", "--history"]).argv).toEqual(["release", "bump", "--history"])
    expect(rewriteDeprecatedArgv(["changelog", "format"]).argv).toEqual(["release", "changelog"])
    expect(rewriteDeprecatedArgv(["changelog", "doc", "--check"]).argv).toEqual(["release", "mirror", "--check"])
    expect(rewriteDeprecatedArgv(["changelog", "add"]).argv).toEqual(["release", "changeset", "add"])
  })

  it("顶层旧名重写到单数对象，长路径优先匹配", () => {
    expect(rewriteDeprecatedArgv(["tasks", "check"]).argv).toEqual(["task", "check"])
    expect(rewriteDeprecatedArgv(["skills", "install", "--yes"]).argv).toEqual(["skill", "install", "--yes"])
    expect(rewriteDeprecatedArgv(["rules", "compose"]).argv).toEqual(["rule", "compose"])
    expect(rewriteDeprecatedArgv(["conventions", "status"]).argv).toEqual(["convention", "status"])
    expect(rewriteDeprecatedArgv(["changelog", "mirror", "--check"]).argv).toEqual(["release", "mirror", "--check"])
    // 长路径规则先于顶层规则：旧发版子命令不会被简化成 release version
    expect(rewriteDeprecatedArgv(["changelog", "version"]).argv).toEqual(["release", "bump"])
  })

  it("skills 低频下沉：path 与 gate 的取值映射", () => {
    expect(rewriteDeprecatedArgv(["skills", "path", "--format", "json"]).argv).toEqual(["skill", "status", "--path", "--format", "json"])
    expect(rewriteDeprecatedArgv(["skills", "sources", "refresh"]).argv).toEqual(["skill", "source", "refresh"])

    // 查询：不带取值时走 config get，--format 的取值不被误当位置参数
    expect(rewriteDeprecatedArgv(["skills", "gate", "--format", "json"]).argv).toEqual([
      "config",
      "get",
      "skillDelivery.default",
      "--format",
      "json",
    ])
    // 切换：on / off 映射为 gated / full
    expect(rewriteDeprecatedArgv(["skills", "gate", "on"]).argv).toEqual([
      "config",
      "set",
      "skillDelivery.default",
      "gated",
      "--yes",
    ])
    expect(rewriteDeprecatedArgv(["skills", "gate", "off", "--format", "json"]).argv).toEqual([
      "config",
      "set",
      "skillDelivery.default",
      "full",
      "--format",
      "json",
      "--yes",
    ])
  })

  it("只匹配命令起始处：位置参数里的同名 token 不触发重写", () => {
    const untouched = rewriteDeprecatedArgv(["task", "export", "usage"])
    expect(untouched.argv).toEqual(["task", "export", "usage"])
    expect(untouched.hit).toBeNull()
    // 旧顶层名只改写首 token，第三个 token 是文件名，保持原样
    expect(rewriteDeprecatedArgv(["tasks", "export", "usage"]).argv).toEqual(["task", "export", "usage"])
    expect(rewriteDeprecatedArgv(["usage"]).hit).toBeNull()
    expect(rewriteDeprecatedArgv(["usage", "record"]).hit).toBeNull()
  })
})

describe("弃用命中记录：写入后由 status 消费一次", () => {
  it("记录两次后读取返回全部并清空文件", () => {
    const first = rewriteDeprecatedArgv(["usage", "info"]).hit!
    const second = rewriteDeprecatedArgv(["skills", "path"]).hit!
    recordDeprecationHits([first])
    recordDeprecationHits([second])
    const hits = takeDeprecationHits()
    expect(hits.map((hit) => hit.from)).toEqual(["toolkit usage info", "toolkit skills path"])
    expect(takeDeprecationHits()).toEqual([])
  })
})
