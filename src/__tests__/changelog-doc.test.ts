// 文档站镜像回归：转换、校验与幂等三类行为须被覆盖，防止站点更新页静默产出错页
import { describe, it, expect } from "vitest"
import { writeFileSync, readFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { buildDocPage, checkDoc, syncDoc, type DocOptions } from "../changelog/doc"
import { tempDir } from "./helpers"

// 最小合法 CHANGELOG：H1 标题 + 一个版本块
const minimal = "# pkg\n\n## 1.0.0\n\n### ✨ 新增功能\n\n- 新增：甲\n"

// 构造一组完整镜像参数，路径落在临时目录
function options(dir: string): DocOptions {
  return {
    source: join(dir, "CHANGELOG.md"),
    target: join(dir, "docs", "changelog.md"),
    title: "更新日志",
    outline: "[2, 2]",
    frontmatter: true,
    note: "> 本页由脚本生成，请勿手改。",
  }
}

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

describe("syncDoc / checkDoc：落盘与一致性校验", () => {
  it("生成镜像后可校验一致，手改后校验失败并给出行号", () => {
    const dir = tempDir("tk-doc-")
    const opts = options(dir)
    mkdirSync(join(dir, "docs"), { recursive: true })
    writeFileSync(opts.source, minimal, "utf8")

    const written = syncDoc(opts)
    expect(written.changed).toBe(true)
    expect(readFileSync(opts.target, "utf8")).toContain("## 1.0.0")
    expect(checkDoc(opts).ok).toBe(true)

    writeFileSync(opts.target, `${readFileSync(opts.target, "utf8")}手改一行\n`, "utf8")
    const result = checkDoc(opts)
    expect(result.ok).toBe(false)
    expect(result.line).toBeGreaterThan(0)
  })

  it("再次同步不产生改动", () => {
    const dir = tempDir("tk-doc-")
    const opts = options(dir)
    mkdirSync(join(dir, "docs"), { recursive: true })
    writeFileSync(opts.source, minimal, "utf8")
    syncDoc(opts)
    expect(syncDoc(opts).changed).toBe(false)
  })
})
