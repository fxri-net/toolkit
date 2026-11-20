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

// CLI 入口矩阵、术语表与退出码：缺小节或缺行即报 error；假现场没有 docs/cli.md 时跳过
function cliDoc(options: { domains?: string[]; terms?: string[]; codes?: string[] } = {}): string {
  const domains = options.domains ?? ["tasks", "skills", "rules", "config", "conventions", "docs", "scope", "usage"]
  const terms = options.terms ?? ["层", "面", "名单", "预演", "确认", "来源", "目标", "范围"]
  const codes = options.codes ?? ["`0`", "`1`", "`2`", "`3`", "`130`"]
  return [
    "# CLI 参考",
    "",
    "## 裸命令入口",
    "",
    "| 域 | 说明 |",
    "| --- | --- |",
    ...domains.map((domain) => `| \`toolkit ${domain}\` | 示例 |`),
    "",
    "## 术语表",
    "",
    "| 术语 | 含义 |",
    "| --- | --- |",
    ...terms.map((term) => `| ${term} | 示例 |`),
    "",
    "## 退出码",
    "",
    "| 退出码 | 含义 |",
    "| --- | --- |",
    ...codes.map((code) => `| ${code} | 示例 |`),
    "",
    "## 相关页面",
    "",
  ].join("\n")
}

describe("规范一致性：CLI 入口矩阵与术语表", () => {
  const base = { "skills/fxri-demo/references/task-spec.md": "# 任务规范\n" }

  it("入口矩阵、术语表与退出码齐全时通过", () => {
    const root = createFixture({ ...base, "docs/cli.md": cliDoc() })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(0)
  })

  it("入口矩阵缺域时报 error 并指出域名", () => {
    const root = createFixture({ ...base, "docs/cli.md": cliDoc({ domains: ["tasks", "skills"] }) })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("裸命令入口缺少 `toolkit rules`")
  })

  it("术语表缺术语时报 error", () => {
    const root = createFixture({ ...base, "docs/cli.md": cliDoc({ terms: ["层", "面"] }) })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("术语表缺少「预演」")
  })

  it("退出码表缺 3 时报 error", () => {
    const root = createFixture({ ...base, "docs/cli.md": cliDoc({ codes: ["`0`", "`1`", "`2`", "`130`"] }) })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("退出码表缺少 `3`")
  })
})

// 规则块只放业务文本：读者向措辞出现即报 error，锚点行不参与扫描
const ruleBase = { "skills/fxri-demo/references/task-spec.md": "# 任务规范\n" }
const moduleDoc = (body: string) => ["> 规则更新时间 2026-11-20 11:52", "", "## 演示", "", body, ""].join("\n")
const pageDoc = (body: string) =>
  ["# 演示", "", "````markdown", "> 规则更新时间 2026-11-20 11:52", "", "## 演示", "", body, "````", ""].join("\n")

describe("规范一致性：规则块读者向措辞", () => {
  it("业务文本通过", () => {
    const root = createFixture({ ...ruleBase, "templates/rules/demo.md": moduleDoc("- 提交默认需确认，细节以技能为准。") })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(0)
  })

  it("模块正文出现「本模块」时报 error 并指出文件", () => {
    const root = createFixture({ ...ruleBase, "templates/rules/demo.md": moduleDoc("> 本模块暂无对应技能。") })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("templates/rules/demo.md")
    expect(result.stderr).toContain("本模块")
  })

  it("规则页围栏块出现「文档站」时报 error", () => {
    const root = createFixture({ ...ruleBase, "docs/rules/demo.md": pageDoc("细节见文档站。") })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("docs/rules/demo.md")
    expect(result.stderr).toContain("文档站")
  })

  it("「文本文件」属正常业务词，不误报「本文」", () => {
    const root = createFixture({ ...ruleBase, "templates/rules/demo.md": moduleDoc("脚本与文本文件按读取方定字节形态。") })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(0)
  })
})
