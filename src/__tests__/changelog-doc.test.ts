// 文档站镜像回归：转换、分页、校验与幂等行为须被覆盖，防止站点更新页静默产出错页
import { describe, it, expect, afterEach, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { ARCHIVE_MARKER, buildDocPage, buildDocPages, checkDoc, resolveDocOptions, syncDoc, syncDocAfterVersion, type DocOptions } from "../changelog/doc"
import { tempDir } from "./helpers"

// 最小合法 CHANGELOG：H1 标题 + 一个版本块
const minimal = "# pkg\n\n## 1.0.0\n\n### ✨ 新增功能\n\n- 新增：甲\n"

// 双主版本夹具：2.x 最新，1.x 两个版本块
const dual = [
  "# pkg",
  "",
  "## 2.0.0",
  "",
  "> 2026-12-01 发布",
  "",
  "### ✨ 新增功能",
  "",
  "- 新增：乙",
  "",
  "## 1.1.0",
  "",
  "### ✨ 新增功能",
  "",
  "- 新增：甲一",
  "",
  "## 1.0.0",
  "",
  "### ✨ 新增功能",
  "",
  "- 新增：甲零",
  "",
].join("\n")

// 非 semver 块：Unreleased 无数字首段，预发布 2.0.0-rc.1 归属主版本 2
const unstable = [
  "# pkg",
  "",
  "## Unreleased",
  "",
  "- 待发布：草稿",
  "",
  "## 2.0.0-rc.1",
  "",
  "> 预发布",
  "",
  "## 1.0.0",
  "",
  "- 旧版：条目",
  "",
].join("\n")

// 构造一组完整镜像参数，路径落在临时目录
function options(dir: string): DocOptions {
  return {
    source: join(dir, "CHANGELOG.md"),
    target: join(dir, "docs", "changelog.md"),
    title: "更新日志",
    outline: "[2, 2]",
    frontmatter: true,
    note: "> 本页由脚本生成，请勿手改。",
    split: "major",
  }
}

// 写入源文件并建好目标目录
function prepare(dir: string, text: string): DocOptions {
  const opts = options(dir)
  mkdirSync(join(dir, "docs"), { recursive: true })
  writeFileSync(opts.source, text, "utf8")
  return opts
}

// 本文件临时目录登记：用例结束统一删除，避免每跑一次在 %TEMP% 留下 fxts-tk-doc-*
const docDirs: string[] = []
function makeDocDir(): string {
  const dir = tempDir("fxts-tk-doc-")
  docDirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of docDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("buildDocPage：更新日志镜像转换", () => {
  it("CRLF 输入产出 LF 页：源标题被剥离、版本块保留", () => {
    const page = buildDocPage(minimal.replace(/\n/g, "\r\n"))
    expect(page).not.toContain("\r")
    expect(page).toContain("# 更新日志")
    expect(page).not.toContain("# pkg")
    expect(page).toContain("## 1.0.0")
  })

  it("BOM 前缀不影响首行 H1 判定", () => {
    expect(buildDocPage(`\uFEFF${minimal}`)).toContain("## 1.0.0")
  })

  it("首行非 H1 时抛错：避免把源标题带进镜像页", () => {
    expect(() => buildDocPage("## 1.0.0\n\n- 条目\n")).toThrow(/首行不是 H1/)
  })

  it("无版本块时抛错：结构异常时不静默产出错页", () => {
    expect(() => buildDocPage("# pkg\n\n> 无版本块\n")).toThrow(/未发现/)
  })

  it("幂等：同一输入两次转换结果一致", () => {
    expect(buildDocPage(minimal)).toBe(buildDocPage(minimal))
  })

  it("支持自定义标题与 outline", () => {
    const page = buildDocPage(minimal, { title: "更新记录", outline: "[2, 3]" })
    expect(page).toContain("outline: [2, 3]")
    expect(page).toContain("# 更新记录")
  })

  it("关闭 frontmatter 时不输出分隔线", () => {
    const page = buildDocPage(minimal, { frontmatter: false })
    expect(page.startsWith("# 更新日志")).toBe(true)
    expect(page).not.toContain("---")
  })
})

describe("buildDocPages：按主版本分页", () => {
  it("单一主版本零差异：主页与整篇镜像逐字一致，不生成归档页与历史入口", () => {
    const opts = options(".")
    const pages = buildDocPages(minimal, opts)
    expect(pages.home).toBe(buildDocPage(minimal, opts))
    expect(pages.archives).toEqual([])
    expect(pages.home).not.toContain("历史版本")
  })

  it("双主版本：主页只含最新主版本，归档页含旧主版本全部块", () => {
    const pages = buildDocPages(dual, options("."))
    expect(pages.home).toContain("## 2.0.0")
    expect(pages.home).not.toContain("## 1.1.0")
    expect(pages.home).not.toContain("## 1.0.0")
    expect(pages.home).toContain("历史版本：[1.x](./changelog/1.x)")
    expect(pages.archives.map((page) => page.major)).toEqual(["1"])
    const archive = pages.archives[0]?.content ?? ""
    expect(archive).toContain("# 更新日志 · 1.x")
    expect(archive).toContain(ARCHIVE_MARKER)
    expect(archive).toContain("返回[更新日志](../changelog)")
    // 块顺序保持源文件顺序
    expect(archive.indexOf("## 1.1.0")).toBeLessThan(archive.indexOf("## 1.0.0"))
  })

  it("非 semver 块随所属主版本处理：Unreleased 留主页，预发布按数字首段归组", () => {
    const pages = buildDocPages(unstable, options("."))
    expect(pages.home).toContain("## Unreleased")
    expect(pages.home).toContain("## 2.0.0-rc.1")
    expect(pages.home).not.toContain("## 1.0.0")
    expect(pages.archives.map((page) => page.major)).toEqual(["1"])
    expect(pages.archives[0]?.content).toContain("## 1.0.0")
    expect(pages.archives[0]?.content).not.toContain("Unreleased")
  })

  it("无法识别数字首段的标题留在主页，不进入归档页", () => {
    const mixed = `${dual}## 杂项\n\n- 说明：未编号块\n`
    const pages = buildDocPages(mixed, options("."))
    expect(pages.home).toContain("## 杂项")
    expect(pages.archives[0]?.content).not.toContain("## 杂项")
  })

  it("split: none 退回整篇镜像，不生成归档页", () => {
    const opts = { ...options("."), split: "none" as const }
    const pages = buildDocPages(dual, opts)
    expect(pages.home).toBe(buildDocPage(dual, opts))
    expect(pages.archives).toEqual([])
  })

  it("语言目标归档到独立目录：中英互不覆盖", () => {
    const dir = makeDocDir()
    const zh = prepare(dir, dual)
    const en = { ...options(dir), source: join(dir, "CHANGELOG.en.md"), target: join(dir, "docs", "changelog.en.md") }
    writeFileSync(en.source, dual, "utf8")
    syncDoc(zh)
    syncDoc(en)
    expect(existsSync(join(dir, "docs", "changelog", "1.x.md"))).toBe(true)
    expect(existsSync(join(dir, "docs", "changelog.en", "1.x.md"))).toBe(true)
    // 两个目标各自校验通过：对方的归档页不会被当成多余页
    expect(checkDoc(zh).ok).toBe(true)
    expect(checkDoc(en).ok).toBe(true)
  })
})

describe("syncDoc / checkDoc：落盘与一致性校验", () => {
  it("生成镜像后可校验一致，手改后校验失败并给出行号", () => {
    const dir = makeDocDir()
    const opts = prepare(dir, minimal)

    const written = syncDoc(opts)
    expect(written.changed).toBe(true)
    expect(written.written).toEqual([opts.target])
    expect(readFileSync(opts.target, "utf8")).toContain("## 1.0.0")
    expect(checkDoc(opts).ok).toBe(true)

    writeFileSync(opts.target, `${readFileSync(opts.target, "utf8")}手改一行\n`, "utf8")
    const result = checkDoc(opts)
    expect(result.ok).toBe(false)
    expect(result.page).toBe(opts.target)
    expect(result.line).toBeGreaterThan(0)
    expect(result.problems[0]?.kind).toBe("diff")
  })

  it("再次同步不产生改动", () => {
    const dir = makeDocDir()
    const opts = prepare(dir, minimal)
    syncDoc(opts)
    const again = syncDoc(opts)
    expect(again.changed).toBe(false)
    expect(again.written).toEqual([])
  })

  it("--check 能报缺页，同步后恢复一致", () => {
    const dir = makeDocDir()
    const opts = prepare(dir, dual)
    syncDoc(opts)
    const archive = join(dir, "docs", "changelog", "1.x.md")
    rmSync(archive)

    const result = checkDoc(opts)
    expect(result.ok).toBe(false)
    expect(result.page).toBe(archive)
    expect(result.problems[0]?.kind).toBe("missing")

    syncDoc(opts)
    expect(checkDoc(opts).ok).toBe(true)
  })

  it("内容差异定位到具体归档页", () => {
    const dir = makeDocDir()
    const opts = prepare(dir, dual)
    syncDoc(opts)
    const archive = join(dir, "docs", "changelog", "1.x.md")
    writeFileSync(archive, `${readFileSync(archive, "utf8")}手改一行\n`, "utf8")

    const result = checkDoc(opts)
    expect(result.ok).toBe(false)
    expect(result.page).toBe(archive)
    expect(result.problems[0]?.kind).toBe("diff")
  })

  it("同步只删除带生成标记的归档页，无标记多余页保留并报 error", () => {
    const dir = makeDocDir()
    const opts = prepare(dir, dual)
    syncDoc(opts)
    const archiveDir = join(dir, "docs", "changelog")
    const handwritten = join(archiveDir, "9.x.md")
    const stale = join(archiveDir, "0.x.md")
    writeFileSync(handwritten, "# 手写页\n", "utf8")
    writeFileSync(stale, `# 旧归档\n\n${ARCHIVE_MARKER}\n`, "utf8")

    const result = checkDoc(opts)
    expect(result.ok).toBe(false)
    expect(result.problems.some((problem) => problem.kind === "extra" && problem.file === handwritten)).toBe(true)
    expect(result.problems.some((problem) => problem.kind === "extra" && problem.file === stale)).toBe(true)

    const synced = syncDoc(opts)
    expect(synced.removed).toEqual([stale])
    expect(synced.kept).toEqual([handwritten])
    expect(existsSync(handwritten)).toBe(true)
    expect(existsSync(stale)).toBe(false)
  })

  it("--dry-run 只报告将写入的清单，不写盘", () => {
    const dir = makeDocDir()
    const opts = prepare(dir, dual)
    syncDoc(opts)
    const before = readFileSync(opts.target, "utf8")
    writeFileSync(opts.source, `${dual}\n## 2.1.0\n\n- 新增：丙\n`, "utf8")

    const planned = syncDoc(opts, { dryRun: true })
    expect(planned.changed).toBe(true)
    expect(planned.written).toEqual([opts.target])
    expect(readFileSync(opts.target, "utf8")).toBe(before)
    expect(readFileSync(join(dir, "docs", "changelog", "1.x.md"), "utf8")).not.toContain("## 2.1.0")
  })
})

describe("resolveDocOptions：split 配置", () => {
  const cwd = process.cwd()
  let home = ""
  let project = ""

  afterEach(() => {
    process.chdir(cwd)
    resetToolkitConfigCache()
    setHomeDirForTest(undefined)
    home = ""
    project = ""
  })

  // 写项目层配置并清缓存，使下一次读取生效；目录登记到 docDirs，同一用例多次调用也不留孤儿
  function writeConfig(split: unknown): void {
    const homeDir = mkdtempSync(join(tmpdir(), "fxts-tk-doc-split-home-"))
    const projectDir = mkdtempSync(join(tmpdir(), "fxts-tk-doc-split-"))
    docDirs.push(homeDir, projectDir)
    home = homeDir
    project = projectDir
    setHomeDirForTest(home)
    process.chdir(project)
    writeFileSync(join(project, ".toolkitrc.json"), JSON.stringify({ changelogDoc: { split } }), "utf8")
    resetToolkitConfigCache()
  }

  it("未配置时默认 major，显式 none 生效", () => {
    writeConfig(undefined)
    expect(resolveDocOptions().split).toBe("major")
    writeConfig("none")
    expect(resolveDocOptions().split).toBe("none")
  })

  it("非法值告警并回落 major", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    writeConfig("minor")
    expect(resolveDocOptions().split).toBe("major")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("changelogDoc.split"))
    warn.mockRestore()
  })

  it("空 CLI 取值与非字符串配置告警并回落默认", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    writeConfig(undefined)
    writeFileSync(join(project, ".toolkitrc.json"), JSON.stringify({ changelogDoc: { source: 123, title: "" } }), "utf8")
    resetToolkitConfigCache()
    const opts = resolveDocOptions({ from: "   " })
    expect(opts.source).toBe("CHANGELOG.md")
    expect(opts.title).not.toBe("")
    const text = warn.mock.calls.map((call) => String(call[0])).join("\n")
    expect(text).toContain("忽略空取值的「changelogDoc.source」")
    expect(text).toContain("须为非空字符串")
    warn.mockRestore()
  })

  it("布尔配置类型不符告警并回落默认", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    writeConfig(undefined)
    writeFileSync(join(project, ".toolkitrc.json"), JSON.stringify({ changelogDoc: { frontmatter: "yes" } }), "utf8")
    resetToolkitConfigCache()
    expect(resolveDocOptions().frontmatter).toBe(true)
    expect(warn.mock.calls.map((call) => String(call[0])).join("\n")).toContain("须为布尔值")
    warn.mockRestore()
  })

  it("镜像目标目录缺失时告警并跳过", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    writeConfig(undefined)
    writeFileSync(join(project, "CHANGELOG.md"), minimal, "utf8")
    writeFileSync(join(project, ".toolkitrc.json"), JSON.stringify({ changelogDoc: { target: "missing/changelog.md" } }), "utf8")
    resetToolkitConfigCache()
    syncDocAfterVersion()
    expect(warn.mock.calls.map((call) => String(call[0])).join("\n")).toContain("未找到镜像目标目录")
    warn.mockRestore()
  })
})
