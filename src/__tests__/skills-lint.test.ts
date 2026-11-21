// 技能规范校验：合规放行、结构错误、预算两档、references、敏感信息、目标解析与版本递增
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { lintSkills, type SkillLintReport } from "../skills/lint"

interface SkillOptions {
  version?: string
  bodyVersion?: string | null
  tier?: string | null
  license?: string | null
  author?: string | null
  source?: string | null
  nameInFrontmatter?: string
  extraBody?: string
  referenceBody?: string
  extraReferences?: Record<string, string>
}

const fixtures: string[] = []

// 建临时检查根
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tk-lint-"))
  fixtures.push(root)
  return root
}

// 写一个结构完整的技能；各字段可按需置空，用于覆盖必填校验
function writeSkill(root: string, name: string, options: SkillOptions = {}): string {
  const dir = join(root, name)
  mkdirSync(join(dir, "references"), { recursive: true })
  const version = options.version ?? "1.0.0"
  const bodyVersion = options.bodyVersion === null ? null : (options.bodyVersion ?? version)
  const lines = ["---", `name: ${options.nameInFrontmatter ?? name}`, "description: 测试技能"]
  if (options.license !== null) lines.push(`license: ${options.license ?? "MIT"}`)
  lines.push("metadata:", `  version: "${version}"`)
  if (options.tier !== null) lines.push(`  tier: ${options.tier ?? "core"}`)
  if (options.author !== null) lines.push(`  author: ${options.author ?? "fxri"}`)
  if (options.source !== null) lines.push(`  source: ${options.source ?? "https://github.com/fxri-net/toolkit"}`)
  lines.push("---", "", `# ${name}`, "")
  if (bodyVersion !== null) lines.push(`> 本技能版本 ${bodyVersion}（测试）`, "")
  lines.push("## 参考", "", "- 指南：`references/guide.md`", "")
  if (options.extraBody) lines.push(options.extraBody, "")
  writeFileSync(join(dir, "SKILL.md"), lines.join("\n"), "utf8")
  writeFileSync(join(dir, "references", "guide.md"), options.referenceBody ?? "# 指南\n", "utf8")
  for (const [rel, content] of Object.entries(options.extraReferences ?? {})) {
    const file = join(dir, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content, "utf8")
  }
  return dir
}

// 按问题码取条目，便于断言具体违规
function codes(report: SkillLintReport): string[] {
  return report.issues.map((issue) => issue.code)
}

