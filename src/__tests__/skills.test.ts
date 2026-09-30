// skills 包内分发：目标解析、安装（软链 / 副本 / 幂等 / 冲突）、现场状态、卸载与链接自愈
// 用例统一把 home 注入独立临时目录，产物只落在临时目录，绝不触碰真实用户全局技能目录
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, normalize } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { CARRIER_VERSION, ENTRY_VERSION } from "../conventions/format"
import {
  AGENT_SKILL_DIRS,
  PROJECT_SOURCE_DIR,
  autoLinkSkills,
  buildSkillShell,
  detectSkillScope,
  findSkillVersionMismatches,
  hasGlobalSkillsInstalled,
  installProjectSkills,
  installSkills,
  listPackageSkills,
  pnpmStableEntry,
  projectSkillsStatus,
  projectStateFile,
  readSkillBodyVersion,
  readSkillDescription,
  readSkillShellVersion,
  readSkillVersion,
  readSkillsState,
  removeProjectSkills,
  removeSkills,
  resetSkillsRootCache,
  resolveSkillTargets,
  setPackageRootForTest,
  skillsLinkDir,
  skillsPackageDir,
  skillsSourceDir,
  skillsStateFile,
  skillsStatus,
  skillTargetLabel,
} from "../skills"

// 软链类型：Windows 必须用 junction（免管理员、免开发者模式）
const LINK_TYPE = process.platform === "win32" ? "junction" : "dir"

// 临时 home（本文件所有用例的注入点）
let home = ""
// 用例前的 CI 环境值：autoLink 在 CI 下跳过，需临时清空避免宿主环境影响断言
let savedCI: string | undefined

// 主目标目录 ~/.agents/skills
function primaryDir(): string {
  return join(home, ".agents", "skills")
}

// 内置快照表里某个 agent 的技能目录（相对 home 展开为绝对路径）
function agentDir(name: string): string {
  const entry = AGENT_SKILL_DIRS.find((a) => a.name === name)
  if (!entry) throw new Error(`内置快照表缺少 agent：${name}`)
  return join(home, entry.dir)
}

// 手工写状态文件：模拟上一次 install 的留痕，供 status / remove / autoLink 用例构造现场
function writeState(targets: Array<{ dir: string; links?: string[]; copies?: string[] }>): void {
  mkdirSync(join(home, ".agents"), { recursive: true })
  const now = new Date().toISOString()
  const data = { version: 1, updatedAt: now, targets: targets.map((t) => ({ dir: t.dir, updatedAt: now, links: t.links ?? [], copies: t.copies ?? [] })) }
  writeFileSync(skillsStateFile(), `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

// 判定 dest 是否为指向 source 的软链（junction 的 readlink 带尾分隔符，需剥掉再比较）
function isLinkTo(dest: string, source: string): boolean {
  if (!lstatSync(dest).isSymbolicLink()) return false
  const target = readlinkSync(dest).replace(/[\\/]+$/, "")
  return target === source.replace(/[\\/]+$/, "")
}

// 取某目标目录下单个技能的现场状态
function stateOf(dir: string, name: string): string | undefined {
  const target = skillsStatus().targets.find((t) => t.dir === dir)
  return target?.items.find((i) => i.name === name)?.state
}

// 取安装报告里某类目标的结果
function targetOf(report: ReturnType<typeof installSkills>, kind: "primary" | "agent" | "custom") {
  const found = report.targets.find((t) => t.kind === kind)
  if (!found) throw new Error(`安装报告缺少目标类型：${kind}`)
  return found
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-skills-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  savedCI = process.env.CI
  delete process.env.CI
})

afterEach(() => {
  if (savedCI === undefined) delete process.env.CI
  else process.env.CI = savedCI
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  rmSync(home, { recursive: true, force: true })
})

describe("包根与技能真源定位", () => {
  it("包根指向本仓库，真源为包内 skills/", () => {
    const root = skillsPackageDir()
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name).toBe("@fxri/toolkit")
    expect(skillsSourceDir()).toBe(join(root, "skills"))
  })

  it("列出包内技能且按名称排序（只认含 SKILL.md 的目录）", () => {
    const names = listPackageSkills().map((s) => s.name)
    expect(names).toContain("fxri-plan-to-task")
    expect(names).toContain("fxri-session-recap")
    expect(names).toContain("fxri-release-changelog")
    expect(names).toEqual([...names].sort())
    for (const skill of listPackageSkills()) {
      expect(existsSync(join(skill.dir, "SKILL.md"))).toBe(true)
    }
  })

  it("每个技能带真源声明版本（frontmatter metadata.version）且为语义化版本", () => {
    const skills = listPackageSkills()
    expect(skills.length).toBeGreaterThan(0)
    for (const skill of skills) {
      // 版本随技能进 `skills install` / `skills status` 报告，供与会话上下文已加载内容比对
      expect(skill.version).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })
})

// 技能表一行的两列内容：版本与用途
interface SkillTableRow {
  version: string
  usage: string
}

// 从技能表格提取「技能名 → { 版本, 用途 }」：兼容 README 的 markdown 链接写法与 guide 的反引号写法
function skillTableRows(file: string): Map<string, SkillTableRow> {
  const map = new Map<string, SkillTableRow>()
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.startsWith("|")) continue
    const cells = line.split("|").map((c) => c.trim())
    const version = cells[2] ?? ""
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue
    const rawName = cells[1] ?? ""
    const linked = rawName.match(/\[([^\]]+)\]\([^)]*\)/)
    map.set((linked ? (linked[1] ?? "") : rawName).replace(/`/g, "").trim(), { version, usage: cells[3] ?? "" })
  }
  return map
}

// 取 SKILL.md frontmatter 块正文（去掉首尾分隔线）：供命名约定用例读顶层 name / description
function skillFrontmatter(dir: string): string {
  const content = readFileSync(join(dir, "SKILL.md"), "utf8").replace(/^\uFEFF/, "")
  const matched = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  return matched ? (matched[1] ?? "") : ""
}

// 读 frontmatter 顶层单行字段（键从列 0 起，排除 metadata 下的缩进键）
function frontmatterField(frontmatter: string, key: string): string {
  const matched = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))
  return matched ? (matched[1] ?? "").trim() : ""
}

// 统计文本行数：末尾换行不额外计行，避免 CRLF/EOF 差异造成行数飘移
function countLines(content: string): number {
  const lines = content.split(/\r?\n/)
  if (lines[lines.length - 1] === "") lines.pop()
  return lines.length
}

// 递归收集技能目录下的 md 文件，返回相对技能根的 posix 路径（SKILL.md 与 references/、assets/ 内的文档一并纳入）
function collectSkillDocs(root: string, rel = "", found: string[] = []): string[] {
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const next = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) collectSkillDocs(root, next, found)
    else if (entry.name.endsWith(".md")) found.push(next)
  }
  return found
}

