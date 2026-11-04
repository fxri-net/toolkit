// 技能版本检测：内置技能对比包内真源、外部来源对比状态登记版本；只读状态，不扫目录
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
const originalCwd = process.cwd()

function state(sources: SkillsState["sources"]): SkillsState {
  return { format: "fxri.toolkit.skills-state", schemaVersion: 1, updatedAt: "", sources }
}

function source(entries: Array<{ name: string; version: string }>, extra: Record<string, unknown> = {}) {
  return {
    kind: "local",
    version: "",
    temporary: false,
    root: join(work, "source"),
    targets: [{ id: "primary", dir: join(home, ".agents", "skills"), label: "canonical", kind: "primary" as const, entries: entries.map((item) => ({ ...item, mode: "link" as const })) }],
    ...extra,
  }
}

beforeEach(() => {
  mkdirSync(home, { recursive: true })
  mkdirSync(work, { recursive: true })
  mkdirSync(join(work, ".git"), { recursive: true })
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
  it("内置技能落后于包内真源、外部来源落后于来源版本时分别上报", () => {
    writeSkillsState(
      state({
        toolkit: source([{ name: "fxri-plan-to-task", version: "0.0.1" }], { kind: "builtin", version: "1.0.0" }),
        play: source([{ name: "fxri-dev-profile-web", version: "1.0.0" }], { version: "2.0.0", temporary: true }),
      }),
    )
    const report = collectSkillVersionUpdates()
    expect(report.builtin.map((item) => item.name)).toContain("fxri-plan-to-task")
    expect(report.external.map((item) => item.name)).toContain("fxri-dev-profile-web")
    expect(report.sources.find((item) => item.name === "play")).toMatchObject({ version: "2.0.0", temporary: true })
  })

  it("已安装版本高于来源版本时不提示降级；来源无版本时归入 unknown", () => {
    writeSkillsState(
      state({
        play: source([{ name: "fxri-dev-profile-web", version: "3.0.0" }], { version: "2.0.0" }),
        remote: source([{ name: "fxri-dev-profile-vue", version: "1.0.0" }], { version: "" }),
      }),
    )
    const report = collectSkillVersionUpdates()
    expect(report.external.map((item) => item.name)).not.toContain("fxri-dev-profile-web")
    expect(report.unknown.map((item) => item.name)).toContain("fxri-dev-profile-vue")
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
