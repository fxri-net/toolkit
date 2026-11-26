// 作用域向导计划：目录扫描与配置段合并
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { dedupe, mergeActivation, scanRepositories, scanRepositoryTree } from "../scope/plan"

let root = ""

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fxts-tk-scope-plan-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("scanRepositories", () => {
  it("按 .git / 项目标志 / package.json 识别仓库并跳过依赖目录", () => {
    mkdirSync(join(root, "repo-a", ".git"), { recursive: true })
    mkdirSync(join(root, "repo-b"), { recursive: true })
    writeFileSync(join(root, "repo-b", "package.json"), "{}")
    mkdirSync(join(root, "repo-c"), { recursive: true })
    writeFileSync(join(root, "repo-c", ".toolkitrc.json"), "{}")
    mkdirSync(join(root, "plain"), { recursive: true })
    mkdirSync(join(root, "node_modules", "x", ".git"), { recursive: true })
    writeFileSync(join(root, "file.txt"), "")
    const repos = scanRepositories(root)
    expect(repos.map((repo) => repo.name)).toEqual(["repo-a", "repo-b", "repo-c"])
  })

  it("排序按显式 en 口径，不随系统 locale 漂移", () => {
    mkdirSync(join(root, "beta", ".git"), { recursive: true })
    mkdirSync(join(root, "Alpha", ".git"), { recursive: true })
    mkdirSync(join(root, "中文仓库", ".git"), { recursive: true })
    expect(scanRepositories(root).map((repo) => repo.name)).toEqual(["Alpha", "beta", "中文仓库"])
    expect(scanRepositoryTree(root).repos.map((repo) => repo.name)).toEqual(["Alpha", "beta", "中文仓库"])
  })

  it("项目标志目录在递归扫描中识别为 project", () => {
    mkdirSync(join(root, "flagged"), { recursive: true })
    writeFileSync(join(root, "flagged", ".toolkitrc.json"), "{}")
    expect(scanRepositoryTree(root).repos.find((repo) => repo.name === "flagged")?.kind).toBe("project")
  })
})

// 递归扫描夹具：多层仓库、依赖目录、隐藏目录、嵌套仓库与非 git 项目
function createTree(): void {
  mkdirSync(join(root, "depth1", ".git"), { recursive: true })
  mkdirSync(join(root, "middle", "a", "b", ".git"), { recursive: true })
  mkdirSync(join(root, "plain"), { recursive: true })
  writeFileSync(join(root, "plain", "package.json"), "{}")
  mkdirSync(join(root, "npmproj"), { recursive: true })
  writeFileSync(join(root, "npmproj", "package.json"), "{}")
  writeFileSync(join(root, "npmproj", "pnpm-lock.yaml"), "")
  mkdirSync(join(root, "monorepo", ".git"), { recursive: true })
  mkdirSync(join(root, "monorepo", "inner", ".git"), { recursive: true })
  mkdirSync(join(root, "vendor", "x"), { recursive: true })
  writeFileSync(join(root, "vendor", "x", "package.json"), "{}")
  writeFileSync(join(root, "vendor", "x", "package-lock.json"), "{}")
  mkdirSync(join(root, ".hidden", ".git"), { recursive: true })
}

describe("scanRepositoryTree", () => {
  it("递归发现仓库，依赖目录不进入，monorepo 子包不算项目", () => {
    createTree()
    const result = scanRepositoryTree(root)
    expect(result.repos.map((repo) => repo.name)).toEqual(["b", "depth1", "monorepo", "npmproj"])
    expect(result.repos.find((repo) => repo.name === "npmproj")?.kind).toBe("npm")
    expect(result.truncated).toBeNull()
    expect(result.nestedPruned).toBe(3)
    expect(result.skipped.some((item) => item.path.includes("vendor"))).toBe(true)
  })

  it("默认跳过隐藏目录与嵌套仓库，开启后能发现", () => {
    createTree()
    const defaults = scanRepositoryTree(root)
    expect(defaults.repos.some((repo) => repo.name === ".hidden")).toBe(false)
    expect(defaults.repos.some((repo) => repo.name === "inner")).toBe(false)

    const expanded = scanRepositoryTree(root, { hidden: true, nested: true })
    expect(expanded.repos.some((repo) => repo.name === ".hidden")).toBe(true)
    expect(expanded.repos.some((repo) => repo.name === "inner")).toBe(true)
    expect(expanded.nestedPruned).toBe(0)
  })

  it("深度、目录数与耗时上限触发截断并给出原因", () => {
    createTree()
    expect(scanRepositoryTree(root, { maxDepth: 1 }).truncated).toContain("深度超过上限")
    expect(scanRepositoryTree(root, { maxDirs: 2 }).truncated).toContain("目录数超过上限")
    expect(scanRepositoryTree(root, { maxMs: -1 }).truncated).toContain("耗时超过上限")
  })

  it("中断回调命中后停止扫描", () => {
    createTree()
    const result = scanRepositoryTree(root, { interrupted: () => true })
    expect(result.repos).toEqual([])
    expect(result.truncated).toBe("扫描已中断")
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
