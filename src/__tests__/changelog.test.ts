// changelog 域单测：语义分组归类、标题多语言替换、commit hash 前缀清理、重复条目/依赖合并、发布日期补齐、脱敏
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatChangelog, formatChangelogs, localDate, countUntypedEntries } from "../changelog/format"
import { collectChangelogs } from "../changelog/collect"
import { languages, DEFAULT_LANG, type ChangelogLanguage } from "../changelog/languages"

const zh = languages[DEFAULT_LANG]
const en = languages.en

// 造临时 CHANGELOG 样本并在用例结束后清理（新增用例统一走此入口）
function withChangelog(content: string, run: (file: string, dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "tk-cl-"))
  const file = join(dir, "CHANGELOG.md")
  writeFileSync(file, content, "utf8")
  try {
    run(file, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// 未声明 groups 的自定义语言：验证退化路径（仅标题替换 + 日期补齐）
const plainJa: ChangelogLanguage = {
  replacements: {},
  deps: "- 依存関係を更新",
  released: "リリース",
}

describe("formatChangelog", () => {
  it("标题语义分组、去 hash 前缀、去重、合并依赖并补发布日期（G1）", () => {
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
    // 无类型前缀的 patch 条目落中性兜底组，依赖条目单列一组
    expect(out).toContain("### 📦 其他变更")
    expect(out).toContain("### 🔗 依赖变更")
    expect(out.match(/- 修复一件事/g)).toHaveLength(1)
    expect(out.match(/- 更新依赖/g)).toHaveLength(1)
    expect(out).toContain("> 2026-09-03 发布")
    expect(out).not.toContain("800a1cf:")
    rmSync(dir, { recursive: true, force: true })
  })

  it("按类型前缀归入语义分组、组序固定、空组省略", () => {
    withChangelog(
      "# pkg\n\n## 1.1.0\n\n### Minor Changes\n\n- 优化：减少渲染节点\n- 新增：支持导出\n- 修复：修正精度\n",
      (file) => {
        formatChangelog(file, "2026-09-03", zh)
        const out = readFileSync(file, "utf8")
        const added = out.indexOf("### ✨ 新增功能")
        const improved = out.indexOf("### ⚡ 优化改进")
        const fixed = out.indexOf("### 🐛 问题修复")
        expect(added).toBeGreaterThan(-1)
        expect(improved).toBeGreaterThan(-1)
        expect(fixed).toBeGreaterThan(-1)
        // 组序即槽位定义顺序：新增 → 优化 → 修复
        expect(added).toBeLessThan(improved)
        expect(improved).toBeLessThan(fixed)
        // 空组不输出
        expect(out).not.toContain("### 🚨 重大变更")
        expect(out).not.toContain("### 📦 其他变更")
      },
    )
  })

  it("无前缀条目按所属源组标题兜底：Minor→新增功能、Patch→其他变更", () => {
    withChangelog(
      "# pkg\n\n## 1.2.0\n\n### Minor Changes\n\n- 无前缀 minor 条目\n\n### Patch Changes\n\n- 无前缀 patch 条目\n",
      (file) => {
        formatChangelog(file, "2026-09-03", zh)
        const out = readFileSync(file, "utf8")
        const added = out.indexOf("### ✨ 新增功能")
        const other = out.indexOf("### 📦 其他变更")
        expect(added).toBeGreaterThan(-1)
        expect(other).toBeGreaterThan(-1)
        // 各自按源组标题兜底，不互相串位
        expect(out.slice(added, other)).toContain("- 无前缀 minor 条目")
        expect(out.slice(other)).toContain("- 无前缀 patch 条目")
      },
    )
  })

  it("同槽位跨源组合并为单组，组内保持原出现顺序", () => {
    withChangelog(
      "# pkg\n\n## 1.1.0\n\n### Minor Changes\n\n- 修复：来自 Minor\n\n### Patch Changes\n\n- 修复：来自 Patch\n",
      (file) => {
        formatChangelog(file, "2026-09-03", zh)
        const out = readFileSync(file, "utf8")
        expect(out.match(/### 🐛 问题修复/g)).toHaveLength(1)
        expect(out.indexOf("- 修复：来自 Minor")).toBeLessThan(out.indexOf("- 修复：来自 Patch"))
      },
    )
  })

  it("缩进续行随父条目整体迁移", () => {
    withChangelog("# pkg\n\n## 1.1.0\n\n### Patch Changes\n\n- 修复：甲\n  - 子项甲\n- 修复：乙\n", (file) => {
      formatChangelog(file, "2026-09-03", zh)
      const out = readFileSync(file, "utf8")
      expect(out).toContain("- 修复：甲\n  - 子项甲")
      expect(out).toContain("- 修复：乙")
      // 续行不脱离父条目另起一组
      expect(out.match(/### 🐛 问题修复/g)).toHaveLength(1)
    })
  })

  it("依赖条目（含缩进子项）整块归入依赖变更组", () => {
    withChangelog(
      "# pkg\n\n## 1.1.0\n\n### Patch Changes\n\n- 修复：甲\n- Updated dependencies\n  - pkg-a@1.0.1\n",
      (file) => {
        formatChangelog(file, "2026-09-03", zh)
        const out = readFileSync(file, "utf8")
        const deps = out.indexOf("### 🔗 依赖变更")
        expect(deps).toBeGreaterThan(-1)
        expect(out.slice(deps)).toContain("- 更新依赖\n  - pkg-a@1.0.1")
      },
    )
  })

  it("新旧块混存：新块归类重排、历史块逐字不动", () => {
    withChangelog(
      [
        "# pkg",
        "",
        "## 1.1.0",
        "",
        "### Patch Changes",
        "",
        "- 修复：新问题",
        "",
        "## 1.0.0",
        "",
        "> 2026-09-01 发布",
        "",
        "### 🐛 补丁修复",
        "",
        "- 无前缀的历史条目",
        "",
      ].join("\n"),
      (file) => {
        formatChangelog(file, "2026-09-03", zh)
        const out = readFileSync(file, "utf8")
        expect(out).toContain("### 🐛 问题修复")
        expect(out).toContain("- 修复：新问题")
        // 历史块标题与条目保持原样
        expect(out).toContain("### 🐛 补丁修复")
        expect(out).toContain("- 无前缀的历史条目")
      },
    )
  })

  it("历史版本块不追溯改写（幂等）", () => {
    const content = "# pkg\n\n## 1.0.0\n\n> 2026-09-01 发布\n\n### 🐛 补丁修复\n\n- 无前缀的历史条目\n"
    withChangelog(content, (file) => {
      expect(formatChangelog(file, "2026-09-03", zh)).toBe(false)
      expect(readFileSync(file, "utf8")).toBe(content)
    })
  })

  it("history=true 追溯历史块：组标题更新为当前口径，条目内容不动", () => {
    withChangelog(
      "# pkg\n\n## 1.0.0\n\n> 2026-09-01 发布\n\n### 🐛 补丁修复\n\n- 无前缀的历史条目\n",
      (file) => {
        expect(formatChangelog(file, "2026-09-03", zh, true, true)).toBe(true)
        const out = readFileSync(file, "utf8")
        expect(out).toContain("### 🐛 问题修复")
        expect(out).not.toContain("### 🐛 补丁修复")
        expect(out).toContain("- 无前缀的历史条目")
      },
    )
  })

  it("history=true：带前缀条目按前缀移组，无前缀条目按原组标题兜底", () => {
    withChangelog(
      [
        "# pkg",
        "",
        "## 1.0.0",
        "",
        "> 2026-09-01 发布",
        "",
        "### 📝 文档更新",
        "",
        "- 技能：某技能升级",
        "- 无前缀文档条目",
        "",
      ].join("\n"),
      (file) => {
        formatChangelog(file, "2026-09-03", zh, true, true)
        const out = readFileSync(file, "utf8")
        const improved = out.indexOf("### ⚡ 优化改进")
        const docs = out.indexOf("### 📝 文档更新")
        expect(improved).toBeGreaterThan(-1)
        // 组序即槽位定义顺序：优化改进 → 文档更新
        expect(improved).toBeLessThan(docs)
        expect(out.slice(improved, docs)).toContain("- 技能：某技能升级")
        expect(out.slice(docs)).toContain("- 无前缀文档条目")
      },
    )
  })

  it("history=true：依赖：前缀条目移入依赖变更组", () => {
    withChangelog(
      "# pkg\n\n## 1.0.0\n\n> 2026-09-01 发布\n\n### ✨ 新增功能\n\n- 依赖：commander 14 → 15\n- 新增：真新增\n",
      (file) => {
        formatChangelog(file, "2026-09-03", zh, true, true)
        const out = readFileSync(file, "utf8")
        const added = out.indexOf("### ✨ 新增功能")
        const deps = out.indexOf("### 🔗 依赖变更")
        expect(deps).toBeGreaterThan(-1)
        expect(added).toBeLessThan(deps)
        expect(out.slice(added, deps)).toContain("- 新增：真新增")
        expect(out.slice(deps)).toContain("- 依赖：commander 14 → 15")
      },
    )
  })

  it("history=true：未识别的历史分组原样附后，不臆造归属", () => {
    withChangelog(
      [
        "# pkg",
        "",
        "## 1.0.0",
        "",
        "> 2026-09-01 发布",
        "",
        "### 🌟 自定分组",
        "",
        "- 条目甲",
        "",
        "### 🐛 补丁修复",
        "",
        "- 修复：条目乙",
        "",
      ].join("\n"),
      (file) => {
        formatChangelog(file, "2026-09-03", zh, true, true)
        const out = readFileSync(file, "utf8")
        expect(out).toContain("- 条目甲")
        // 已识别分组排前，未识别分组连同标题原样附后
        expect(out.indexOf("### 🐛 问题修复")).toBeLessThan(out.indexOf("### 🌟 自定分组"))
      },
    )
  })

  it("history=true 二次运行零 churn（幂等）", () => {
    withChangelog(
      "# pkg\n\n## 1.0.0\n\n> 2026-09-01 发布\n\n### 🐛 补丁修复\n\n- 新增：甲\n- 无前缀乙\n",
      (file) => {
        expect(formatChangelog(file, "2026-09-03", zh, true, true)).toBe(true)
        const once = readFileSync(file, "utf8")
        expect(formatChangelog(file, "2026-09-04", zh, true, true)).toBe(false)
        expect(readFileSync(file, "utf8")).toBe(once)
      },
    )
  })

  it("自举一致性：本仓库 CHANGELOG.md 在追溯模式下零改动", () => {
    withChangelog(readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8"), (file) => {
      expect(formatChangelog(file, "2026-09-03", zh, true, true)).toBe(false)
    })
  })

  it("en 输出：中文前缀条目归入对应英文语义组、无前缀落 Other", () => {
    withChangelog(
      "# pkg\n\n## 1.1.0\n\n### Patch Changes\n\n- 新增：中文前缀条目\n- 无前缀条目\n",
      (file) => {
        formatChangelog(file, "2026-09-03", en)
        const out = readFileSync(file, "utf8")
        expect(out).toContain("### ✨ Added")
        expect(out).toContain("- 新增：中文前缀条目")
        expect(out).toContain("### 📦 Other")
        expect(out).toContain("- 无前缀条目")
      },
    )
  })

  it("异语言前缀互认：英文前缀条目在 zh 输出下仍正确归组", () => {
    withChangelog("# pkg\n\n## 1.1.0\n\n### Patch Changes\n\n- Fixed: english prefix entry\n", (file) => {
      formatChangelog(file, "2026-09-03", zh)
      const out = readFileSync(file, "utf8")
      expect(out).toContain("### 🐛 问题修复")
      expect(out).toContain("- Fixed: english prefix entry")
    })
  })

  it("自定义语言可选 prefixes 追加识别本语言自有前缀", () => {
    const makeJa = (prefixes?: string[]): ChangelogLanguage => ({
      groups: [
        { slot: "added", title: "### ✨ 新規", prefixes },
        { slot: "other", title: "### 📦 その他" },
      ],
      replacements: {},
      deps: "- 依存関係を更新",
      released: "リリース",
    })
    const content = "# pkg\n\n## 1.1.0\n\n### Patch Changes\n\n- 新規：甲機能\n"
    // 未声明 prefixes：只认全局前缀表，「新規：」不被识别 → Patch 块无前缀兜底落 other
    withChangelog(content, (file) => {
      formatChangelog(file, "2026-09-03", makeJa())
      expect(readFileSync(file, "utf8")).toContain("### 📦 その他")
    })
    // 声明 prefixes：本语言自有前缀参与识别 → 归入 added
    withChangelog(content, (file) => {
      formatChangelog(file, "2026-09-03", makeJa(["新規："]))
      const out = readFileSync(file, "utf8")
      expect(out).toContain("### ✨ 新規")
      expect(out).not.toContain("### 📦 その他")
    })
  })

  it("自定义语言未声明 groups 时退化为纯替换（既有行为）", () => {
    const legacy: ChangelogLanguage = {
      replacements: { "### Patch Changes": "### 🐛 补丁修复" },
      deps: "- 更新依赖",
      released: "发布",
    }
    withChangelog("# pkg\n\n## 1.0.0\n\n### Patch Changes\n\n- 无前缀条目\n", (file) => {
      formatChangelog(file, "2026-09-03", legacy)
      const out = readFileSync(file, "utf8")
      expect(out).toContain("### 🐛 补丁修复")
      expect(out).toContain("- 无前缀条目")
    })
  })

  it("自定义语言日期行幂等：released 非「发布/released」时也不重复追加", () => {
    withChangelog("# pkg\n\n## 1.0.0\n\n### 🐛 补丁修复\n\n- 条目\n", (file) => {
      expect(formatChangelog(file, "2026-09-03", plainJa)).toBe(true)
      const once = readFileSync(file, "utf8")
      expect(once.match(/リリース/g)).toHaveLength(1)
      expect(once).toContain("## 1.0.0\n\n> 2026-09-03 リリース")
      // 第二次运行：既有日期行被识别，零改动、不追加第二行
      expect(formatChangelog(file, "2026-09-04", plainJa)).toBe(false)
      expect(readFileSync(file, "utf8")).toBe(once)
    })
  })

  it("内置语言互跑：zh 日期行在 en 下仍被识别、不重复追加", () => {
    withChangelog("# pkg\n\n## 1.0.0\n\n> 2025-01-01 发布\n\n### 🐛 补丁修复\n\n- 条目\n", (file) => {
      expect(formatChangelog(file, "2026-09-03", en)).toBe(false)
      expect(readFileSync(file, "utf8").match(/发布/g)).toHaveLength(1)
    })
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
    expect(out).toContain("- 文档：统一品牌中文名")
    expect(out).toContain("- 第二条描述")
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

  it("公共 API 签名不变：formatChangelog 返回 boolean、formatChangelogs 返回 string[]", () => {
    withChangelog("# pkg\n\n## 1.0.0\n\n> 2026-09-01 发布\n\n### 🐛 补丁修复\n\n- 条目\n", (file, dir) => {
      expect(typeof formatChangelog(file, "2026-09-03", zh)).toBe("boolean")
      expect(Array.isArray(formatChangelogs(dir, "2026-09-03", zh))).toBe(true)
    })
  })

  it("localDate 格式", () => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test(localDate())).toBe(true)
  })
})

describe("countUntypedEntries", () => {
  it("只计英文源组块内缺前缀条目，历史块不参与", () => {
    withChangelog(
      "# pkg\n\n## 1.1.0\n\n### Patch Changes\n\n- 修复：有前缀\n- 无前缀条目\n\n## 1.0.0\n\n> 2026-09-01 发布\n\n### 🐛 补丁修复\n\n- 历史无前缀条目\n",
      (_file, dir) => {
        expect(countUntypedEntries(dir, zh)).toBe(1)
      },
    )
  })

  it("纯历史 CHANGELOG 返回 0（历史块零告警的计数依据）", () => {
    withChangelog("# pkg\n\n## 1.0.0\n\n> 2026-09-01 发布\n\n### 🐛 补丁修复\n\n- 历史条目一\n- 历史条目二\n", (_file, dir) => {
      expect(countUntypedEntries(dir, zh)).toBe(0)
    })
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