// 提取文档内反引号包裹的 references / assets 相对引用（含 ../ 跨技能形态）；跳过含占位符的示例路径
function skillFileRefs(content: string): string[] {
  const refs = new Set<string>()
  for (const matched of content.matchAll(/`([^`\s]+)`/g)) {
    const token = matched[1] as string
    if (!/(^|\/)(references|assets)\//.test(token)) continue
    if (/[{}*<>]/.test(token)) continue
    refs.add(token)
  }
  return [...refs]
}

// 解析技能文档中的引用路径：同技能内 references/ 相对文档目录，`<技能>/references/…` 形态相对 skills 根
function resolveSkillRef(skillDir: string, doc: string, ref: string): string | null {
  const candidates = [normalize(join(skillDir, doc, "..", ref)), normalize(join(skillsSourceDir(), ref))]
  return candidates.find((p) => existsSync(p)) ?? null
}

describe("技能作者侧核对清单项门禁", () => {
  it("两张技能版本表与 SKILL.md 真源版本一致（skills/README.md、docs/guide.md）", () => {
    const truth = new Map(listPackageSkills().map((s) => [s.name, s.version]))
    expect(truth.size).toBeGreaterThan(0)
    for (const file of ["skills/README.md", "docs/guide.md"]) {
      const table = skillTableRows(file)
      // 行数守卫：整表被删或改名时逐项比对本会失去意义，须先卡住规模
      expect(table.size, `${file} 技能表行数与包内技能数不一致`).toBe(truth.size)
      for (const [name, version] of truth) {
        expect(table.get(name)?.version, `${file} 缺失或错记技能 ${name} 的版本`).toBe(version)
      }
    }
  })

  it("每个技能 frontmatter 命名合规：name 与目录名一致且 kebab-case ≤64、description ≤1024", () => {
    const skills = listPackageSkills()
    expect(skills.length).toBeGreaterThan(0)
    for (const skill of skills) {
      const frontmatter = skillFrontmatter(skill.dir)
      const name = frontmatterField(frontmatter, "name")
      expect(name, `${skill.name} 的 frontmatter name 与目录名不一致`).toBe(skill.name)
      expect(name, `${skill.name} 的 name 非 kebab-case`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(name.length, `${skill.name} 的 name 超过 64 字符`).toBeLessThanOrEqual(64)
      const description = frontmatterField(frontmatter, "description")
      expect(description.length, `${skill.name} 的 description 为空`).toBeGreaterThan(0)
      expect(description.length, `${skill.name} 的 description 超过 1024 字符`).toBeLessThanOrEqual(1024)
    }
  })

  it("每份主干 SKILL.md 行数小于 200（细节应下沉 references/）", () => {
    for (const skill of listPackageSkills()) {
      const lines = countLines(readFileSync(join(skill.dir, "SKILL.md"), "utf8"))
      expect(lines, `${skill.name} 的 SKILL.md 达 ${lines} 行，超过 200 行上限`).toBeLessThan(200)
    }
  })

  it("技能文档引用的 references / assets 相对路径均指向真实文件", () => {
    for (const skill of listPackageSkills()) {
      for (const doc of collectSkillDocs(skill.dir)) {
        for (const ref of skillFileRefs(readFileSync(join(skill.dir, doc), "utf8"))) {
          expect(resolveSkillRef(skill.dir, doc, ref), `${skill.name}/${doc} 引用的 ${ref} 不存在`).not.toBeNull()
        }
      }
    }
  })

  it("两张技能表的用途列逐字一致（skills/README.md ↔ docs/guide.md）", () => {
    const readme = skillTableRows("skills/README.md")
    const guide = skillTableRows("docs/guide.md")
    expect(readme.size).toBeGreaterThan(0)
    // 行数守卫：整表被删或改名时逐项比对本会失去意义，须先卡住规模
    expect(guide.size, "docs/guide.md 技能表行数与 skills/README.md 不一致").toBe(readme.size)
    for (const [name, row] of readme) {
      expect(guide.get(name)?.usage, `docs/guide.md 中 ${name} 的用途描述与 skills/README.md 不一致`).toBe(row.usage)
    }
  })

  it("技能文档中的规范载体 / 入口壳标记版本与代码常量一致", () => {
    // 两类标记的命中数：全部消失时逐项比对本会沦为无断言，须先卡住存在性
    let carrierHits = 0
    let entryHits = 0
    for (const skill of listPackageSkills()) {
      for (const doc of collectSkillDocs(skill.dir)) {
        const content = readFileSync(join(skill.dir, doc), "utf8")
        for (const matched of content.matchAll(/<!--\s*toolkit-conventions:\s*v(\d+)\s*-->/g)) {
          carrierHits += 1
          expect(Number(matched[1]), `${skill.name}/${doc} 的载体标记版本与 CARRIER_VERSION 不一致`).toBe(CARRIER_VERSION)
        }
        for (const matched of content.matchAll(/<!--\s*toolkit-conventions-entry:\s*v(\d+)\s*-->/g)) {
          entryHits += 1
          expect(Number(matched[1]), `${skill.name}/${doc} 的入口壳标记版本与 ENTRY_VERSION 不一致`).toBe(ENTRY_VERSION)
        }
      }
    }
    expect(carrierHits, "技能文档中未见任何规范载体标记，同源校验已失效").toBeGreaterThan(0)
    expect(entryHits, "技能文档中未见任何入口壳标记，同源校验已失效").toBeGreaterThan(0)
  })
})

describe("pnpmStableEntry 稳定入口解析", () => {
  it("项目内布局（.pnpm 位于 node_modules 下）推出不含版本段的入口目录", () => {
    const pkgRoot = join(home, "node_modules", ".pnpm", "@fxri+toolkit@1.10.3", "node_modules", "@fxri", "toolkit")
    mkdirSync(pkgRoot, { recursive: true })
    expect(pnpmStableEntry(pkgRoot)).toBe(join(home, "node_modules", "@fxri", "toolkit"))
  })

  it("全局布局（.pnpm 与 node_modules 并列）推出不含版本段的入口目录", () => {
    // 全局安装下 .pnpm 所在层是 <pnpm 全局>/<global 段>（目录名不是 node_modules），入口在其 node_modules 下
    const moduleDir = join(home, "pnpm", "global", "5")
    const pkgRoot = join(moduleDir, ".pnpm", "@fxri+toolkit@1.10.4", "node_modules", "@fxri", "toolkit")
    mkdirSync(pkgRoot, { recursive: true })
    expect(pnpmStableEntry(pkgRoot)).toBe(join(moduleDir, "node_modules", "@fxri", "toolkit"))
  })

  it("非 pnpm 布局（包实体即真实目录）返回空串", () => {
    const pkgRoot = join(home, "node_modules", "@fxri", "toolkit")
    mkdirSync(pkgRoot, { recursive: true })
    expect(pnpmStableEntry(pkgRoot)).toBe("")
  })

  it("本仓库根不在 node_modules/.pnpm 之下，锚点回落真源（两者等价）", () => {
    const pkgRoot = skillsPackageDir()
    expect(pnpmStableEntry(pkgRoot)).toBe("")
    expect(skillsLinkDir()).toBe(skillsSourceDir())
  })
})

describe("链接锚点跨版本存活", () => {
  // 假技能名：与包内真实技能不重名，避免与真实真源混淆
  const FAKE_SKILL = "fxri-fake-skill"

  // pnpm 两种布局：moduleDir 为 .pnpm 所在层，entryDir 为稳定入口所在层
  // 项目内布局两者重合（.pnpm 就在 node_modules 下）；全局布局 .pnpm 在 <pnpm 全局>/<global 段>，入口在其 node_modules 下
  function globalLayout(): { moduleDir: string; entryDir: string } {
    const moduleDir = join(home, "pnpm", "global", "5")
    return { moduleDir, entryDir: join(moduleDir, "node_modules") }
  }

  function projectLayout(): { moduleDir: string; entryDir: string } {
    const moduleDir = join(home, "node_modules")
    return { moduleDir, entryDir: moduleDir }
  }

  // 在临时目录造一个 pnpm 布局的假包实体：<moduleDir>/.pnpm/<包目录>/node_modules/@fxri/toolkit/skills/<技能>/，返回其包根
  function layout(moduleDir: string, version: string): string {
    const pkgRoot = join(moduleDir, ".pnpm", `@fxri+toolkit@${version}`, "node_modules", "@fxri", "toolkit")
    const skillDir = join(pkgRoot, "skills", FAKE_SKILL)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, "SKILL.md"), `---\nname: ${FAKE_SKILL}\nmetadata:\n  version: ${version}\n---\n\n# ${FAKE_SKILL} ${version}\n`, "utf8")
    return pkgRoot
  }

  // 把稳定入口重指到指定包实体（先摘旧链，模拟 pnpm 升级时对入口的改写）
  function pointEntry(entryDir: string, pkgRoot: string): void {
    const entry = join(entryDir, "@fxri", "toolkit")
    rmSync(entry, { recursive: true, force: true })
    mkdirSync(join(entryDir, "@fxri"), { recursive: true })
    symlinkSync(pkgRoot, entry, LINK_TYPE)
  }

  // 跑一遍「安装 → pnpm 升级换版本段 → 仅查询现场」全流程
  function runUpgrade(l: { moduleDir: string; entryDir: string }): void {
    const entry = join(l.entryDir, "@fxri", "toolkit")
    const v1Root = layout(l.moduleDir, "9.9.9")
    pointEntry(l.entryDir, v1Root)
    setPackageRootForTest(v1Root)

    // 安装：链接锚在稳定入口而非含版本段的包实体路径——后者会随 pnpm 剪除旧目录而失效
    installSkills()
    const dest = join(primaryDir(), FAKE_SKILL)
    expect(isLinkTo(dest, join(entry, "skills", FAKE_SKILL))).toBe(true)
    expect(readlinkSync(dest)).not.toContain("@fxri+toolkit@")
    expect(stateOf(primaryDir(), FAKE_SKILL)).toBe("link")

    // 模拟 pnpm 升级：新版本段落盘 → 稳定入口重指新版本 → 旧版本段被剪除
    const v2Root = layout(l.moduleDir, "10.0.0")
    pointEntry(l.entryDir, v2Root)
    rmSync(join(l.moduleDir, ".pnpm", "@fxri+toolkit@9.9.9"), { recursive: true, force: true })
    setPackageRootForTest(v2Root)

    expect(skillsLinkDir()).toBe(join(entry, "skills"))
    expect(stateOf(primaryDir(), FAKE_SKILL)).toBe("link")
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("10.0.0")
  }

  it("全局布局（.pnpm 与 node_modules 并列）：升级换版本段后链接不悬空，仅查询现场即报正常", () => {
    // 全局安装是本工具主用法，且此处 .pnpm 所在层目录名不是 node_modules，是稳定入口解析的易漏形态
    runUpgrade(globalLayout())
  })

  it("项目内布局（.pnpm 位于 node_modules 下）：升级换版本段后链接不悬空，仅查询现场即报正常", () => {
    runUpgrade(projectLayout())
  })

  it("存量旧指向（直指包实体）内容一致时不误报，也不破坏性重指", () => {
    const l = globalLayout()
    const pkgRoot = layout(l.moduleDir, "9.9.9")
    pointEntry(l.entryDir, pkgRoot)
    setPackageRootForTest(pkgRoot)
    // 造锚点改造前的现场：链接直指包实体路径，且已登记在本包状态文件
    mkdirSync(primaryDir(), { recursive: true })
    symlinkSync(join(pkgRoot, "skills", FAKE_SKILL), join(primaryDir(), FAKE_SKILL), LINK_TYPE)
    writeState([{ dir: primaryDir(), links: [FAKE_SKILL] }])
    // 内容与真源逐字一致即视为健康：既不误报，也不被自愈重指到当前运行源
    expect(stateOf(primaryDir(), FAKE_SKILL)).toBe("link")
    expect(autoLinkSkills()).toBe(0)
    expect(isLinkTo(join(primaryDir(), FAKE_SKILL), join(pkgRoot, "skills", FAKE_SKILL))).toBe(true)
  })

  it("异地软链内容不一致时仍判异常，由自愈重指回稳定入口", () => {
    const l = globalLayout()
    const pkgRoot = layout(l.moduleDir, "9.9.9")
    pointEntry(l.entryDir, pkgRoot)
    setPackageRootForTest(pkgRoot)
    // 另一处安装的同名技能（内容为旧版本）：路径不同且内容不一致，应判异常而非放行
    const other = join(home, "other-install", FAKE_SKILL)
    mkdirSync(other, { recursive: true })
    writeFileSync(join(other, "SKILL.md"), `---\nname: ${FAKE_SKILL}\nmetadata:\n  version: 0.0.1\n---\n\n# ${FAKE_SKILL} 0.0.1\n`, "utf8")
    mkdirSync(primaryDir(), { recursive: true })
    symlinkSync(other, join(primaryDir(), FAKE_SKILL), LINK_TYPE)
    writeState([{ dir: primaryDir(), links: [FAKE_SKILL] }])
    expect(stateOf(primaryDir(), FAKE_SKILL)).toBe("wrong")
    expect(autoLinkSkills()).toBe(1)
    expect(isLinkTo(join(primaryDir(), FAKE_SKILL), join(l.entryDir, "@fxri", "toolkit", "skills", FAKE_SKILL))).toBe(true)
  })
})

