// 技能版本递增：两处版本声明同源改写、多根目录、两处不一致的显式取舍、写回前 lint 校验
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { bumpSkillVersions } from "../skills/bump"
import { bumpVersion, isValidVersion } from "../skills/versioning"

let root = ""
let second = ""

interface SkillFixture {
  version?: string
  bodyVersion?: string | null
  license?: boolean
}

// 写一份带两处版本声明的最小合规技能
function writeSkill(dir: string, name: string, options: SkillFixture = {}): string {
  const version = options.version ?? "1.0.0"
  const body = options.bodyVersion === null ? null : (options.bodyVersion ?? version)
  const skillDir = join(dir, name)
  mkdirSync(skillDir, { recursive: true })
  const lines = ["---", `name: ${name}`, "description: 测试技能"]
  if (options.license !== false) lines.push("license: MIT")
  lines.push("metadata:", `  version: "${version}"`, "  tier: core", "  author: fxri", "  source: https://github.com/fxri-net/toolkit", "---", "", `# ${name}`, "")
  if (body !== null) lines.push(`> 本技能版本 ${body}（测试）`, "")
  writeFileSync(join(skillDir, "SKILL.md"), lines.join("\n"), "utf8")
  return skillDir
}

// 读取某技能的两处版本
function versions(name: string, dir = root): { frontmatter: string; body: string } {
  const content = readFileSync(join(dir, name, "SKILL.md"), "utf8")
  const frontmatter = /^[ \t]+version:[ \t]*"([^"]+)"/m.exec(content)?.[1] ?? ""
  const body = /^> 本技能版本 ([^\s（(]+)/m.exec(content)?.[1] ?? ""
  return { frontmatter, body }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tk-bump-"))
  second = mkdtempSync(join(tmpdir(), "tk-bump-second-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(second, { recursive: true, force: true })
})

describe("bumpVersion", () => {
  it("按类型递增并丢弃预发布后缀", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4")
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0")
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0")
    expect(bumpVersion("1.2.3-beta.1", "patch")).toBe("1.2.4")
  })

  it("非法版本返回 null", () => {
    expect(bumpVersion("1.2", "patch")).toBeNull()
    expect(bumpVersion("x.y.z", "patch")).toBeNull()
  })
})

describe("bumpSkillVersions", () => {
  it("两处版本同时改写，其他内容不动", () => {
    writeSkill(root, "fxri-alpha", { version: "1.0.0" })
    const [result] = bumpSkillVersions({ skillsDirs: [root], names: ["fxri-alpha"] })
    expect(result).toMatchObject({ name: "fxri-alpha", from: "1.0.0", to: "1.0.1" })
    expect(versions("fxri-alpha")).toEqual({ frontmatter: "1.0.1", body: "1.0.1" })
  })

  it("--all 批量递增全部技能", () => {
    writeSkill(root, "fxri-alpha", { version: "1.0.0" })
    writeSkill(root, "fxri-beta", { version: "2.1.0" })
    const results = bumpSkillVersions({ skillsDirs: [root], all: true, type: "minor" })
    expect(results.map((item) => `${item.name}:${item.to}`)).toEqual(["fxri-alpha:1.1.0", "fxri-beta:2.2.0"])
  })

  it("--set 直接设定版本", () => {
    writeSkill(root, "fxri-alpha", { version: "1.0.0" })
    bumpSkillVersions({ skillsDirs: [root], names: ["fxri-alpha"], set: "0.3.0" })
    expect(versions("fxri-alpha")).toEqual({ frontmatter: "0.3.0", body: "0.3.0" })
  })

  it("--dry-run 不写盘，但仍按待写内容校验", () => {
    writeSkill(root, "fxri-alpha", { version: "1.0.0" })
    const results = bumpSkillVersions({ skillsDirs: [root], names: ["fxri-alpha"], dryRun: true })
    expect(results[0]?.to).toBe("1.0.1")
    expect(versions("fxri-alpha")).toEqual({ frontmatter: "1.0.0", body: "1.0.0" })
  })

  it("多根目录统一解析与批量递增", () => {
    writeSkill(root, "fxri-alpha", { version: "1.0.0" })
    writeSkill(second, "fxri-beta", { version: "2.0.0" })
    const results = bumpSkillVersions({ skillsDirs: [root, second], all: true })
    expect(results.map((item) => item.name)).toEqual(["fxri-alpha", "fxri-beta"])
    expect(versions("fxri-alpha")).toEqual({ frontmatter: "1.0.1", body: "1.0.1" })
    expect(versions("fxri-beta", second)).toEqual({ frontmatter: "2.0.1", body: "2.0.1" })
  })

  it("跨根同名技能直接报错", () => {
    writeSkill(root, "fxri-alpha")
    writeSkill(second, "fxri-alpha")
    expect(() => bumpSkillVersions({ skillsDirs: [root, second], all: true })).toThrow("技能名重复")
  })

  it("正文缺版本声明时报错，不静默只改 frontmatter", () => {
    writeSkill(root, "fxri-alpha", { bodyVersion: null })
    expect(() => bumpSkillVersions({ skillsDirs: [root], names: ["fxri-alpha"] })).toThrow("正文缺少")
  })

  it("两处版本不一致时默认报错，--from 指定源头后可写回", () => {
    writeSkill(root, "fxri-alpha", { version: "1.0.0", bodyVersion: "0.9.0" })
    expect(() => bumpSkillVersions({ skillsDirs: [root], names: ["fxri-alpha"] })).toThrow("两处版本不一致")
    const [result] = bumpSkillVersions({ skillsDirs: [root], names: ["fxri-alpha"], from: "body" })
    expect(result).toMatchObject({ from: "0.9.0", to: "0.9.1" })
    expect(versions("fxri-alpha")).toEqual({ frontmatter: "0.9.1", body: "0.9.1" })
  })

  it("写回前 lint 未通过时整体中止且不写盘", () => {
    writeSkill(root, "fxri-alpha", { version: "1.0.0", license: false })
    expect(() => bumpSkillVersions({ skillsDirs: [root], names: ["fxri-alpha"] })).toThrow("递增后校验未通过")
    expect(versions("fxri-alpha")).toEqual({ frontmatter: "1.0.0", body: "1.0.0" })
  })

  it("非法入参直接报错：技能不存在 / 目录不存在 / --all 与名单并存 / 未声明版本", () => {
    writeSkill(root, "fxri-alpha")
    const noversion = join(root, "fxri-noversion")
    mkdirSync(noversion)
    writeFileSync(join(noversion, "SKILL.md"), "---\nname: fxri-noversion\n---\n", "utf8")
    expect(() => bumpSkillVersions({ skillsDirs: [root], names: ["missing"] })).toThrow("未找到技能")
    expect(() => bumpSkillVersions({ skillsDirs: [join(root, "nope")], all: true })).toThrow("未找到技能目录")
    expect(() => bumpSkillVersions({ skillsDirs: [root], all: true, names: ["fxri-alpha"] })).toThrow("不能同时使用")
    expect(() => bumpSkillVersions({ skillsDirs: [root], names: ["fxri-noversion"] })).toThrow("未声明")
  })

  it("isValidVersion 只接受三段式", () => {
    expect(isValidVersion("1.2.3")).toBe(true)
    expect(isValidVersion("1.2.3-beta.1")).toBe(true)
    expect(isValidVersion("1.2")).toBe(false)
  })
})
