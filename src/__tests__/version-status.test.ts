// 技能版本检测：内置技能对比包内真源、外部来源对比缓存目录内的技能版本；只读状态与本地文件
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { collectSkillVersionUpdates } from "../skills/version-status"
import { writeSkillsState } from "../skills/state"
import type { SkillsState } from "../skills/types"

const sandbox = `${(process.env.TEMP || process.env.TMP || "/tmp").replace(/[\\/]+$/, "")}/tk-version-status-${process.pid.toString(36)}`
const home = join(sandbox, "home")
const work = join(sandbox, "work")
const sourceRoot = join(work, "source")
const originalCwd = process.cwd()

function state(sources: SkillsState["sources"]): SkillsState {
  return { format: "fxri.toolkit.skills-state", schemaVersion: 1, updatedAt: "", sources }
}

function source(entries: Array<{ name: string; version: string }>, extra: Record<string, unknown> = {}) {
  return {
    kind: "local",
    version: "",
    temporary: false,
    root: sourceRoot,
    targets: [{ id: "primary", dir: join(home, ".agents", "skills"), label: "canonical", kind: "primary" as const, entries: entries.map((item) => ({ ...item, mode: "link" as const })) }],
    ...extra,
  }
}

// 在缓存来源目录下写一份技能真源：版本是技能自身版本，不等于来源级版本
function writeSourceSkill(name: string, version: string): void {
  const dir = join(sourceRoot, "skills", name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: 缓存来源技能\nmetadata:\n  version: "${version}"\n  tier: optional\n---\n`, "utf8")
}

beforeEach(() => {
  mkdirSync(home, { recursive: true })
  mkdirSync(work, { recursive: true })
  mkdirSync(join(work, ".git"), { recursive: true })
  mkdirSync(sourceRoot, { recursive: true })
  process.chdir(work)
  setHomeDirForTest(home)
  resetToolkitConfigCache()
})

afterEach(() => {
  process.chdir(originalCwd)
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  rmSync(sandbox, { recursive: true, force: true })
})

afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

describe("collectSkillVersionUpdates", () => {
  it("内置技能落后于包内真源、外部来源落后于缓存技能的自身版本时分别上报", () => {
    writeSourceSkill("fxri-dev-profile-web", "2.0.0")
    writeSkillsState(
      state({
        toolkit: source([{ name: "fxri-plan-to-task", version: "0.0.1" }], { kind: "builtin", version: "1.0.0" }),
        play: source([{ name: "fxri-dev-profile-web", version: "1.0.0" }], { version: "9.9.9", temporary: true }),
      }),
    )
    const report = collectSkillVersionUpdates()
    expect(report.builtin.map((item) => item.name)).toContain("fxri-plan-to-task")
    // 外部来源用缓存目录里的技能版本 2.0.0，而不是来源级版本 9.9.9
    expect(report.external.find((item) => item.name === "fxri-dev-profile-web")).toMatchObject({ installed: "1.0.0", latest: "2.0.0" })
    expect(report.sources.find((item) => item.name === "play")).toMatchObject({ version: "9.9.9", temporary: true })
  })

  it("技能版本与缓存一致或更高时不提示降级；缓存缺失技能时归入 unknown 并标明缺 latest", () => {
    writeSourceSkill("fxri-dev-profile-web", "2.0.0")
    writeSkillsState(
      state({
        play: source([{ name: "fxri-dev-profile-web", version: "3.0.0" }], { version: "2.0.0" }),
        remote: source([{ name: "fxri-dev-profile-vue", version: "1.0.0" }], { version: "2.0.0" }),
      }),
    )
    const report = collectSkillVersionUpdates()
    expect(report.external.map((item) => item.name)).not.toContain("fxri-dev-profile-web")
    const vue = report.unknown.find((item) => item.name === "fxri-dev-profile-vue")
    expect(vue).toMatchObject({ missing: "latest", installed: "1.0.0" })
  })

  it("已装侧无版本时归入 unknown 并标明缺 installed", () => {
    writeSourceSkill("fxri-dev-profile-web", "2.0.0")
    writeSkillsState(state({ play: source([{ name: "fxri-dev-profile-web", version: "" }], { version: "2.0.0" }) }))
    const report = collectSkillVersionUpdates()
    expect(report.unknown.find((item) => item.name === "fxri-dev-profile-web")).toMatchObject({ missing: "installed" })
    expect(report.external).toHaveLength(0)
  })

  it("项目态内置技能落后同样计入 builtin", () => {
    mkdirSync(join(work, ".toolkit"), { recursive: true })
    writeFileSync(
      join(work, ".toolkit", "state.json"),
      JSON.stringify(state({ toolkit: source([{ name: "fxri-session-recap", version: "0.0.1" }], { kind: "builtin", version: "1.0.0" }) })),
      "utf8",
    )
    const report = collectSkillVersionUpdates()
    expect(report.builtin.map((item) => item.name)).toContain("fxri-session-recap")
  })
})