describe("readSkillVersion 版本解析", () => {
  // 造一个只含 SKILL.md 的技能目录，返回其路径
  function skillDir(name: string, content: string): string {
    const dir = join(home, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), content, "utf8")
    return dir
  }

  it("取 frontmatter metadata.version（带或不带引号均可）", () => {
    expect(readSkillVersion(skillDir("quoted", '---\nname: quoted\nmetadata:\n  version: "1.2.3"\n  author: fxri\n---\n\n# quoted\n'))).toBe("1.2.3")
    expect(readSkillVersion(skillDir("plain", "---\nname: plain\nmetadata:\n  version: 2.0.0\n---\n"))).toBe("2.0.0")
  })

  it("容忍 UTF-8 BOM", () => {
    expect(readSkillVersion(skillDir("bom", "\uFEFF---\nname: bom\nmetadata:\n  version: 3.1.4\n---\n"))).toBe("3.1.4")
  })

  it("无 frontmatter / 未声明 metadata.version / 文件缺失时返回空串，不抛错", () => {
    expect(readSkillVersion(skillDir("no-fm", "# 无 frontmatter\n"))).toBe("")
    expect(readSkillVersion(skillDir("no-version", "---\nname: no-version\nmetadata:\n  author: fxri\n---\n"))).toBe("")
    expect(readSkillVersion(join(home, "not-exists"))).toBe("")
  })
})

describe("readSkillBodyVersion / findSkillVersionMismatches 版本双写位", () => {
  // 造一个只含 SKILL.md 的技能目录，返回其路径
  function bodySkillDir(name: string, content: string): string {
    const dir = join(home, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), content, "utf8")
    return dir
  }

  it("读取正文首部「> 本技能版本 x.y.z」声明值", () => {
    const dir = bodySkillDir("body-ok", "# 技能\n\n> 本技能版本 1.2.3（随 @fxri/toolkit 同批分发）。内容变更时同步递增。\n")
    expect(readSkillBodyVersion(dir)).toBe("1.2.3")
  })

  it("容忍 UTF-8 BOM，未声明 / 文件缺失时返回空串，不抛错", () => {
    expect(readSkillBodyVersion(bodySkillDir("body-bom", "\uFEFF# 技能\n\n> 本技能版本 3.1.4（随包分发）\n"))).toBe("3.1.4")
    expect(readSkillBodyVersion(bodySkillDir("body-none", "# 技能\n\n无版本声明\n"))).toBe("")
    expect(readSkillBodyVersion(join(home, "not-exists"))).toBe("")
  })

  it("双写位一致时不出项，不一致（含正文漏写）时报出比对值", () => {
    const ok = bodySkillDir("mm-ok", '---\nname: mm-ok\nmetadata:\n  version: "1.0.0"\n---\n\n> 本技能版本 1.0.0（随包分发）\n')
    const diff = bodySkillDir("mm-diff", '---\nname: mm-diff\nmetadata:\n  version: "1.0.1"\n---\n\n> 本技能版本 1.0.0（随包分发）\n')
    const missing = bodySkillDir("mm-missing", '---\nname: mm-missing\nmetadata:\n  version: "2.0.0"\n---\n\n无版本声明\n')
    const mismatches = findSkillVersionMismatches([
      { name: "mm-ok", dir: ok, version: "1.0.0" },
      { name: "mm-diff", dir: diff, version: "1.0.1" },
      { name: "mm-missing", dir: missing, version: "2.0.0" },
    ])
    expect(mismatches).toEqual([
      { name: "mm-diff", frontmatter: "1.0.1", body: "1.0.0" },
      { name: "mm-missing", frontmatter: "2.0.0", body: "" },
    ])
  })

  it("未声明 frontmatter 版本（第三方技能）跳过比对，不误报", () => {
    const dir = bodySkillDir("mm-third", "# 第三方技能\n\n无版本声明\n")
    expect(findSkillVersionMismatches([{ name: "mm-third", dir, version: "" }])).toEqual([])
  })

  it("包内全部技能双写位一致（仓库现场无漂移）", () => {
    expect(findSkillVersionMismatches(listPackageSkills())).toEqual([])
  })
})

