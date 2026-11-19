import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

// 被测脚本以 process.cwd() 为仓库根，测试用临时目录模拟最小仓库结构并以子进程实跑
const script = join(process.cwd(), "scripts", "check-consistency.mjs")
const fixtures: string[] = []

const skillDoc = [
  "---",
  "name: fxri-demo",
  "metadata:",
  '  version: "1.0.0"',
  "  tier: core",
  "---",
  "",
  "# 演示技能",
  "",
  "> 本技能版本 1.0.0（随 @fxri/toolkit 同批分发）",
  "",
  "细则见 `references/task-spec.md`。",
  "",
].join("\n")

const skillTable = [
  "| 技能 | 版本 | 用途 | 层级 |",
  "| --- | --- | --- | --- |",
  "| [fxri-demo](./fxri-demo/SKILL.md) | 1.0.0 | 演示用技能 | core |",
  "",
].join("\n")

function createFixture(references: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fxri-consistency-"))
  fixtures.push(root)
  const files: Record<string, string> = {
    "skills/fxri-demo/SKILL.md": skillDoc,
    "skills/README.md": skillTable,
    "docs/guide.md": skillTable,
  }
  for (const [rel, content] of Object.entries(references)) files[rel] = content
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, "utf8")
  }
  return root
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("规范一致性：技能 references 引用", () => {
  it("SKILL 指向的 references 文件缺失时报 error", () => {
    const root = createFixture({})
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("引用的 references/task-spec.md 不存在")
  })

  it("references 文件存在时通过", () => {
    const root = createFixture({ "skills/fxri-demo/references/task-spec.md": "# 任务规范\n" })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("references 引用可解析")
  })
})

// 站点导航锚点：锚点按标题归一比对，写错即报 error（页面标题见 docs/faq.md 的 H2）
const faqDoc = ["# 常见问题", "", "## 安装与环境", "", "### 示例问题", "", "略。", ""].join("\n")

function navDoc(anchor: string): string {
  return JSON.stringify(
    {
      nav: [],
      sidebar: [
        {
          text: "帮助",
          items: [{ text: "常见问题", collapsed: false, items: [{ text: "安装与环境", link: `/faq#${anchor}` }] }],
        },
      ],
    },
    null,
    2,
  )
}

describe("规范一致性：站点导航锚点", () => {
  const base = { "skills/fxri-demo/references/task-spec.md": "# 任务规范\n", "docs/faq.md": faqDoc }

  it("锚点与页面标题一致时通过", () => {
    const root = createFixture({ ...base, "docs/site-nav.json": navDoc("安装与环境") })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(0)
  })

  it("锚点写错时报 error 并指出该锚点", () => {
    const root = createFixture({ ...base, "docs/site-nav.json": navDoc("安装与配境") })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("/faq#安装与配境")
  })

  it("近似但不等于标题的锚点同样报 error（判据取等值）", () => {
    const root = createFixture({ ...base, "docs/site-nav.json": navDoc("安装") })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("/faq#安装")
  })

  it("locales 分支里的锚点同样参与校验", () => {
    const locales = JSON.stringify({
      locales: {
        root: {
          nav: [],
          sidebar: [{ text: "帮助", items: [{ text: "常见问题", items: [{ text: "安装与环境", link: "/faq#安装与配境" }] }] }],
        },
      },
    })
    const root = createFixture({ ...base, "docs/site-nav.json": locales })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("/faq#安装与配境")
  })
})