function git(root: string, args: string[]): string {
  const result = spawnSync("git", ["-c", "commit.gpgsign=false", "-c", "user.email=test@example.com", "-c", "user.name=test", ...args], {
    cwd: root,
    encoding: "utf8",
  })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} 失败：${result.stderr}`)
  return result.stdout
}

// 建一个已提交技能的仓库，返回检查根（仓库内 skills/）
function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "tk-lint-git-"))
  fixtures.push(root)
  git(root, ["init"])
  const skills = join(root, "skills")
  writeSkill(skills, "fxri-alpha")
  git(root, ["add", "."])
  git(root, ["commit", "-m", "init"])
  return skills
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("结构与字段", () => {
  it("合规技能零问题", () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha")
    const report = lintSkills({ dirs: [root] })
    expect(report.issues).toEqual([])
    expect(report.summary).toMatchObject({ skills: 1, errors: 0, warnings: 0, base: null, baseSkipped: null })
    expect(report.files).toHaveLength(1)
  })

  it("版本两处不一致与正文缺声明按错误处理", () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha", { bodyVersion: "0.9.0" })
    expect(codes(lintSkills({ dirs: [root] }))).toContain("version-mismatch")
    const missing = makeRoot()
    writeSkill(missing, "fxri-beta", { bodyVersion: null })
    expect(codes(lintSkills({ dirs: [missing] }))).toContain("body-version-missing")
  })

  it("必填字段、非法层级、目录命名与 name 一致性", () => {
    const root = makeRoot()
    writeSkill(root, "Bad_Name", { license: null, tier: "weird", nameInFrontmatter: "other" })
    const found = codes(lintSkills({ dirs: [root] }))
    expect(found).toContain("dir-name")
    expect(found).toContain("field-missing")
    expect(found).toContain("tier-invalid")
    expect(found).toContain("name-mismatch")
  })

  it("非法版本号报错", () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha", { version: "1.0", bodyVersion: "1.0" })
    expect(codes(lintSkills({ dirs: [root] }))).toContain("version-format")
  })

  it("自定义前缀与空前缀", () => {
    const root = makeRoot()
    writeSkill(root, "plain-name")
    expect(codes(lintSkills({ dirs: [root] }))).toContain("dir-name")
    expect(codes(lintSkills({ dirs: [root], prefix: "" }))).toEqual([])
  })
})

describe("入口篇幅", () => {
  it("超过告警线只告警", () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha", { extraBody: Array.from({ length: 160 }, (_, index) => `- 行 ${index}`).join("\n") })
    const report = lintSkills({ dirs: [root] })
    expect(report.issues.map((issue) => [issue.code, issue.level])).toEqual([["budget-warn", "warn"]])
    expect(report.summary.warnings).toBe(1)
  })

  it("超过硬上限报错，且 --budget 同步收紧字符线", () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha", { extraBody: Array.from({ length: 220 }, (_, index) => `- 行 ${index}`).join("\n") })
    expect(codes(lintSkills({ dirs: [root] }))).toContain("budget-exceeded")
    const tight = makeRoot()
    writeSkill(tight, "fxri-alpha")
    expect(codes(lintSkills({ dirs: [tight], budget: 100 }))).toContain("budget-exceeded")
  })
})

describe("references", () => {
  it("缺失引用与越界引用按错误处理，未引用文件只告警", () => {
    const root = makeRoot()
    const dir = writeSkill(root, "fxri-alpha", {
      extraBody: "- 外部：`../../outside/references/x.md`",
      extraReferences: { "references/orphan.md": "# 孤立\n" },
    })
    unlinkSync(join(dir, "references", "guide.md"))
    const report = lintSkills({ dirs: [root] })
    expect(codes(report)).toContain("reference-invalid")
    expect(codes(report)).toContain("reference-unused")
    expect(report.issues.find((issue) => issue.code === "reference-unused")?.level).toBe("warn")
    expect(report.summary.errors).toBeGreaterThan(0)
  })

  it("同一检查根内的跨技能引用可达", () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha", { extraBody: "- 细则：`fxri-beta/references/guide.md`" })
    writeSkill(root, "fxri-beta")
    expect(codes(lintSkills({ dirs: [root] }))).toEqual([])
  })
})

describe("敏感信息", () => {
  it("私钥、令牌与机器路径命中即错误，通用示例路径放行", () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha", {
      extraBody: [
        "-----BEGIN RSA PRIVATE KEY-----",
        "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789",
        "路径：/home/alice/work/project",
        "示例：/home/user/demo 与 C:\\Users\\<name>\\demo",
      ].join("\n"),
    })
    const report = lintSkills({ dirs: [root] })
    expect(codes(report)).toEqual(expect.arrayContaining(["secret-private-key", "secret-token", "machine-path"]))
    expect(report.summary.errors).toBe(3)
  })

  it("--ignore 跳过误报技能", () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha", { extraBody: "路径：/Users/alice/work" })
    const report = lintSkills({ dirs: [root], ignore: ["fxri-alpha"] })
    expect(report.summary).toMatchObject({ skills: 0, ignored: 1, errors: 0 })
  })
})

describe("目标解析", () => {
  it("目录缺失、无技能与同名技能均按错误处理", () => {
    const missing = join(makeRoot(), "nope")
    expect(codes(lintSkills({ dirs: [missing] }))).toContain("target-missing")
    const empty = makeRoot()
    expect(codes(lintSkills({ dirs: [empty] }))).toContain("no-skills")
    const first = makeRoot()
    const second = makeRoot()
    writeSkill(first, "fxri-alpha")
    writeSkill(second, "fxri-alpha")
    expect(codes(lintSkills({ dirs: [first, second] }))).toContain("duplicate-name")
  })

  it("同一目录重复传入只检查一次", () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha")
    const report = lintSkills({ dirs: [root, root] })
    expect(report.summary.skills).toBe(1)
    expect(report.issues).toEqual([])
  })
})

describe("版本递增（--base）", () => {
  it("内容变更未递增时报错，递增后通过", () => {
    const skills = makeRepo()
    const entry = join(skills, "fxri-alpha", "SKILL.md")
    const original = `---\nname: fxri-alpha\ndescription: 测试技能\nlicense: MIT\nmetadata:\n  version: "1.0.0"\n  tier: core\n  author: fxri\n  source: https://github.com/fxri-net/toolkit\n---\n\n# fxri-alpha\n\n> 本技能版本 1.0.0（测试）\n\n## 参考\n\n- 指南：\`references/guide.md\`\n\n- 新增内容\n`
    writeFileSync(entry, original, "utf8")
    expect(codes(lintSkills({ dirs: [skills], base: "HEAD" }))).toContain("version-not-bumped")
    writeFileSync(entry, original.replaceAll('"1.0.0"', '"1.0.1"').replace("本技能版本 1.0.0", "本技能版本 1.0.1"), "utf8")
    expect(codes(lintSkills({ dirs: [skills], base: "HEAD" }))).toEqual([])
  })

  it("仅行尾变化不算内容变更", () => {
    const skills = makeRepo()
    const entry = join(skills, "fxri-alpha", "SKILL.md")
    const lf = `---\nname: fxri-alpha\ndescription: 测试技能\nlicense: MIT\nmetadata:\n  version: "1.0.0"\n  tier: core\n  author: fxri\n  source: https://github.com/fxri-net/toolkit\n---\n\n# fxri-alpha\n\n> 本技能版本 1.0.0（测试）\n\n## 参考\n\n- 指南：\`references/guide.md\`\n`
    writeFileSync(entry, lf.replaceAll("\n", "\r\n"), "utf8")
    expect(codes(lintSkills({ dirs: [skills], base: "HEAD" }))).toEqual([])
  })

  it("新增技能不要求递增", () => {
    const skills = makeRepo()
    writeSkill(skills, "fxri-new")
    expect(codes(lintSkills({ dirs: [skills], base: "HEAD" }))).toEqual([])
  })

  it("非 git 仓库与基准缺失时给出跳过原因", () => {
    const root = makeRoot()
    writeSkill(root, "fxri-alpha")
    const outside = lintSkills({ dirs: [root], base: "HEAD" })
    expect(outside.summary.baseSkipped).toContain("不在 git 仓库内")
    const skills = makeRepo()
    const missing = lintSkills({ dirs: [skills], base: "no-such-ref" })
    expect(missing.summary.baseSkipped).toContain("基准提交 no-such-ref 不存在")
  })

  it("浅克隆缺基准提交时明确跳过", () => {
    const source = mkdtempSync(join(tmpdir(), "tk-lint-src-"))
    fixtures.push(source)
    git(source, ["init"])
    writeSkill(join(source, "skills"), "fxri-alpha")
    git(source, ["add", "."])
    git(source, ["commit", "-m", "init"])
    const clone = mkdtempSync(join(tmpdir(), "tk-lint-clone-"))
    fixtures.push(clone)
    git(dirname(clone), ["clone", "--depth", "1", "--no-local", source, clone])
    const report = lintSkills({ dirs: [join(clone, "skills")], base: "HEAD~1" })
    expect(report.summary.baseSkipped).toContain("浅克隆")
  })
})