describe("resolveSkillTargets 三层目标解析", () => {
  it("主目标恒可用且排在最前，与表内同路径 agent 去重", () => {
    const targets = resolveSkillTargets()
    expect(targets[0]!.kind).toBe("primary")
    expect(targets[0]!.dir).toBe(primaryDir())
    expect(targets[0]!.available).toBe(true)
    expect(targets.filter((t) => t.dir === primaryDir())).toHaveLength(1)
    expect(new Set(targets.map((t) => t.dir)).size).toBe(targets.length)
  })

  it("agent 未安装时不可用（不凭空造目录）", () => {
    expect(resolveSkillTargets().find((t) => t.dir === agentDir("claude-code"))?.available).toBe(false)
  })

  it("agent 配置目录存在即视为已安装", () => {
    mkdirSync(join(home, ".claude"), { recursive: true })
    expect(resolveSkillTargets().find((t) => t.dir === agentDir("claude-code"))?.available).toBe(true)
  })

  it("detect 路径命中即视为已安装（如 .codex）", () => {
    mkdirSync(join(home, ".codex"), { recursive: true })
    expect(resolveSkillTargets().find((t) => t.dir === agentDir("codex"))?.available).toBe(true)
  })

  it("--dir 作为 custom 目标恒可用并排在末尾，与内置路径重复时去重", () => {
    const extra = join(home, "extra-skills")
    const targets = resolveSkillTargets([extra, primaryDir()])
    expect(targets[targets.length - 1]!.dir).toBe(extra)
    expect(targets[targets.length - 1]!.kind).toBe("custom")
    expect(targets[targets.length - 1]!.available).toBe(true)
    expect(targets.filter((t) => t.kind === "custom")).toHaveLength(1)
  })
})

describe("installSkills 安装", () => {
  it("--dry-run 只预演：报告将新建，但不落任何文件", () => {
    const report = installSkills({ dryRun: true })
    const primary = targetOf(report, "primary")
    expect(primary.created).toEqual(report.skills)
    expect(primary.links).toEqual(report.skills)
    expect(existsSync(primaryDir())).toBe(false)
    expect(existsSync(skillsStateFile())).toBe(false)
  })

  it("默认软链到真源并写入状态文件", () => {
    const report = installSkills()
    const primary = targetOf(report, "primary")
    expect(primary.created).toEqual(report.skills)
    for (const name of report.skills) {
      expect(isLinkTo(join(primaryDir(), name), join(skillsSourceDir(), name))).toBe(true)
    }
    const state = readSkillsState()
    expect(state?.targets[0]!.dir).toBe(primaryDir())
    expect(state?.targets[0]!.links).toEqual(report.skills)
    expect(state?.targets[0]!.copies).toEqual([])
  })

  it("重复安装幂等：已就绪的链接整体跳过", () => {
    installSkills()
    const second = installSkills()
    const primary = targetOf(second, "primary")
    expect(primary.skipped).toEqual(second.skills)
    expect(primary.created).toHaveLength(0)
    expect(primary.updated).toHaveLength(0)
  })

  it("--copy 写副本，重复安装内容一致时跳过", () => {
    const report = installSkills({ copy: true })
    const primary = targetOf(report, "primary")
    expect(primary.copies).toEqual(report.skills)
    expect(lstatSync(join(primaryDir(), report.skills[0]!)).isSymbolicLink()).toBe(false)
    const second = installSkills({ copy: true })
    expect(targetOf(second, "primary").skipped).toEqual(second.skills)
  })

  it("副本内容漂移后重跑安装会重建为真源内容，预演只记更新不落盘", () => {
    const report = installSkills({ copy: true })
    const name = report.skills[0]!
    const dest = join(primaryDir(), name, "SKILL.md")
    writeFileSync(dest, "drifted", "utf8")
    const preview = installSkills({ copy: true, dryRun: true })
    expect(targetOf(preview, "primary").updated).toContain(name)
    expect(readFileSync(dest, "utf8")).toBe("drifted")
    const again = installSkills({ copy: true })
    expect(targetOf(again, "primary").updated).toContain(name)
    expect(readFileSync(dest, "utf8")).toBe(readFileSync(join(skillsSourceDir(), name, "SKILL.md"), "utf8"))
  })

  it("同名普通文件视为冲突默认跳过，status 报冲突", () => {
    const name = listPackageSkills()[0]!.name
    mkdirSync(primaryDir(), { recursive: true })
    writeFileSync(join(primaryDir(), name), "not a skill", "utf8")
    expect(targetOf(installSkills(), "primary").conflicts).toContain(name)
    expect(readFileSync(join(primaryDir(), name), "utf8")).toBe("not a skill")
    expect(stateOf(primaryDir(), name)).toBe("conflict")
  })

  it("同名用户自装目录默认不覆盖，--force 才重建", () => {
    const name = listPackageSkills()[0]!.name
    const dest = join(primaryDir(), name)
    mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, "SKILL.md"), "user made", "utf8")
    expect(targetOf(installSkills(), "primary").conflicts).toContain(name)
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe("user made")
    const forced = installSkills({ force: true })
    expect(targetOf(forced, "primary").updated).toContain(name)
    expect(isLinkTo(dest, join(skillsSourceDir(), name))).toBe(true)
  })

  it("指向别处的链接在 status 报错并在下次安装重建", () => {
    const name = listPackageSkills()[0]!.name
    mkdirSync(primaryDir(), { recursive: true })
    const other = join(home, "other")
    mkdirSync(other, { recursive: true })
    symlinkSync(other, join(primaryDir(), name), LINK_TYPE)
    expect(stateOf(primaryDir(), name)).toBe("wrong")
    expect(targetOf(installSkills(), "primary").updated).toContain(name)
    expect(isLinkTo(join(primaryDir(), name), join(skillsSourceDir(), name))).toBe(true)
  })

  it("悬空链接在 status 报悬空并在下次安装重建", () => {
    const ghost = "fxri-ghost"
    mkdirSync(primaryDir(), { recursive: true })
    // 真源缺失的链接：指向包内不存在的技能目录，且由状态文件记载使其纳入比对
    symlinkSync(join(skillsSourceDir(), ghost), join(primaryDir(), ghost), LINK_TYPE)
    writeState([{ dir: primaryDir(), links: [ghost] }])
    expect(stateOf(primaryDir(), ghost)).toBe("dangling")
    const report = installSkills()
    expect(report.skills).not.toContain(ghost)
  })

  it("agent 配置目录存在时其技能目录一并安装，未安装的 agent 只报告不造目录", () => {
    mkdirSync(join(home, ".claude"), { recursive: true })
    const report = installSkills()
    const claude = report.targets.find((t) => t.dir === agentDir("claude-code"))
    expect(claude?.created).toEqual(report.skills)
    expect(existsSync(join(agentDir("claude-code"), report.skills[0]!, "SKILL.md"))).toBe(true)
    expect(report.skippedTargets.some((t) => t.dir === agentDir("codex"))).toBe(true)
    expect(existsSync(join(home, ".codex"))).toBe(false)
  })

  it("--dir 兜底安装到未收录的目录，且后续安装不丢历史记录", () => {
    const extra = join(home, "custom-skills")
    const report = installSkills({ dirs: [extra] })
    expect(targetOf(report, "custom").created).toEqual(report.skills)
    expect(existsSync(join(extra, report.skills[0]!, "SKILL.md"))).toBe(true)
    installSkills()
    expect(readSkillsState()?.targets.some((t) => t.dir === extra)).toBe(true)
    removeSkills()
    expect(existsSync(join(extra, report.skills[0]!))).toBe(false)
  })
})

