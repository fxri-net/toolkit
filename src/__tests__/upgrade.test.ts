// 升级迁移单测：配置 / 工程文件改写、计划检测与备份恢复
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { rewriteConfigFile, rewritePackage } from "../upgrade/apply"
import { buildUpgradePlan, checkVersionGate, runUpgrade, verifyUpgrade } from "../upgrade"
import { latestBackup, restoreBackup } from "../upgrade/backup"
import { planUpgradeDiffs } from "../upgrade/diff"
import { setHomeDirForTest } from "../config"

const fixtures: string[] = []

// 最小工程：带 .tasks 标记项目根，避免 findProjectRoot 向上越界
function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fxts-tk-upgrade-"))
  fixtures.push(root)
  mkdirSync(join(root, ".tasks"), { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, rel)
    mkdirSync(join(file, ".."), { recursive: true })
    writeFileSync(file, content, "utf8")
  }
  return root
}

afterEach(() => {
  setHomeDirForTest(undefined)
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const legacyConfig = JSON.stringify({
  skillsInstall: { gate: { include: ["*"], exclude: ["fxri-test-tty"] } },
  projectSkills: { mode: "project" },
  tasks: { dir: ".tasks" },
})

const legacyPackage = `{
    "name": "demo",
    "scripts": {
        "prepare": "toolkit skills install",
        "stats": "toolkit tasks stats",
        "note": "echo toolkit tasks"
    }
}
`

describe("升级迁移：配置改写", () => {
  it("旧段名与原位置换名，闸门键映射为 skillDelivery，普通段保持不动", () => {
    const root = makeProject({ ".toolkitrc.json": legacyConfig, ".toolkitrc.local.json": JSON.stringify({ redact: { enabled: true } }) })
    const result = rewriteConfigFile(join(root, ".toolkitrc.json"))
    expect(result.manual).toEqual([])
    expect(result.changed).toBe(true)
    const parsed = JSON.parse(readFileSync(join(root, ".toolkitrc.json"), "utf8")) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(["skillDelivery", "projectSkill", "task"])
    expect(parsed.skillDelivery).toEqual({
      rules: [
        { match: ["*"], delivery: "gated" },
        { match: ["fxri-test-tty"], delivery: "full" },
      ],
    })
  })

  it("新旧段并存且内容不同时保留新段并把旧段列为人工项", () => {
    const root = makeProject({
      ".toolkitrc.json": JSON.stringify({ tasks: { dir: "old" }, task: { dir: "new" } }),
    })
    const result = rewriteConfigFile(join(root, ".toolkitrc.json"))
    expect(result.manual).toHaveLength(1)
    const parsed = JSON.parse(readFileSync(join(root, ".toolkitrc.json"), "utf8")) as Record<string, unknown>
    expect(parsed.task).toEqual({ dir: "new" })
    expect(parsed.tasks).toEqual({ dir: "old" })
  })
})

describe("升级迁移：行级差异", () => {
  it("配置与 package 的改写产出 unified diff", () => {
    const root = makeProject({ ".toolkitrc.json": legacyConfig, "package.json": legacyPackage })
    const plan = buildUpgradePlan(root)
    const diffs = planUpgradeDiffs(plan.items)

    const config = diffs.find((entry) => entry.file.endsWith(".toolkitrc.json"))
    expect(config?.patch).toContain("--- ")
    expect(config?.patch).toContain("+++ ")
    expect(config?.patch).toContain('-{"skillsInstall"')
    expect(config?.patch).toContain('+  "skillDelivery": {')

    const pkg = diffs.find((entry) => entry.file.endsWith("package.json"))
    expect(pkg?.patch).toContain('+        "prepare": "toolkit skill install --scope project --refresh"')
  })

  it("干净工程没有可预览的差异", () => {
    const root = makeProject({ ".toolkitrc.json": JSON.stringify({ task: { dir: ".tasks" } }), "package.json": '{\n  "name": "demo"\n}\n' })
    const plan = buildUpgradePlan(root)
    expect(planUpgradeDiffs(plan.items)).toEqual([])
  })
})

describe("升级迁移：工程文件改写", () => {
  it("prepare 旧写法与旧命令名被改写，非命令位置的同名文本不动，缩进保持", () => {
    const root = makeProject({ "package.json": legacyPackage })
    const result = rewritePackage(join(root, "package.json"))
    expect(result.manual).toEqual([])
    const raw = readFileSync(join(root, "package.json"), "utf8")
    expect(raw.startsWith('{\n    "name"')).toBe(true)
    const parsed = JSON.parse(raw) as { scripts: Record<string, string> }
    expect(parsed.scripts.prepare).toBe("toolkit skill install --scope project --refresh")
    expect(parsed.scripts.stats).toBe("toolkit task stats")
    expect(parsed.scripts.note).toBe("echo toolkit tasks")
  })
})

describe("升级迁移：计划与复检", () => {
  it("检测出配置、工程文件与历史 .bak，迁移后残留归零", () => {
    const root = makeProject({
      ".toolkitrc.json": legacyConfig,
      ".toolkitrc.json.bak": "{}",
      "package.json": legacyPackage,
    })
    const plan = buildUpgradePlan(root, { layers: ["project"] })
    expect(plan.items.map((item) => item.id)).toEqual(["config:project", "project:package", "backup:legacy"])
    expect(plan.autoResidue).toBe(3)

    const result = runUpgrade(root, plan.items, { layers: ["project"] })
    expect(result.failed).toEqual([])
    expect(result.residue).toEqual([])
    expect(existsSync(join(root, ".toolkitrc.json.bak"))).toBe(false)
    expect(result.backups).toHaveLength(1)
    expect(verifyUpgrade(root, ["project"]).filter((item) => item.status === "planned")).toEqual([])
  })

  it("CI 文件里的旧命令只列为人工项，不计入自动残留", () => {
    const root = makeProject({
      ".github/workflows/ci.yml": "name: ci\njobs:\n  x:\n    steps:\n      - run: toolkit tasks check\n",
    })
    const plan = buildUpgradePlan(root, { layers: ["project"] })
    const ci = plan.items.find((item) => item.id === "project:ci")
    expect(ci?.status).toBe("manual")
    expect(plan.autoResidue).toBe(0)
  })

  it("家目录只生成全局层迁移项，版本门禁不拦截", () => {
    const home = makeProject({
      ".toolkitrc.json": legacyConfig,
      "package.json": JSON.stringify({ name: "home", devDependencies: { "@fxri/toolkit": "^1.9.3" } }),
    })
    setHomeDirForTest(home)
    const plan = buildUpgradePlan(home)
    expect(plan.items.map((item) => item.id)).toEqual(["config:global"])
    expect(checkVersionGate(home, plan.items).ok).toBe(true)
  })
})

describe("升级迁移：人工项与旧段清理", () => {
  const conflictConfig = JSON.stringify({ projectSkills: { selection: ["old"] }, projectSkill: { selection: ["new"] } })

  it("新旧段内容不同在检测阶段判人工，不再计入自动残留", () => {
    const root = makeProject({ ".toolkitrc.json": conflictConfig })
    const plan = buildUpgradePlan(root, { layers: ["project"] })
    const item = plan.items.find((entry) => entry.id === "config:project")
    expect(item?.status).toBe("manual")
    expect(item?.manualHint).toContain(root)
    expect(item?.manualHint).toContain("--drop-legacy")
    expect(plan.autoResidue).toBe(0)
  })

  it("--drop-legacy 删除已被覆盖的旧段，复检残留归零", () => {
    const root = makeProject({ ".toolkitrc.json": conflictConfig })
    const plan = buildUpgradePlan(root, { layers: ["project"], dropLegacy: true })
    expect(plan.items[0]?.status).toBe("planned")
    const result = runUpgrade(root, plan.items, { layers: ["project"], dropLegacy: true })
    expect(result.residue).toEqual([])
    const parsed = JSON.parse(readFileSync(join(root, ".toolkitrc.json"), "utf8")) as Record<string, unknown>
    expect(parsed.projectSkills).toBeUndefined()
    expect(parsed.projectSkill).toEqual({ selection: ["new"] })
  })

  it("人工项无改动时不产生备份目录", () => {
    const root = makeProject({ ".toolkitrc.json": conflictConfig })
    const plan = buildUpgradePlan(root, { layers: ["project"] })
    const result = runUpgrade(root, plan.items, { layers: ["project"] })
    expect(result.applied).toEqual([])
    expect(result.backups).toEqual([])
    expect(existsSync(join(root, ".toolkit", "backup"))).toBe(false)
  })

  it("项目文件里的 skillInstall 判为误放层段并可清理", () => {
    const root = makeProject({ ".toolkitrc.json": JSON.stringify({ skillInstall: { mode: "skills" } }) })
    const plan = buildUpgradePlan(root, { layers: ["project"] })
    const item = plan.items.find((entry) => entry.id === "config:project")
    expect(item?.status).toBe("manual")
    expect(item?.manualHint).toContain("写错层")
    expect(plan.autoResidue).toBe(0)
    const dropped = buildUpgradePlan(root, { layers: ["project"], dropLegacy: true })
    runUpgrade(root, dropped.items, { layers: ["project"], dropLegacy: true })
    expect((JSON.parse(readFileSync(join(root, ".toolkitrc.json"), "utf8")) as Record<string, unknown>).skillInstall).toBeUndefined()
  })

  it("全局文件里的 projectSkill 判为误放层段", () => {
    const home = makeProject({ ".toolkitrc.json": JSON.stringify({ projectSkill: { selection: ["x"] } }) })
    setHomeDirForTest(home)
    const plan = buildUpgradePlan(home)
    const item = plan.items.find((entry) => entry.id === "config:global")
    expect(item?.status).toBe("manual")
    expect(item?.manualHint).toContain("projectSkill")
    expect(plan.autoResidue).toBe(0)
  })
})

describe("升级迁移：备份恢复", () => {
  it("恢复还原改写前的文件；迁移后被改过的文件默认跳过，--overwrite 才覆盖", () => {
    const root = makeProject({ ".toolkitrc.json": legacyConfig })
    const plan = buildUpgradePlan(root, { layers: ["project"] })
    runUpgrade(root, plan.items, { layers: ["project"] })
    const dir = latestBackup(root)
    expect(dir).not.toBeNull()
    const migrated = readFileSync(join(root, ".toolkitrc.json"), "utf8")
    // 模拟用户在迁移后继续编辑
    writeFileSync(join(root, ".toolkitrc.json"), `${migrated}\n`, "utf8")
    const skipped = restoreBackup(dir as string)
    expect(skipped.skipped).toContain(join(root, ".toolkitrc.json"))
    expect(readFileSync(join(root, ".toolkitrc.json"), "utf8")).not.toBe(legacyConfig)

    const forced = restoreBackup(dir as string, { overwrite: true })
    expect(forced.restored).toContain(join(root, ".toolkitrc.json"))
    expect(JSON.parse(readFileSync(join(root, ".toolkitrc.json"), "utf8"))).toMatchObject({ tasks: { dir: ".tasks" } })
  })
})
