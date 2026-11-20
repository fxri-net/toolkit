// 作用域向导计划：目录扫描与配置段合并
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { dedupe, mergeActivation, scanRepositories } from "../scope/plan"

let root = ""

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "scope-plan-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("scanRepositories", () => {
  it("按 .git / package.json / .tasks 识别仓库并跳过依赖目录", () => {
    mkdirSync(join(root, "repo-a", ".git"), { recursive: true })
    mkdirSync(join(root, "repo-b"), { recursive: true })
    writeFileSync(join(root, "repo-b", "package.json"), "{}")
    mkdirSync(join(root, "repo-c", ".tasks"), { recursive: true })
    mkdirSync(join(root, "plain"), { recursive: true })
    mkdirSync(join(root, "node_modules", "x", ".git"), { recursive: true })
    writeFileSync(join(root, "file.txt"), "")
    const repos = scanRepositories(root)
    expect(repos.map((repo) => repo.name)).toEqual(["repo-a", "repo-b", "repo-c"])
  })
})

describe("mergeActivation", () => {
  it("只改模式与指定数组，保留 markers 与其它配置段", () => {
    const config = {
      redact: { enabled: false },
      activation: { mode: "denylist", include: ["/a"], exclude: ["/b"], markers: { include: [".m"], exclude: [] } },
    }
    const merged = mergeActivation(config, { mode: "allowlist", include: ["/c", "/c", " "] })
    expect(merged.redact).toEqual({ enabled: false })
    expect(merged.activation).toMatchObject({
      mode: "allowlist",
      include: ["/c"],
      exclude: ["/b"],
      markers: { include: [".m"], exclude: [] },
    })
  })
})

describe("dedupe", () => {
  it("去空去重并保持顺序", () => {
    expect(dedupe([" ", "/a", "/a", "/b"])).toEqual(["/a", "/b"])
  })
})