describe("hasGlobalSkillsInstalled 安装态探测", () => {
  it("无状态文件或状态文件损坏时视为未安装", () => {
    expect(hasGlobalSkillsInstalled()).toBe(false)
    mkdirSync(join(home, ".agents"), { recursive: true })
    writeFileSync(skillsStateFile(), "{ 非法 json", "utf8")
    expect(hasGlobalSkillsInstalled()).toBe(false)
  })

  it("已登记目标但链接与副本均为空时仍视为未安装", () => {
    writeState([{ dir: primaryDir() }])
    expect(hasGlobalSkillsInstalled()).toBe(false)
  })

  it("任一目标登记了链接或副本即为已安装", () => {
    writeState([{ dir: primaryDir(), links: ["fxri-plan-to-task"] }])
    expect(hasGlobalSkillsInstalled()).toBe(true)
    writeState([{ dir: primaryDir(), copies: ["fxri-plan-to-task"] }])
    expect(hasGlobalSkillsInstalled()).toBe(true)
  })
})

describe("skillsStatus 现场状态", () => {
  it("尚未安装时主目标标为未创建、逐项缺失", () => {
    const status = skillsStatus()
    const primary = status.targets.find((t) => t.kind === "primary")
    expect(primary?.dirExists).toBe(false)
    expect(primary?.recorded).toBe(false)
    expect(primary?.items.every((i) => i.state === "missing")).toBe(true)
    expect(status.stateExists).toBe(false)
  })

  it("安装后逐项报软链正常，副本形态报副本已同步", () => {
    installSkills()
    expect(skillsStatus().targets.find((t) => t.kind === "primary")?.items.every((i) => i.state === "link")).toBe(true)
    rmSync(primaryDir(), { recursive: true, force: true })
    installSkills({ copy: true })
    expect(skillsStatus().targets.find((t) => t.kind === "primary")?.items.every((i) => i.state === "copy")).toBe(true)
  })

  it("副本被改动报漂移，产物被删除报缺失", () => {
    const report = installSkills({ copy: true })
    const drifted = report.skills[0]!
    const gone = report.skills[1]!
    writeFileSync(join(primaryDir(), drifted, "SKILL.md"), "changed", "utf8")
    rmSync(join(primaryDir(), gone), { recursive: true, force: true })
    expect(stateOf(primaryDir(), drifted)).toBe("copy-drift")
    expect(stateOf(primaryDir(), gone)).toBe("missing")
  })

  it("未登记的同名目录报同名冲突（裸 install 跳过、--force 才覆盖），登记为本包副本的漂移才报副本漂移", () => {
    const name = listPackageSkills()[0]!.name
    const dest = join(primaryDir(), name)
    mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, "SKILL.md"), "foreign", "utf8")
    // 未登记来源：报同名冲突，裸 install 按冲突跳过，--force 才重建
    expect(stateOf(primaryDir(), name)).toBe("conflict")
    expect(targetOf(installSkills(), "primary").conflicts).toContain(name)
    expect(targetOf(installSkills({ force: true }), "primary").updated).toContain(name)
    // 同一现场登记为本包副本后，内容不一致才归为副本漂移
    writeState([{ dir: primaryDir(), copies: [name] }])
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, "SKILL.md"), "changed", "utf8")
    expect(stateOf(primaryDir(), name)).toBe("copy-drift")
  })

  it("未安装的 agent 汇总进 pendingAgents，供 --dir 兜底提示", () => {
    const status = skillsStatus()
    expect(status.pendingAgents.some((a) => a.dir === agentDir("claude-code"))).toBe(true)
    expect(status.targets.some((t) => t.dir === agentDir("claude-code"))).toBe(false)
  })

  it("状态文件损坏时按未安装处理，不影响技能比对", () => {
    mkdirSync(join(home, ".agents"), { recursive: true })
    writeFileSync(skillsStateFile(), "{ 非法 json", "utf8")
    expect(readSkillsState()).toBeNull()
    const status = skillsStatus()
    expect(status.stateExists).toBe(false)
    expect(status.targets.find((t) => t.kind === "primary")?.items.every((i) => i.state === "missing")).toBe(true)
    writeFileSync(skillsStateFile(), JSON.stringify({ version: 1, updatedAt: "", targets: "broken" }), "utf8")
    expect(readSkillsState()).toBeNull()
  })

  it("现场报告 JSON 可序列化且字段齐备（--format json 契约）", () => {
    const name = listPackageSkills()[0]!.name
    mkdirSync(join(primaryDir(), name), { recursive: true })
    writeFileSync(join(primaryDir(), name, "SKILL.md"), "foreign", "utf8")
    const payload = JSON.parse(JSON.stringify(skillsStatus())) as {
      source: string
      stateFile: string
      skills: string[]
      skillVersions: Record<string, string>
      pendingAgents: Array<{ dir: string }>
      targets: Array<{ kind: string; dir: string; items: Array<{ name: string; state: string; version: string }> }>
    }
    expect(payload.skills).toHaveLength(listPackageSkills().length)
    expect(payload.source).toBe(skillsSourceDir())
    expect(payload.stateFile).toBe(skillsStateFile())
    // 磁盘基准值：与会话上下文里技能正文声明的版本比对，判断上下文是否已过期
    expect(payload.skillVersions).toEqual(Object.fromEntries(listPackageSkills().map((s) => [s.name, s.version])))
    expect(payload.skillVersions[name]).toMatch(/^\d+\.\d+\.\d+$/)
    const primary = payload.targets.find((t) => t.kind === "primary")
    expect(primary?.items.find((i) => i.name === name)?.state).toBe("conflict")
    expect(primary?.items.find((i) => i.name === name)?.version).toBe(payload.skillVersions[name])
  })
})

describe("skillTargetLabel 反查显示名", () => {
  it("canonical 优先、agent 目录命中快照表、表外目标返回 null", () => {
    // 期望值取自真实解析结果，避免测试内复刻一份标签表
    expect(skillTargetLabel(primaryDir())).toBe(resolveSkillTargets()[0]!.label)
    const codex = AGENT_SKILL_DIRS.find((a) => a.name === "codex")
    if (!codex) throw new Error("内置快照表缺少 agent：codex")
    expect(skillTargetLabel(agentDir("codex"))).toBe(codex.label)
    expect(skillTargetLabel(join(home, "custom-skills"))).toBeNull()
  })
})

describe("removeSkills 精确清理", () => {
  it("无状态文件时为空操作", () => {
    const report = removeSkills()
    expect(report.stateExists).toBe(false)
    expect(report.targets).toHaveLength(0)
    expect(report.stateRemoved).toBe(false)
  })

  it("报告目标带显示名，与 install / status 同口径；表外目标回落为 null", () => {
    writeState([
      { dir: primaryDir(), copies: [] },
      { dir: join(home, "custom-skills"), copies: [] },
    ])
    const report = removeSkills({ dryRun: true })
    expect(report.targets[0]!.label).toBe(resolveSkillTargets()[0]!.label)
    expect(report.targets[1]!.label).toBeNull()
  })

  it("预演只报告不删除，正式卸载清空产物并删除状态文件", () => {
    const installed = installSkills({ copy: true })
    const preview = removeSkills({ dryRun: true })
    expect(preview.targets[0]!.removed).toEqual(installed.skills)
    expect(existsSync(join(primaryDir(), installed.skills[0]!, "SKILL.md"))).toBe(true)
    expect(existsSync(skillsStateFile())).toBe(true)
    const done = removeSkills()
    expect(done.stateRemoved).toBe(true)
    expect(existsSync(skillsStateFile())).toBe(false)
    expect(existsSync(join(primaryDir(), installed.skills[0]!))).toBe(false)
  })

  it("软链产物只摘链，不触碰包内真源", () => {
    const installed = installSkills()
    const name = installed.skills[0]!
    expect(lstatSync(join(primaryDir(), name)).isSymbolicLink()).toBe(true)
    removeSkills()
    expect(existsSync(join(skillsSourceDir(), name, "SKILL.md"))).toBe(true)
  })

  it("现场被改动（指向别处 / 内容漂移 / 变成普通文件）时跳过并保留状态文件", () => {
    const installed = installSkills({ copy: true })
    const wrongName = installed.skills[0]!
    const driftName = installed.skills[1]!
    const fileLike = installed.skills[2]!
    rmSync(join(primaryDir(), wrongName), { recursive: true, force: true })
    const other = join(home, "other")
    mkdirSync(other, { recursive: true })
    symlinkSync(other, join(primaryDir(), wrongName), LINK_TYPE)
    writeFileSync(join(primaryDir(), driftName, "SKILL.md"), "drifted", "utf8")
    rmSync(join(primaryDir(), fileLike), { recursive: true, force: true })
    writeFileSync(join(primaryDir(), fileLike), "plain file", "utf8")
    const report = removeSkills()
    expect(report.targets[0]!.skippedForeign.sort()).toEqual([wrongName, driftName, fileLike].sort())
    expect(report.stateRemoved).toBe(false)
    expect(existsSync(skillsStateFile())).toBe(true)
    expect(existsSync(join(primaryDir(), driftName))).toBe(true)
  })

  it("产物已被手动删除时计入缺失，仍按清理结果处理状态文件", () => {
    const installed = installSkills({ copy: true })
    const name = installed.skills[0]!
    rmSync(join(primaryDir(), name), { recursive: true, force: true })
    const report = removeSkills()
    expect(report.targets[0]!.missing).toContain(name)
    expect(report.stateRemoved).toBe(true)
  })
})

