// 作用域 glob 与路径展开：最小子集语义与边界
import { mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { matchGlob } from "../scope/glob"
import { compilePattern, matchPathPattern, matchPattern } from "../scope/pattern"
import { expandHome, normalizeRemote, resolveComparablePath } from "../scope/paths"
import { tempDir } from "./helpers"

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

describe("compilePattern", () => {
  it("默认按 glob 编译，re: 前缀切换为正则", () => {
    const glob = compilePattern("/home/u/work/**")
    expect(glob.ok && glob.pattern.kind).toBe("glob")
    const regex = compilePattern("re:^/home/u/work/(a|b)$")
    expect(regex.ok && regex.pattern.kind).toBe("regex")
    expect(regex.ok && regex.pattern.test("/home/u/work/a")).toBe(true)
    expect(regex.ok && regex.pattern.test("/home/u/work/c")).toBe(false)
  })

  it("非法正则、嵌套量词与超量量词被拒绝并给出原因", () => {
    const invalid = compilePattern("re:(")
    expect(invalid.ok).toBe(false)
    expect(invalid.ok ? "" : invalid.reason).toContain("正则无效")
    const nested = compilePattern("re:(a+)+")
    expect(nested.ok ? "" : nested.reason).toContain("嵌套量词")
    const many = compilePattern(`re:${"a?".repeat(21)}`)
    expect(many.ok ? "" : many.reason).toContain("量词超过")
    const long = compilePattern("a".repeat(201))
    expect(long.ok ? "" : long.reason).toContain("字符上限")
  })

  it("扁平标识按语法层匹配，不做路径归一", () => {
    expect(matchPattern("fxri-plan-task", "fxri-*")).toBe(true)
    expect(matchPattern("fxri-plan-task", "re:^fxri-plan-")).toBe(true)
    expect(matchPattern("other-skill", "fxri-*")).toBe(false)
  })
})

describe("matchPathPattern", () => {
  it("~ 按注入的 home 展开，相对路径按 baseDir 解析", () => {
    expect(matchPathPattern("/home/u/work/a", "~/work/**", { baseDir: "/tmp", home: "/home/u" })).toBe(true)
    expect(matchPathPattern("/home/u/other", "~/work/**", { baseDir: "/tmp", home: "/home/u" })).toBe(false)
    expect(matchPathPattern("/home/u/work/repo", "repo", { baseDir: "/home/u/work" })).toBe(true)
  })

  it("正则按归一后的路径匹配，大小写与既有 glob 口径一致", () => {
    // 夹具根在真实文件系统中不存在：macOS 的 /home 指向 /System/Volumes/Data/home，
    // 用 /home 会让历史实现改写前缀，断言随宿主文件系统漂移
    const root = "/tk-fixture/u"
    // 全平台统一不区分大小写：大写正则在小写路径上同样命中
    expect(matchPathPattern(`${root}/work/repo`, "re:^([a-z]:)?/TK-FIXTURE/U/WORK/REPO$", { baseDir: root })).toBe(true)
    expect(matchPathPattern("/TK-FIXTURE/U/Work/Repo", "re:^([a-z]:)?/tk-fixture/u/work/repo$", { baseDir: root })).toBe(true)
    expect(matchPathPattern(`${root}/work/repo`, "re:^([a-z]:)?/tk-fixture/u/other", { baseDir: root })).toBe(false)
  })
})

describe("跨平台字符串口径", () => {
  it("不解析符号链接前缀：逻辑路径与真实路径各按书写形态匹配", () => {
    expect(matchPathPattern("/tmp/work/repo", "/tmp/work/**", { baseDir: "/tmp" })).toBe(true)
    expect(matchPathPattern("/private/tmp/work/repo", "/tmp/work/**", { baseDir: "/private/tmp" })).toBe(false)
    expect(matchPathPattern("/tmp/work/repo", "re:^/tmp/work/repo$", { baseDir: "/tmp" })).toBe(true)
    expect(matchPathPattern("/private/tmp/work/repo", "re:^/tmp/work/repo$", { baseDir: "/private/tmp" })).toBe(false)
  })

  it("glob 与 re: 对同一目标给出一致结论", () => {
    const target = "/data/u/work/repo"
    const glob = matchPathPattern(target, "/data/u/work/**", { baseDir: "/data/u" })
    const regex = matchPathPattern(target, "re:^/data/u/work/", { baseDir: "/data/u" })
    expect(glob).toBe(regex)
  })

  it("真实符号链接不被解析：链接与目标各按自己的字符串匹配", () => {
    const root = tempDir("fxts-tk-scope-link-")
    const real = join(root, "real")
    mkdirSync(real)
    const link = join(root, "link")
    try {
      // Windows 用 junction（无需管理员权限），其余平台用目录软链
      symlinkSync(real, link, process.platform === "win32" ? "junction" : "dir")
    } catch {
      // 无符号链接权限时跳过该用例
      rmSync(root, { recursive: true, force: true })
      return
    }
    // 目标取真实形态：临时目录本身可能是软链（macOS /var）或短名（Windows 8.3）
    const linkKey = link.replace(/\\/g, "/")
    const realKey = realpathSync.native(real).replace(/\\/g, "/")
    expect(matchPathPattern(linkKey, `${linkKey}/**`, { baseDir: root })).toBe(true)
    expect(matchPathPattern(linkKey, `${realKey}/**`, { baseDir: root })).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })
})
