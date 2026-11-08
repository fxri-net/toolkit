import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

// 无损检查以 git tag 为基线，测试在临时仓库里造 tag 再比对，验证真实子进程行为
const script = join(process.cwd(), "scripts", "check-doc-loss.mjs")
const fixtures: string[] = []

function git(root: string, args: string[]) {
  const result = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", "user.email=test@example.com", "-c", "user.name=test", ...args], {
    cwd: root,
    encoding: "utf8",
  })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} 失败：${result.stderr}`)
  return result.stdout
}

function createRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fxri-doc-loss-"))
  fixtures.push(root)
  git(root, ["init"])
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, "utf8")
  }
  git(root, ["add", "."])
  git(root, ["commit", "-m", "init"])
  return root
}

function run(root: string) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" })
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const ORIGINAL = "文档可以精炼，但是不能有损压缩，丢掉事实就是错的，这句必须保留下来。\n"

describe("文档无损检查：整句比对", () => {
  it("打 tag 后删掉整句会给出告警", () => {
    const root = createRepo({ "docs/a.md": ORIGINAL })
    git(root, ["tag", "v0.0.1"])
    writeFileSync(join(root, "docs/a.md"), "文档可以精炼，但不能丢事实。\n", "utf8")
    const result = run(root)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("[doc-loss]")
    expect(result.stdout).toContain("疑似丢失")
  })

  it("整句保留时不报丢失", () => {
    const root = createRepo({ "docs/a.md": ORIGINAL })
    git(root, ["tag", "v0.0.1"])
    const result = run(root)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("未发现整句丢失")
  })

  it("没有版本 tag 时跳过且不阻断", () => {
    const root = createRepo({ "docs/a.md": ORIGINAL })
    const result = run(root)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("跳过")
  })
})