describe("autoLinkSkills 链接自愈", () => {
  it("无状态文件时不做任何事", () => {
    expect(autoLinkSkills()).toBe(0)
  })

  it("链接已正常时计数为 0", () => {
    installSkills()
    expect(autoLinkSkills()).toBe(0)
  })

  it("补建被删除的链接并重建指向错误的链接", () => {
    const installed = installSkills()
    const gone = installed.skills[0]!
    const wrongName = installed.skills[1]!
    rmSync(join(primaryDir(), gone), { recursive: true, force: true })
    rmSync(join(primaryDir(), wrongName), { recursive: true, force: true })
    const other = join(home, "other")
    mkdirSync(other, { recursive: true })
    symlinkSync(other, join(primaryDir(), wrongName), LINK_TYPE)
    expect(autoLinkSkills()).toBe(2)
    expect(isLinkTo(join(primaryDir(), gone), join(skillsSourceDir(), gone))).toBe(true)
    expect(isLinkTo(join(primaryDir(), wrongName), join(skillsSourceDir(), wrongName))).toBe(true)
  })

  it("重建时顺带剔除已不在包内的技能记录", () => {
    mkdirSync(primaryDir(), { recursive: true })
    writeState([{ dir: primaryDir(), links: ["fxri-not-exists", "fxri-plan-to-task"] }])
    expect(autoLinkSkills()).toBe(1)
    expect(readSkillsState()?.targets[0]!.links).toEqual(["fxri-plan-to-task"])
  })

  it("状态记录的目标目录已不存在时原样保留记录", () => {
    const ghostDir = join(home, "ghost-target")
    writeState([{ dir: ghostDir, links: ["fxri-plan-to-task"] }])
    expect(autoLinkSkills()).toBe(0)
    expect(readSkillsState()?.targets[0]!.dir).toBe(ghostDir)
  })

  it("配置 skills.autoLink=false 时关闭自愈", () => {
    mkdirSync(primaryDir(), { recursive: true })
    writeState([{ dir: primaryDir(), links: ["fxri-plan-to-task"] }])
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ skills: { autoLink: false } }), "utf8")
    resetToolkitConfigCache()
    expect(autoLinkSkills()).toBe(0)
    expect(existsSync(join(primaryDir(), "fxri-plan-to-task"))).toBe(false)
  })

  it("CI 环境下跳过自愈", () => {
    mkdirSync(primaryDir(), { recursive: true })
    writeState([{ dir: primaryDir(), links: ["fxri-plan-to-task"] }])
    process.env.CI = "1"
    expect(autoLinkSkills()).toBe(0)
    expect(existsSync(join(primaryDir(), "fxri-plan-to-task"))).toBe(false)
  })

  it("自愈只返回计数，不向 stdout 写任何内容（提示由调用方走 stderr）", () => {
    const out: string[] = []
    const log = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => out.push(a.join(" ")))
    const err = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => out.push(a.join(" ")))
    try {
      mkdirSync(primaryDir(), { recursive: true })
      writeState([{ dir: primaryDir(), links: ["fxri-plan-to-task"] }])
      expect(autoLinkSkills()).toBe(1)
      // 修链提示在 CLI 层输出，函数本身必须静默，避免混入 --format json 的 stdout
      expect(out).toHaveLength(0)
    } finally {
      log.mockRestore()
      err.mockRestore()
    }
  })
})

describe("autoLinkSkills 实体产物开关", () => {
  // 关闭替换：写入 skills.autoLinkReplaceForeign=false 并清缓存使配置立即生效
  function disableReplaceForeign(): void {
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ skills: { autoLinkReplaceForeign: false } }), "utf8")
    resetToolkitConfigCache()
  }

  // 把某技能的链接换成同名的实体目录（模拟用户自装技能占用同名路径）
  function replaceWithDir(name: string, content = "user made"): string {
    const dest = join(primaryDir(), name)
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    writeFileSync(join(dest, "SKILL.md"), content, "utf8")
    return dest
  }

  it("开关关闭时实体目录一律不动，记录照留", () => {
    const installed = installSkills()
    const dest = replaceWithDir(installed.skills[0]!, "user dir")
    disableReplaceForeign()
    expect(autoLinkSkills()).toBe(0)
    expect(lstatSync(dest).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe("user dir")
    expect(readSkillsState()?.targets[0]!.links).toContain(installed.skills[0])
  })

  it("开关关闭时普通文件一律不动", () => {
    const installed = installSkills()
    const dest = join(primaryDir(), installed.skills[0]!)
    rmSync(dest, { recursive: true, force: true })
    writeFileSync(dest, "plain file", "utf8")
    disableReplaceForeign()
    expect(autoLinkSkills()).toBe(0)
    expect(lstatSync(dest).isSymbolicLink()).toBe(false)
    expect(readFileSync(dest, "utf8")).toBe("plain file")
    expect(readSkillsState()?.targets[0]!.links).toContain(installed.skills[0])
  })

  it("开关关闭只豁免实体产物：悬空与指向错误仍重建，实体记录随写盘保留", () => {
    const installed = installSkills()
    const dirName = installed.skills[0]!
    const goneName = installed.skills[1]!
    const wrongName = installed.skills[2]!
    const foreign = replaceWithDir(dirName, "user dir")
    rmSync(join(primaryDir(), goneName), { recursive: true, force: true })
    rmSync(join(primaryDir(), wrongName), { recursive: true, force: true })
    const other = join(home, "other")
    mkdirSync(other, { recursive: true })
    symlinkSync(other, join(primaryDir(), wrongName), LINK_TYPE)
    disableReplaceForeign()
    expect(autoLinkSkills()).toBe(2)
    // 同轮有修复落盘时，被豁免的实体目录记录不能被写掉
    const links = readSkillsState()?.targets[0]!.links ?? []
    expect(links).toContain(dirName)
    expect(links).toContain(goneName)
    expect(links).toContain(wrongName)
    expect(lstatSync(foreign).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(foreign, "SKILL.md"), "utf8")).toBe("user dir")
    expect(isLinkTo(join(primaryDir(), goneName), join(skillsSourceDir(), goneName))).toBe(true)
    expect(isLinkTo(join(primaryDir(), wrongName), join(skillsSourceDir(), wrongName))).toBe(true)
  })

  it("未配置开关时实体目录仍被清理重建（默认行为回归）", () => {
    const installed = installSkills()
    const dest = replaceWithDir(installed.skills[0]!, "user dir")
    expect(autoLinkSkills()).toBe(1)
    expect(isLinkTo(dest, join(skillsSourceDir(), installed.skills[0]!))).toBe(true)
  })
})

