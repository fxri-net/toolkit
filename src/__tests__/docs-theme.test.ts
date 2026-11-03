// 文档站统一主题：校验 / 写入的行为边界与品牌段保护
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { checkDocsTheme, writeDocsTheme } from "../docs/theme"

// 临时主题目录：每个用例独立，避免互相污染
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fxri-docs-theme-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("writeDocsTheme / checkDocsTheme", () => {
  it("空目录写入后校验通过，生成 index.ts 与 custom.css", () => {
    const result = writeDocsTheme(dir)
    expect(result.written).toHaveLength(2)
    expect(checkDocsTheme(dir)).toEqual({ ok: true, problems: [] })
  })

  it("品牌段改动不影响校验，公共段改动会被行号定位", () => {
    writeDocsTheme(dir)
    const cssPath = join(dir, "custom.css")
    const original = readFileSync(cssPath, "utf8")

    // 品牌段：允许各站自留
    writeFileSync(cssPath, original.replace("--fx-accent: #4f5bd5;", "--fx-accent: #409eff;"))
    expect(checkDocsTheme(dir).ok).toBe(true)

    // 公共段：改动即漂移，须报出首个差异行
    writeFileSync(cssPath, original.replace(".VPHero .text {\n  max-width: 720px;", ".VPHero .text {\n  max-width: 640px;"))
    const changed = checkDocsTheme(dir)
    expect(changed.ok).toBe(false)
    expect(changed.problems[0]).toContain("公共规则与模板不一致（第")
  })

  it("缺少文件或缺少标记行时给出可执行的修复提示", () => {
    const empty = checkDocsTheme(dir)
    expect(empty.ok).toBe(false)
    expect(empty.problems.join("\n")).toContain("toolkit docs theme --write")

    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "index.ts"), "")
    writeFileSync(join(dir, "custom.css"), ":root { --vp-c-brand-1: #000; }\n")
    const noMarker = checkDocsTheme(dir)
    expect(noMarker.ok).toBe(false)
    expect(noMarker.problems.join("\n")).toContain("缺少主题标记行")
  })

  it("刷新时保留既有品牌段，只替换公共段", () => {
    writeDocsTheme(dir)
    const cssPath = join(dir, "custom.css")
    writeFileSync(cssPath, readFileSync(cssPath, "utf8").replace("--fx-accent: #4f5bd5;", "--fx-accent: #409eff;"))
    writeFileSync(cssPath, readFileSync(cssPath, "utf8").replace("max-width: 720px;", "max-width: 640px;"))

    const result = writeDocsTheme(dir)
    expect(result.kept).toContain(cssPath)
    const refreshed = readFileSync(cssPath, "utf8")
    expect(refreshed).toContain("--fx-accent: #409eff;")
    expect(refreshed).toContain("max-width: 720px;")
    expect(checkDocsTheme(dir).ok).toBe(true)
  })

  it("版本标记落后时校验失败，--write 升级后保留品牌段", () => {
    writeDocsTheme(dir)
    const cssPath = join(dir, "custom.css")
    const legacy = readFileSync(cssPath, "utf8")
      .replace("/* fxri-docs-theme: 2.0 */", "/* fxri-docs-theme: 1.0 */")
      .replace("--fx-accent: #4f5bd5;", "--fx-accent: #409eff;")
    writeFileSync(cssPath, legacy)

    const before = checkDocsTheme(dir)
    expect(before.ok).toBe(false)
    expect(before.problems.join("\n")).toContain("版本标记落后")

    writeDocsTheme(dir)
    expect(readFileSync(cssPath, "utf8")).toContain("--fx-accent: #409eff;")
    expect(checkDocsTheme(dir).ok).toBe(true)
  })

  it("1.x 品牌令牌在 --check 报废弃，--write 改名并保留取值", () => {
    writeDocsTheme(dir)
    const cssPath = join(dir, "custom.css")
    const legacy = readFileSync(cssPath, "utf8")
      .replace("--fx-accent: #4f5bd5;", "--site-accent: #409eff;")
      .replace("--fx-accent-strong: #8a92ea;", "--site-glow: rgba(64, 158, 255, 0.18);")
      .replace("--fx-shadow: rgba(29, 33, 41, 0.08);", "--site-shadow: rgba(26, 111, 196, 0.16);")
      .replace("--fx-hero-angle: 180deg;", "--site-hero-angle: 120deg;")
    writeFileSync(cssPath, legacy)

    const before = checkDocsTheme(dir)
    expect(before.ok).toBe(false)
    expect(before.problems.join("\n")).toContain("1.x 令牌")

    writeDocsTheme(dir)
    const migrated = readFileSync(cssPath, "utf8")
    expect(migrated).toContain("--fx-accent: #409eff;")
    expect(migrated).toContain("--fx-accent-soft: rgba(64, 158, 255, 0.18);")
    expect(migrated).toContain("--fx-shadow: rgba(26, 111, 196, 0.16);")
    expect(migrated).toContain("--fx-hero-angle: 120deg;")
    expect(migrated).not.toContain("--site-")
    expect(checkDocsTheme(dir).ok).toBe(true)
  })

  it("无品牌标记的既有文件须显式 --force 才覆盖", () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "custom.css"), "/* 手写样式 */\n")
    expect(() => writeDocsTheme(dir)).toThrow("--force")
    expect(() => writeDocsTheme(dir, { force: true })).not.toThrow()
    expect(checkDocsTheme(dir).ok).toBe(true)
  })
})
