// 注释对齐检查的假现场用例：以子进程实跑脚本，验证真实退出码与报错文案
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const script = join(process.cwd(), "scripts", "check-docs-comments.mjs")
const fixtures: string[] = []

function createFixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fxri-comments-"))
  fixtures.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, "utf8")
  }
  return root
}

function run(root: string) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// 三行块：基准 14（toolkit task x），目标列 16，1 基列号 17
const aligned = "```bash\ntoolkit task    # 甲\ntoolkit task x  # 乙\n```\n"

describe("注释对齐检查：分组与基准", () => {
  it("合规块退出 0", () => {
    expect(run(createFixture({ "docs/ok.md": aligned })).status).toBe(0)
  })

  it("差 1 列即报出 文件:行号 与期望 / 实际列", () => {
    const bad = "```bash\ntoolkit task     # 甲\ntoolkit task x  # 乙\n```\n"
    const result = run(createFixture({ "docs/bad.md": bad }))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("docs/bad.md:2: 期望列 17 实际 18")
  })

  it("≥6 行时离群命令只留 1 个空格", () => {
    const body = ["aaaaa  # 1", "aaaaa  # 2", "aaaaa  # 3", "aaaaa  # 4", "aaaaa  # 5", `${"b".repeat(25)} # 6`].join("\n")
    expect(run(createFixture({ "docs/six.md": `\`\`\`bash\n${body}\n\`\`\`\n` })).status).toBe(0)
    const over = body.replace(`${"b".repeat(25)} # 6`, `${"b".repeat(25)}  # 6`)
    const result = run(createFixture({ "docs/six-bad.md": `\`\`\`bash\n${over}\n\`\`\`\n` }))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("期望列 27 实际 28")
  })
})

describe("注释对齐检查：断组", () => {
  it("空行、整行注释、URL、缩进与标记切换都不并入同组", () => {
    const text = [
      "```bash",
      "toolkit a   # 甲",
      "toolkit bb  # 乙",
      "",
      "# 整行注释不参与",
      "toolkit c   # 丙",
      "curl https://example.com/x#frag",
      "toolkit dd # 丁",
      "```",
      "",
      "```ts",
      "const a = 1   // 甲",
      "const bb = 2  // 乙",
      "```",
      "",
    ].join("\n")
    expect(run(createFixture({ "docs/breaks.md": text })).status).toBe(0)
  })

  it("树块整块忽略缩进、按整块最长对齐", () => {
    const tree = ["```text", "├── a.md       # 甲", "    ├── cc.md  # 乙", "```", ""].join("\n")
    expect(run(createFixture({ "docs/tree.md": tree })).status).toBe(0)
    const indentBased = ["```text", "├── a.md  # 甲", "    ├── cc.md  # 乙", "```", ""].join("\n")
    const result = run(createFixture({ "docs/tree-bad.md": indentBased }))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("docs/tree-bad.md:2: 期望列 16 实际 11")
  })
})

describe("注释对齐检查：宽度与检查面", () => {
  it("中文按 2 列计宽：少补 1 格即报出", () => {
    const cjk = ["```bash", "toolkit task export 报表.xlsx     # 甲", "toolkit task stats --format json  # 乙", "```", ""].join("\n")
    expect(run(createFixture({ "docs/cjk.md": cjk })).status).toBe(0)
    const narrow = cjk.replace("报表.xlsx     #", "报表.xlsx    #")
    const result = run(createFixture({ "docs/cjk-bad.md": narrow }))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("期望列 35 实际 34")
  })

  it("生成物 docs/changelog.md 不在检查面", () => {
    expect(run(createFixture({ "docs/changelog.md": "```bash\ntoolkit a # 甲\ntoolkit bb    # 乙\n```\n" })).status).toBe(0)
  })

  it("代码块外的注释文本不参与检查", () => {
    expect(run(createFixture({ "docs/prose.md": "正文里写 # 不是代码块注释；另一行 # 也不算。\n" })).status).toBe(0)
  })
})