describe("悬空链接判定与自动清理", () => {
  it("指向别处且该处已不存在的链接报悬空，卸载可自动清理而不交人工确认", () => {
    const installed = installSkills({ copy: true })
    const name = installed.skills[0]!
    // 模拟指向已失效的旧版本段：目标目录不存在，无从判其内容归属，应归为悬空（而非指向其他版本）
    rmSync(join(primaryDir(), name), { recursive: true, force: true })
    symlinkSync(join(home, "stale-segment", name), join(primaryDir(), name), LINK_TYPE)
    expect(stateOf(primaryDir(), name)).toBe("dangling")
    const report = removeSkills()
    expect(report.targets[0]!.removed).toContain(name)
    expect(report.targets[0]!.skippedForeign).toHaveLength(0)
  })

  it("自愈重建指向已失效旧版本段的悬空链接", () => {
    const installed = installSkills()
    const name = installed.skills[0]!
    rmSync(join(primaryDir(), name), { recursive: true, force: true })
    symlinkSync(join(home, "stale-segment", name), join(primaryDir(), name), LINK_TYPE)
    expect(autoLinkSkills()).toBe(1)
    expect(isLinkTo(join(primaryDir(), name), join(skillsSourceDir(), name))).toBe(true)
  })

  it("指向别处且内容仍一致的健康链接不受影响（路径不同不等于内容不同）", () => {
    const name = listPackageSkills()[0]!.name
    // 整目录复制真源到异地再链接过去：内容逐字一致即视为正常，避免体检假警
    const mirror = join(home, "mirror", name)
    cpSync(join(skillsSourceDir(), name), mirror, { recursive: true })
    mkdirSync(primaryDir(), { recursive: true })
    symlinkSync(mirror, join(primaryDir(), name), LINK_TYPE)
    expect(stateOf(primaryDir(), name)).toBe("link")
  })
})

describe("落点形态保持与卸载回收", () => {
  it("--force 只解除冲突判定，已登记的副本仍是副本、不翻回软链", () => {
    const installed = installSkills({ copy: true })
    const name = installed.skills[0]!
    expect(lstatSync(join(primaryDir(), name)).isSymbolicLink()).toBe(false)
    const forced = installSkills({ force: true })
    expect(forced.targets[0]!.copies).toContain(name)
    expect(lstatSync(join(primaryDir(), name)).isSymbolicLink()).toBe(false)
    expect(stateOf(primaryDir(), name)).toBe("copy")
  })

  it("裸 install 刷新已登记副本时同样保持副本形态", () => {
    const installed = installSkills({ copy: true })
    const name = installed.skills[0]!
    const again = installSkills()
    expect(again.targets[0]!.copies).toContain(name)
    expect(lstatSync(join(primaryDir(), name)).isSymbolicLink()).toBe(false)
  })

  it("卸载清空产物后一并回收空目录并回报 dirReclaimed", () => {
    const installed = installSkills({ copy: true })
    const report = removeSkills()
    expect(report.targets[0]!.dirReclaimed).toBe(true)
    expect(existsSync(primaryDir())).toBe(false)
    expect(existsSync(join(primaryDir(), installed.skills[0]!))).toBe(false)
  })

  it("目录中留有非本包内容时不回收，dirReclaimed 为假", () => {
    installSkills({ copy: true })
    writeFileSync(join(primaryDir(), "user-note.md"), "keep me", "utf8")
    const report = removeSkills()
    expect(report.targets[0]!.dirReclaimed).toBe(false)
    expect(existsSync(join(primaryDir(), "user-note.md"))).toBe(true)
  })

  it("预演不回收目录，也不标记已回收", () => {
    installSkills({ copy: true })
    const preview = removeSkills({ dryRun: true })
    expect(preview.targets[0]!.dirReclaimed).toBe(false)
    expect(existsSync(primaryDir())).toBe(true)
  })
})

describe("status 目标纳入口径", () => {
  it("状态文件登记但本次未解析到的目标仍如实呈现，不被静默丢弃", () => {
    const extra = join(home, "custom-skills")
    installSkills({ dirs: [extra] })
    // 不带 --dir 再查：该目录已不在解析结果里，但既有登记必须保留在报告中
    const custom = skillsStatus().targets.find((t) => t.dir === extra)
    expect(custom?.recorded).toBe(true)
    expect(custom?.kind).toBe("custom")
    expect(custom?.items.every((i) => i.state === "link")).toBe(true)
  })

  it("有目录但无本包记录且为空时不占版面，登记后照常呈现", () => {
    const dir = agentDir("claude-code")
    mkdirSync(dir, { recursive: true })
    expect(skillsStatus().targets.some((t) => t.dir === dir)).toBe(false)
    writeState([{ dir, links: [listPackageSkills()[0]!.name] }])
    expect(skillsStatus().targets.some((t) => t.dir === dir)).toBe(true)
  })
})

