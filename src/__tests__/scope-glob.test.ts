// 作用域 glob 与路径展开：最小子集语义与边界
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { matchGlob } from "../scope/glob"
import { expandHome, normalizeRemote, resolveComparablePath } from "../scope/paths"

describe("matchGlob", () => {
  it("** 可跨层且允许零层", () => {
    expect(matchGlob("/home/u/work/a/b", "/home/u/work/**")).toBe(true)
    expect(matchGlob("/home/u/work", "/home/u/work/**")).toBe(true)
    expect(matchGlob("/home/u/workx/a", "/home/u/work/**")).toBe(false)
  })

  it("* 不跨路径分隔符，? 匹配单字符", () => {
    expect(matchGlob("/home/u/work/a", "/home/u/*/a")).toBe(true)
    expect(matchGlob("/home/u/work/a", "/home/u/work/?")).toBe(true)
    expect(matchGlob("/home/u/work/x/a", "/home/u/*/a")).toBe(false)
  })

  it("大小写与分隔符按统一口径比较", () => {
    expect(matchGlob("C:\\Users\\U\\Work\\A", "c:/users/u/work/**")).toBe(true)
    expect(matchGlob("/home/u/work/a/", "/home/u/work/**")).toBe(true)
  })
})

describe("expandHome", () => {
  it("展开 ~ 与 ~/ 前缀，其余原样", () => {
    expect(expandHome("~/work", "/home/u")).toBe(join("/home/u", "work"))
    expect(expandHome("~", "/home/u")).toBe("/home/u")
    expect(expandHome("/abs/path", "/home/u")).toBe("/abs/path")
  })
})

describe("normalizeRemote", () => {
  it("https / ssh / scp 三种写法归一为同一形态", () => {
    expect(normalizeRemote("https://github.com/acme/repo.git")).toBe("github.com/acme/repo")
    expect(normalizeRemote("git@github.com:acme/repo.git")).toBe("github.com/acme/repo")
    expect(normalizeRemote("ssh://git@github.com/acme/repo.git")).toBe("github.com/acme/repo")
  })
})

describe("resolveComparablePath", () => {
  it("相对路径按基准解析为绝对路径", () => {
    expect(resolveComparablePath("work", "/home/u").endsWith("work")).toBe(true)
  })
})
