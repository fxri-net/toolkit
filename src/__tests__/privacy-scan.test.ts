// 隐私扫描：按路径范围分级，档位 off 跳过；--fix 只改任务区
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resetToolkitConfigCache } from "../config"
import { fixPrivacyPaths, scanPrivacy } from "../privacy/scan"
import { tempDir } from "./helpers"

let root = ""
let originalCwd = ""

// 建现场：任务归档 / 变更集 / 文档各放一处盘符路径
function writeScene(): void {
  mkdirSync(join(root, ".tasks", "archive", "202611"), { recursive: true })
  writeFileSync(join(root, ".tasks", "archive", "202611", "20261123.md"), "证据在 D:\\Work\\demo\\tk-fulltest\n")
  mkdirSync(join(root, ".changeset"), { recursive: true })
  writeFileSync(join(root, ".changeset", "demo.md"), "改动见 D:\\Work\\demo\\toolkit\n")
  mkdirSync(join(root, "docs"), { recursive: true })
  writeFileSync(join(root, "docs", "guide.md"), "示例：/home/me/proj\n")
}

function writeLevel(level: string): void {
  writeFileSync(join(root, ".toolkitrc.json"), JSON.stringify({ privacy: { localPaths: level } }))
  resetToolkitConfigCache()
}

beforeEach(() => {
  originalCwd = process.cwd()
  root = tempDir("fxts-tk-privacy-scan-")
  process.chdir(root)
  resetToolkitConfigCache()
})

afterEach(() => {
  process.chdir(originalCwd)
  resetToolkitConfigCache()
  rmSync(root, { recursive: true, force: true })
})

describe("隐私扫描", () => {
  it("档位 off 时跳过，不产生任何命中", () => {
    writeScene()
    const report = scanPrivacy()
    expect(report.skipped).toBe(true)
    expect(report.hits).toHaveLength(0)
  })

  it("档位开启后按范围分级：任务归档与变更集阻断，文档只提示", () => {
    writeScene()
    writeLevel("error")
    const report = scanPrivacy()
    expect(report.skipped).toBe(false)
    expect(report.errors).toBe(2)
    expect(report.warnings).toBe(1)
    expect(report.hits.map((hit) => hit.file).sort()).toEqual([
      ".changeset/demo.md",
      ".tasks/archive/202611/20261123.md",
      "docs/guide.md",
    ])
  })

  it("--fix 只归一任务区，文档保持原样", () => {
    writeScene()
    writeLevel("error")
    const fixed = fixPrivacyPaths()
    expect(fixed.normalized).toBe(1)
    expect(readFileSync(join(root, ".tasks", "archive", "202611", "20261123.md"), "utf8")).toContain("<本机>/…/tk-fulltest")
    expect(readFileSync(join(root, "docs", "guide.md"), "utf8")).toContain("/home/me/proj")
  })

  it("--fix --dry-run 只统计将改写的处数，不写盘", () => {
    writeScene()
    writeLevel("error")
    const before = readFileSync(join(root, ".tasks", "archive", "202611", "20261123.md"), "utf8")
    const fixed = fixPrivacyPaths(process.cwd(), { dryRun: true })
    expect(fixed.normalized).toBe(1)
    expect(fixed.files).toEqual([".tasks/archive/202611/20261123.md"])
    expect(readFileSync(join(root, ".tasks", "archive", "202611", "20261123.md"), "utf8")).toBe(before)
  })
})