// 项目侧分发：真源恒为 <repo>/.agents/skills 唯一一份副本，其余已存在候选目录只落薄壳
describe("项目侧技能分发（真源副本 + 薄壳）", () => {
  // 各用例独立建临时项目目录，避免默认 cwd（真实仓库根）被写入
  let project = ""
  const projects: string[] = []

  // 真源副本里某技能的 SKILL.md 绝对路径
  function sourceSkillFile(root: string, name: string): string {
    return join(root, PROJECT_SOURCE_DIR, name, "SKILL.md")
  }

  // 薄壳目录里某技能的 SKILL.md 绝对路径
  function shellSkillFile(root: string, dir: string, name: string): string {
    return join(root, dir, name, "SKILL.md")
  }

  // 按真源派生的期望薄壳内容（复用真实实现，不在测试内重写转换逻辑）
  function expectedShell(skill: { name: string; dir: string }): string {
    return buildSkillShell(skill.name, PROJECT_SOURCE_DIR, readSkillDescription(skill.dir))
  }

  // 取体检报告里某目录下某技能的状态
  function stateIn(report: ReturnType<typeof projectSkillsStatus>, dir: string, name: string): string | undefined {
    return report.dirs.find((d) => d.dir === dir)?.items.find((i) => i.name === name)?.state
  }

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "tk-proj-"))
    projects.push(project)
  })

  afterEach(() => {
    while (projects.length) rmSync(projects.pop()!, { recursive: true, force: true })
  })

  it("把包内技能写入仓库唯一真源，并在其余已存在候选目录落薄壳", () => {
    mkdirSync(join(project, ".cursor", "skills"), { recursive: true })
    const skills = listPackageSkills()

    const report = installProjectSkills({ cwd: project })
    expect(report.source.dir).toBe(PROJECT_SOURCE_DIR)
    expect(report.source.created).toEqual(skills.map((s) => s.name))
    // 真源内容与包内真源逐字一致
    for (const s of skills) {
      expect(readFileSync(sourceSkillFile(project, s.name), "utf8")).toBe(readFileSync(join(s.dir, "SKILL.md"), "utf8"))
    }
    // 薄壳只落在已存在候选目录，内容由真源派生
    expect(report.shells.map((r) => r.dir)).toEqual([".cursor/skills"])
    for (const s of skills) {
      expect(readFileSync(shellSkillFile(project, ".cursor/skills", s.name), "utf8")).toBe(expectedShell(s))
    }
    // 未命中的候选目录如实报告，供按需补齐
    expect(report.missingDirs).toContain(".trae/skills")
    expect(report.missingDirs).not.toContain(PROJECT_SOURCE_DIR)
  })

  it("重复安装幂等：真源与薄壳均跳过，且不改写归属账", () => {
    mkdirSync(join(project, ".cursor", "skills"), { recursive: true })
    installProjectSkills({ cwd: project })
    // 人为回拨 updatedAt：幂等安装若重写文件会覆盖该值
    const stateFile = projectStateFile(project)
    const state = JSON.parse(readFileSync(stateFile, "utf8"))
    state.updatedAt = "2000-01-01T00:00:00.000Z"
    writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8")

    const names = listPackageSkills().map((s) => s.name)
    const again = installProjectSkills({ cwd: project })
    expect(again.source.skipped).toEqual(names)
    expect(again.shells[0]!.skipped).toEqual(names)
    // 账体无变化 → 不落盘，updatedAt 保持回拨值
    expect(JSON.parse(readFileSync(stateFile, "utf8")).updatedAt).toBe("2000-01-01T00:00:00.000Z")
  })

  it("薄壳按标记版本分流：同版或超前保持、漂移重写、无标记交人工", () => {
    mkdirSync(join(project, ".cursor", "skills"), { recursive: true })
    installProjectSkills({ cwd: project })
    const skill = listPackageSkills()[0]!
    const file = shellSkillFile(project, ".cursor/skills", skill.name)
    const expected = readFileSync(file, "utf8")
    const version = readSkillShellVersion(expected)!
    const install = () => installProjectSkills({ cwd: project })

    // 同版且内容一致 → 跳过
    expect(install().shells[0]!.skipped).toContain(skill.name)

    // 标记超前（壳由更新版 toolkit 生成）→ 不降级覆盖
    const ahead = expected.replace(`v${version} -->`, `v${version + 1} -->`)
    writeFileSync(file, ahead, "utf8")
    expect(install().shells[0]!.skipped).toContain(skill.name)
    expect(readFileSync(file, "utf8")).toBe(ahead)

    // 同标记但内容漂移 → 就地重写回期望内容
    writeFileSync(file, `${expected}被人改动的尾巴\n`, "utf8")
    expect(install().shells[0]!.updated).toContain(skill.name)
    expect(readFileSync(file, "utf8")).toBe(expected)

    // 无标记（他人同名产物）→ 默认冲突不改写，--force 时重写
    writeFileSync(file, "---\nname: x\ndescription: 外来的\n---\n\n外来的壳\n", "utf8")
    expect(install().shells[0]!.conflicts).toContain(skill.name)
    expect(readFileSync(file, "utf8")).not.toBe(expected)
    expect(installProjectSkills({ cwd: project, force: true }).shells[0]!.updated).toContain(skill.name)
    expect(readFileSync(file, "utf8")).toBe(expected)
  })

  it("--dir 只接受仓库内取值，库外取值剔除并回报（降级不静默）", () => {
    const skill = listPackageSkills()[0]!
    const report = installProjectSkills({ cwd: project, dirs: ["../outside-skills", ".trae/skills"] })
    expect(report.ignoredDirs).toEqual(["../outside-skills"])
    expect(report.shells.map((r) => r.dir)).toContain(".trae/skills")
    expect(existsSync(shellSkillFile(project, ".trae/skills", skill.name))).toBe(true)
  })

  it("体检如实分辨真源与薄壳的 ready / drift / conflict / missing", () => {
    mkdirSync(join(project, ".cursor", "skills"), { recursive: true })
    installProjectSkills({ cwd: project })
    const first = listPackageSkills()[0]!
    const second = listPackageSkills()[1]!

    const initial = projectSkillsStatus(project)
    expect(stateIn(initial, PROJECT_SOURCE_DIR, first.name)).toBe("ready")
    expect(stateIn(initial, ".cursor/skills", first.name)).toBe("ready")

    // 真源被改动（有归属记录）→ drift
    writeFileSync(sourceSkillFile(project, first.name), "改动过的真源\n", "utf8")
    expect(stateIn(projectSkillsStatus(project), PROJECT_SOURCE_DIR, first.name)).toBe("drift")

    // 薄壳被改动（保留标记）→ drift
    writeFileSync(shellSkillFile(project, ".cursor/skills", first.name), `${expectedShell(first)}尾巴\n`, "utf8")
    expect(stateIn(projectSkillsStatus(project), ".cursor/skills", first.name)).toBe("drift")

    // 未登记的候选目录里无标记同名产物 → conflict
    mkdirSync(join(project, ".trae", "skills", second.name), { recursive: true })
    writeFileSync(shellSkillFile(project, ".trae/skills", second.name), "# 外来技能\n", "utf8")
    expect(stateIn(projectSkillsStatus(project), ".trae/skills", second.name)).toBe("conflict")

    // 真源条目缺失 → missing
    rmSync(join(project, PROJECT_SOURCE_DIR, second.name), { recursive: true, force: true })
    expect(stateIn(projectSkillsStatus(project), PROJECT_SOURCE_DIR, second.name)).toBe("missing")
  })

  it("卸载只清账内产物，回收空目录并删除归属账；二次调用报未安装", () => {
    mkdirSync(join(project, ".cursor", "skills"), { recursive: true })
    installProjectSkills({ cwd: project })
    const names = listPackageSkills().map((s) => s.name)

    const report = removeProjectSkills({ cwd: project })
    expect(report.dirs.find((d) => d.kind === "source")!.removed).toEqual(names)
    expect(report.dirs.find((d) => d.kind === "shell")!.removed).toEqual(names)
    expect(report.reclaimed).toEqual(expect.arrayContaining([PROJECT_SOURCE_DIR, ".cursor/skills"]))
    expect(report.stateRemoved).toBe(true)
    expect(existsSync(projectStateFile(project))).toBe(false)
    expect(existsSync(join(project, PROJECT_SOURCE_DIR))).toBe(false)

    expect(removeProjectSkills({ cwd: project }).stateExists).toBe(false)
  })

  it("卸载遇内容被改动的真源条目时跳过，交人工确认并保留归属账", () => {
    installProjectSkills({ cwd: project })
    const skill = listPackageSkills()[0]!
    writeFileSync(sourceSkillFile(project, skill.name), "被我改过\n", "utf8")

    const report = removeProjectSkills({ cwd: project })
    expect(report.dirs.find((d) => d.kind === "source")!.skippedForeign).toContain(skill.name)
    expect(existsSync(join(project, PROJECT_SOURCE_DIR, skill.name))).toBe(true)
    expect(report.stateRemoved).toBe(false)
    expect(existsSync(projectStateFile(project))).toBe(true)
  })
})

// 作用域判定：以包根与项目根的包含关系为准，兼容 monorepo 子目录执行
describe("技能作用域判定", () => {
  const roots: string[] = []

  // 建临时目录并纳入统一清理
  function tmpRoot(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    roots.push(dir)
    return dir
  }

  // 造出真实的包根形态（落盘而非纯字符串），避免依赖实现细节做路径归一
  function fakePackageRoot(base: string): string {
    const dir = join(base, "node_modules", "@fxri", "toolkit")
    mkdirSync(dir, { recursive: true })
    return dir
  }

  afterEach(() => {
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
  })

  it("包根落在项目根之内时判为项目面", () => {
    const root = tmpRoot("tk-scope-proj-")
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo" }), "utf8")
    setPackageRootForTest(fakePackageRoot(root))
    expect(detectSkillScope(root)).toBe("project")
  })

  it("monorepo 子目录内执行同样判为项目面", () => {
    const root = tmpRoot("tk-scope-mono-")
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root" }), "utf8")
    const sub = join(root, "packages", "app")
    mkdirSync(sub, { recursive: true })
    writeFileSync(join(sub, "package.json"), JSON.stringify({ name: "app" }), "utf8")
    setPackageRootForTest(fakePackageRoot(root))
    expect(detectSkillScope(sub)).toBe("project")
  })

  it("全局 CLI 在项目目录内执行仍判为全局面", () => {
    const root = tmpRoot("tk-scope-cwd-")
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo" }), "utf8")
    const globalHome = tmpRoot("tk-scope-global-")
    setPackageRootForTest(fakePackageRoot(globalHome))
    expect(detectSkillScope(root)).toBe("global")
  })

  it("源仓库（包根即项目根）恒判为全局面", () => {
    const root = tmpRoot("tk-scope-src-")
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@fxri/toolkit" }), "utf8")
    setPackageRootForTest(root)
    expect(detectSkillScope(root)).toBe("global")
  })
})
