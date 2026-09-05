// changelog 域单测：标题多语言替换、commit hash 前缀清理、重复条目/依赖合并、发布日期补齐、脱敏
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatChangelog, formatChangelogs, localDate } from "../changelog/format"
import { collectChangelogs } from "../changelog/collect"
import { languages, DEFAULT_LANG } from "../changelog/languages"

const zh = languages[DEFAULT_LANG]

describe("formatChangelog", () => {
  it("标题中文化、去 hash 前缀、去重、合并依赖并补发布日期（G1）", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-cl-"))
    const file = join(dir, "CHANGELOG.md")
    const content = [
      "# pkg",
      "",
      "## 1.0.0",
      "",
      "### Patch Changes",
      "",
      "- 800a1cf: 修复一件事",
      "- 800a1cf: 修复一件事",
      "- Updated dependencies",
      "- Updated dependencies",
      "",
    ].join("\n")
    writeFileSync(file, content, "utf8")
    const changed = formatChangelog(file, "2026-09-03", zh)
    expect(changed).toBe(true)
    const out = readFileSync(file, "utf8")
    expect(out).toContain("### 🐛 补丁修复")
    expect(out.match(/- 修复一件事/g)).toHaveLength(1)
    expect(out.match(/- 更新依赖/g)).toHaveLength(1)
    expect(out).toContain("> 2026-09-03 发布")
    expect(out).not.toContain("800a1cf:")
    rmSync(dir, { recursive: true, force: true })
  })

  it("清理 changesets 双前缀伪影：首行 - - 与缩进续行还原为顶层条目", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-cl-"))
    const file = join(dir, "CHANGELOG.md")
    // 模拟 changesets 对以「- 」开头的变更集条目二次加前缀的实际产物
    writeFileSync(
      file,
      "# pkg\n\n## 1.0.0\n\n### Patch Changes\n\n- - 文档：统一品牌中文名\n  - 第二条描述\n\n## 0.9.0\n",
      "utf8",
    )
    expect(formatChangelog(file, "2026-09-05", zh)).toBe(true)
    const out = readFileSync(file, "utf8")
    expect(out).toContain("- 文档：统一品牌中文名\n- 第二条描述")
    expect(out).not.toContain("- - ")
    expect(out).not.toContain("\n  - ")
    rmSync(dir, { recursive: true, force: true })
  })

  it("正常嵌套列表（首行非 - - 形态）不受伪影清理影响", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-cl-"))
    const file = join(dir, "CHANGELOG.md")
    writeFileSync(file, "# pkg\n\n## 1.0.0\n\n- 总述：包含子项\n  - 子项甲\n  - 子项乙\n", "utf8")
    formatChangelog(file, "2026-09-05", zh)
    const out = readFileSync(file, "utf8")
    expect(out).toContain("- 总述：包含子项\n  - 子项甲\n  - 子项乙")
    rmSync(dir, { recursive: true, force: true })
  })

  it("日期行已存在时不重复插入", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-cl-"))
    const file = join(dir, "CHANGELOG.md")
    // 日期行紧贴版本标题（无空行）时自愈补齐，且不重复插入新日期
    writeFileSync(file, "# pkg\n\n## 1.0.0\n> 2026-09-02 发布\n\n### Patch Changes\n\n- a\n", "utf8")
    formatChangelog(file, "2026-09-03", zh)
    const out = readFileSync(file, "utf8")
    expect(out).toContain("## 1.0.0\n\n> 2026-09-02 发布")
    expect(out).not.toContain("> 2026-09-03 发布")
    rmSync(dir, { recursive: true, force: true })
  })

  it("脱敏开关：默认掩码、false 原样", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-cl-"))
    const on = join(dir, "on.md")
    writeFileSync(on, "# pkg\n\n## 1.0.0\n\n- 联系 tqy@fxri.net\n", "utf8")
    formatChangelog(on, "2026-09-03", zh)
    expect(readFileSync(on, "utf8")).toContain("t***@***.net")

    const off = join(dir, "off.md")
    writeFileSync(off, "# pkg\n\n## 1.0.0\n\n- 联系 tqy@fxri.net\n", "utf8")
    formatChangelog(off, "2026-09-03", zh, false)
    expect(readFileSync(off, "utf8")).toContain("tqy@fxri.net")
    rmSync(dir, { recursive: true, force: true })
  })

  it("localDate 格式", () => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test(localDate())).toBe(true)
  })
})

describe("collectChangelogs", () => {
  it("排除 node_modules/.git/dist/coverage（G1）", () => {
    const dir = mkdtempSync(join(tmpdir(), "tk-col-"))
    writeFileSync(join(dir, "CHANGELOG.md"), "", "utf8")
    mkdirSync(join(dir, "pkg"), { recursive: true })
    writeFileSync(join(dir, "pkg", "CHANGELOG.md"), "", "utf8")
    for (const ex of ["node_modules", ".git", "dist", "coverage"]) {
      mkdirSync(join(dir, ex, "x"), { recursive: true })
      writeFileSync(join(dir, ex, "x", "CHANGELOG.md"), "", "utf8")
    }
    const found = collectChangelogs(dir).map((p) => p.replaceAll("\\", "/").replace(dir.replaceAll("\\", "/"), ""))
    expect(found.sort()).toEqual(["/CHANGELOG.md", "/pkg/CHANGELOG.md"])
    expect(formatChangelogs(dir, "2026-09-03", zh)).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })
})
