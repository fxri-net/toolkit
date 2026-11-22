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
function cliDoc(options: { domains?: string[]; terms?: string[] } = {}): string {
  const domains = options.domains ?? ["task", "skill", "rule", "config", "convention", "docs", "scope", "usage"]
  const terms = options.terms ?? ["层", "面", "名单", "预演", "确认", "来源", "目标", "范围"]
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
    "退出码以[退出码与解析错误](./cli/exit-codes)为单一真源。",
    "",
    "## 相关页面",
    "",
  ].join("\n")
}

// 退出码页：数值表由生成器维护，检查器只要求标记存在
const exitDoc = ["# 退出码", "", "<!-- toolkit:exit-codes:start -->", "<!-- toolkit:exit-codes:end -->", ""].join("\n")

// 命令注册表假现场：域清单从注册表派生，每个域至少登记一条子命令
const registryFixture = [
  "export const COMMAND_REGISTRY = [",
  ...["task", "skill", "rule", "config", "convention", "docs", "scope", "usage"].flatMap((domain) => [
    `  { path: "${domain}", stage: "current" },`,
    `  { path: "${domain} demo", stage: "current" },`,
  ]),
  "]",
  "",
].join("\n")

describe("规范一致性：CLI 入口矩阵与术语表", () => {
  const base = { "skills/fxri-demo/references/task-spec.md": "# 任务规范\n", "docs/cli/exit-codes.md": exitDoc, "src/command-registry.ts": registryFixture }

  it("入口矩阵、术语表与退出码单源齐全时通过", () => {
    const root = createFixture({ ...base, "docs/cli.md": cliDoc() })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(0)
  })

  it("入口矩阵缺域时报 error 并指出域名", () => {
    const root = createFixture({ ...base, "docs/cli.md": cliDoc({ domains: ["task", "skill"] }) })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("裸命令入口缺少 `toolkit rule`")
  })

  it("术语表缺术语时报 error", () => {
    const root = createFixture({ ...base, "docs/cli.md": cliDoc({ terms: ["层", "面"] }) })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("术语表缺少「预演」")
  })

  it("cli.md 未引用退出码单一真源时报 error", () => {
    const doc = cliDoc().replace("./cli/exit-codes", "./cli/something")
    const root = createFixture({ ...base, "docs/cli.md": doc })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("未引用退出码单一真源")
  })

  it("退出码页缺生成标记时报 error", () => {
    const root = createFixture({ ...base, "docs/cli.md": cliDoc(), "docs/cli/exit-codes.md": "# 退出码\n" })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("缺少生成标记")
  })
})

// 规则块只放业务文本：读者向措辞出现即报 error，锚点行不参与扫描
const ruleBase = { "skills/fxri-demo/references/task-spec.md": "# 任务规范\n" }
const moduleDoc = (body: string) => ["> 规则更新时间 2026-11-20 11:52", "", "## 演示", "", body, ""].join("\n")
const pageDoc = (body: string) =>
  ["# 演示", "", "````markdown", "> 规则更新时间 2026-11-20 11:52", "", "## 演示", "", body, "````", ""].join("\n")

// 页面命名：声明 title 的页面须与首个 H1 一致；配置分页索引用目标页完整标题
const namingBase = { "skills/fxri-demo/references/task-spec.md": "# 任务规范\n" }
const titledPage = (title: string, h1: string) => ["---", `title: ${title}`, "---", "", `# ${h1}`, ""].join("\n")
const configIndex = (label: string) =>
  [
    "# 配置参考",
    "",
    "## 配置分页",
    "",
    "| 分组 | 内容 |",
    "| --- | --- |",
    `| [${label}](./config/redact) | 示例 |`,
    "",
    "## 相关页面",
    "",
  ].join("\n")

describe("规范一致性：页面命名", () => {
  it("title 与 H1 一致、索引文案为目标页标题时通过", () => {
    const root = createFixture({
      ...namingBase,
      "docs/config/redact.md": titledPage("隐私脱敏（redact）", "隐私脱敏（redact）"),
      "docs/config.md": configIndex("隐私脱敏（redact）"),
    })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(0)
  })

  it("title 与 H1 不一致时报 error 并指出文件", () => {
    const root = createFixture({
      ...namingBase,
      "docs/config/redact.md": titledPage("隐私脱敏（redact）", "redact：隐私脱敏"),
    })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("docs/config/redact.md")
    expect(result.stderr).toContain("一级标题")
  })

  it("H1 前的 HTML 锚点不影响比对", () => {
    const body = ["---", "title: 作用域配置（activation / policies）", "---", "", '<a id="作用域activation"></a>', "", "# 作用域配置（activation / policies）", ""].join(
      "\n",
    )
    const root = createFixture({ ...namingBase, "docs/config/activation.md": body })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(0)
  })

  it("索引文案与目标页标题不一致时报 error", () => {
    const root = createFixture({
      ...namingBase,
      "docs/config/redact.md": titledPage("隐私脱敏（redact）", "隐私脱敏（redact）"),
      "docs/config.md": configIndex("redact（隐私脱敏）"),
    })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("索引文案「redact（隐私脱敏）」")
  })
})

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

// 事实注册表（C-48）：只校验结构——小节存在、ID 连续、批次合法；不解析 owner 散文路径
function factsDoc(ids: string[], batch = "B1"): string {
  return [
    "# 全端通用规范（common）",
    "",
    "## C-48. 单一真源与事实注册表",
    "",
    "| ID | 事实 | owner | 手段 | 补强 | 批次 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...ids.map((id) => `| ${id} | 示例事实 | \`src/a.ts\` | 派生 | — | ${batch} |`),
    "",
  ].join("\n")
}

describe("规范一致性：事实注册表结构", () => {
  const base = { "skills/fxri-demo/references/task-spec.md": "# 任务规范\n" }

  it("ID 连续、批次合法时通过", () => {
    const root = createFixture({ ...base, ".tasks/conventions/common.md": factsDoc(["F-1", "F-2"]) })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(0)
  })

  it("ID 不连续时报 error", () => {
    const root = createFixture({ ...base, ".tasks/conventions/common.md": factsDoc(["F-1", "F-3"]) })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("须从 F-1 连续递增")
  })

  it("缺少 C-48 小节时报 error", () => {
    const doc = ["# 全端通用规范（common）", "", "## C-47. 其它", "", "略。", ""].join("\n")
    const root = createFixture({ ...base, ".tasks/conventions/common.md": doc })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("缺少 C-48")
  })

  it("批次非法时报 error", () => {
    const root = createFixture({ ...base, ".tasks/conventions/common.md": factsDoc(["F-1"], "B9") })
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("批次须以 B0–B3 开头")
  })
})
