// 技能版本递增：两处版本声明同源改写、批量与直达设定、非法入参不写盘
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { bumpSkillVersions, bumpVersion, isValidVersion } from "../skills/bump"

let root = ""

// 写一份带两处版本声明的最小技能
function writeSkill(name: string, version = "1.0.0", body = true): void {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  const content = `---\nname: ${name}\ndescription: 测试技能\nmetadata:\n  version: "${version}"\n  tier: core\n---\n\n# ${name}\n${body ? `\n> 本技能版本 ${version}（测试）\n` : ""}`
  writeFileSync(join(dir, "SKILL.md"), content, "utf8")
}

// 读取某技能的两处版本
function versions(name: string): { frontmatter: string; body: string } {
  const content = readFileSync(join(root, name, "SKILL.md"), "utf8")
  const frontmatter = /^[ \t]+version:[ \t]*"([^"]+)"/m.exec(content)?.[1] ?? ""
  const body = /^> 本技能版本 ([^\s（(]+)/m.exec(content)?.[1] ?? ""
  return { frontmatter, body }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tk-bump-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
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
    writeSkill("alpha", "1.0.0")
    const [result] = bumpSkillVersions({ skillsDir: root, names: ["alpha"] })
    expect(result).toMatchObject({ name: "alpha", from: "1.0.0", to: "1.0.1" })
    expect(versions("alpha")).toEqual({ frontmatter: "1.0.1", body: "1.0.1" })
  })

  it("--all 批量递增全部技能", () => {
    writeSkill("alpha", "1.0.0")
    writeSkill("beta", "2.1.0")
    const results = bumpSkillVersions({ skillsDir: root, all: true, type: "minor" })
    expect(results.map((item) => `${item.name}:${item.to}`)).toEqual(["alpha:1.1.0", "beta:2.2.0"])
  })

  it("--set 直接设定版本", () => {
    writeSkill("alpha", "1.0.0")
    bumpSkillVersions({ skillsDir: root, names: ["alpha"], set: "0.3.0" })
    expect(versions("alpha")).toEqual({ frontmatter: "0.3.0", body: "0.3.0" })
  })

  it("--dry-run 不写盘", () => {
    writeSkill("alpha", "1.0.0")
    const results = bumpSkillVersions({ skillsDir: root, names: ["alpha"], dryRun: true })
    expect(results[0]?.to).toBe("1.0.1")
    expect(versions("alpha")).toEqual({ frontmatter: "1.0.0", body: "1.0.0" })
  })

  it("正文缺版本声明时只改 frontmatter，不报错", () => {
    writeSkill("alpha", "1.0.0", false)
    bumpSkillVersions({ skillsDir: root, names: ["alpha"] })
    expect(versions("alpha")).toEqual({ frontmatter: "1.0.1", body: "" })
  })

  it("非法入参直接报错：技能不存在 / --all 与名单并存 / 未声明版本", () => {
    writeSkill("alpha", "1.0.0")
    mkdirSync(join(root, "noversion"))
    writeFileSync(join(root, "noversion", "SKILL.md"), "---\nname: noversion\n---\n", "utf8")
    expect(() => bumpSkillVersions({ skillsDir: root, names: ["missing"] })).toThrow("未找到技能")
    expect(() => bumpSkillVersions({ skillsDir: root, all: true, names: ["alpha"] })).toThrow("不能同时使用")
    expect(() => bumpSkillVersions({ skillsDir: root, names: ["noversion"] })).toThrow("未声明")
  })

  it("isValidVersion 只接受三段式", () => {
    expect(isValidVersion("1.2.3")).toBe(true)
    expect(isValidVersion("1.2.3-beta.1")).toBe(true)
    expect(isValidVersion("1.2")).toBe(false)
  })
})
