// 升级迁移单测：配置 / 工程文件改写、计划检测与备份恢复
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { rewriteConfigFile, rewritePackage } from "../upgrade/apply"
import { buildUpgradePlan, checkVersionGate, runUpgrade, verifyUpgrade } from "../upgrade"
import { latestBackup, pruneBackups, pruneLayersFor, restoreBackup, upgradeRoots } from "../upgrade/backup"
import { planUpgradeDiffs } from "../upgrade/diff"
import { setHomeDirForTest } from "../config"
import { tempDir } from "./helpers"

const fixtures: string[] = []

// 最小工程：带 .tasks 标记项目根，避免 findProjectRoot 向上越界
function makeProject(files: Record<string, string>): string {
  const root = tempDir("fxts-tk-upgrade-")
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
    expect(item?.manualHint).toContain("--prune-legacy")
    expect(plan.autoResidue).toBe(0)
  })

  it("--prune-legacy 删除已被覆盖的旧段，复检残留归零", () => {
    const root = makeProject({ ".toolkitrc.json": conflictConfig })
    const plan = buildUpgradePlan(root, { layers: ["project"], pruneLegacy: true })
    expect(plan.items[0]?.status).toBe("planned")
    const result = runUpgrade(root, plan.items, { layers: ["project"], pruneLegacy: true })
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
    const dropped = buildUpgradePlan(root, { layers: ["project"], pruneLegacy: true })
    runUpgrade(root, dropped.items, { layers: ["project"], pruneLegacy: true })
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

describe("升级迁移：备份清理", () => {
  it("只删已知备份目录与固定 .bak，keep 保留最近一次，外来目录不动", () => {
    const root = makeProject({})
    const backupRoot = join(root, ".toolkit", "backup")
    for (const name of ["20260101-000000", "20260102-000000"]) {
      mkdirSync(join(backupRoot, name), { recursive: true })
      writeFileSync(join(backupRoot, name, "manifest.json"), "{}", "utf8")
    }
    mkdirSync(join(backupRoot, "foreign"), { recursive: true })
    writeFileSync(join(root, ".toolkitrc.json.bak"), "{}", "utf8")
    writeFileSync(join(root, "other.bak"), "{}", "utf8")
    const result = pruneBackups({ cwd: root, layers: ["project"], keep: 1 })
    expect(result.kept).toEqual([join(backupRoot, "20260102-000000")])
    expect(result.removed).toContain(join(backupRoot, "20260101-000000"))
    expect(result.removed).toContain(join(root, ".toolkitrc.json.bak"))
    expect(result.removed).not.toContain(join(root, "other.bak"))
    expect(result.skipped).toContain(join(backupRoot, "foreign"))
    expect(existsSync(join(root, "other.bak"))).toBe(true)
    expect(existsSync(join(backupRoot, "foreign"))).toBe(true)
  })

  it("含本机数据迁移的备份单独回报，便于清理时提示回滚点", () => {
    const root = makeProject({})
    const backupRoot = join(root, ".toolkit", "backup")
    const dataDir = join(backupRoot, "20260103-000000")
    const plainDir = join(backupRoot, "20260104-000000")
    for (const dir of [dataDir, plainDir]) mkdirSync(dir, { recursive: true })
    writeFileSync(join(dataDir, "manifest.json"), JSON.stringify({ createdAt: "", entries: [], created: [], data: true }), "utf8")
    writeFileSync(join(plainDir, "manifest.json"), JSON.stringify({ createdAt: "", entries: [], created: [] }), "utf8")
    const result = pruneBackups({ cwd: root, layers: ["project"], keep: 0 })
    expect(result.dataBackups).toEqual([dataDir])
  })

  it("--dry-run 只报告不删除", () => {
    const root = makeProject({})
    const dir = join(root, ".toolkit", "backup", "20260101-000000")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "manifest.json"), "{}", "utf8")
    const result = pruneBackups({ cwd: root, layers: ["project"], dryRun: true })
    expect(result.removed).toEqual([dir])
    expect(existsSync(dir)).toBe(true)
  })

  it("prune 默认层：项目内只清项目，home 下只清全局", () => {
    const project = makeProject({})
    expect(pruneLayersFor(project)).toEqual(["project"])
    const home = makeProject({})
    setHomeDirForTest(home)
    expect(pruneLayersFor(home)).toEqual(["global"])
    expect(pruneLayersFor(project, ["global", "project", "local"])).toEqual(["global", "project"])
  })
})

describe("升级迁移：备份归属", () => {
  it("全局 .bak 单独成项并收编到全局备份根", () => {
    const home = makeProject({ ".toolkitrc.json.bak": "{}" })
    const project = makeProject({})
    setHomeDirForTest(home)
    const plan = buildUpgradePlan(project, { layers: ["global", "project"] })
    const item = plan.items.find((entry) => entry.id === "backup:global")
    expect(item?.layers).toEqual(["global"])
    runUpgrade(project, plan.items, { layers: ["global", "project"] })
    expect(existsSync(join(home, ".toolkit", "backup"))).toBe(true)
    expect(existsSync(join(project, ".toolkit", "backup"))).toBe(false)
  })
})

describe("升级迁移：子目录运行", () => {
  it("从子目录执行后 --restore 可恢复祖先本地配置", () => {
    const root = makeProject({})
    const sub = join(root, "packages", "app")
    mkdirSync(sub, { recursive: true })
    const local = join(root, ".toolkitrc.local.json")
    const original = JSON.stringify({ tasks: { dir: "old" } })
    writeFileSync(local, original, "utf8")

    const plan = buildUpgradePlan(sub, { layers: ["local"] })
    expect(plan.items.some((item) => item.id === "config:local")).toBe(true)
    const result = runUpgrade(sub, plan.items, { layers: ["local"] })
    expect(result.failed).toEqual([])
    expect(readFileSync(local, "utf8")).not.toBe(original)

    const dir = latestBackup(sub)
    expect(dir).not.toBeNull()
    const restored = restoreBackup(dir!, { overwrite: true, roots: upgradeRoots(sub) })
    expect(restored.restored).toContain(local)
    expect(readFileSync(local, "utf8")).toBe(original)
  })

  it("从子目录执行可收编祖先 .bak", () => {
    const root = makeProject({})
    const sub = join(root, "packages", "app")
    mkdirSync(sub, { recursive: true })
    // 祖先本地配置同时作为项目标志，使项目根可被定位
    writeFileSync(join(root, ".toolkitrc.local.json"), "{}", "utf8")
    const bak = join(root, ".toolkitrc.local.json.bak")
    writeFileSync(bak, "{}", "utf8")

    const plan = buildUpgradePlan(sub, { layers: ["local"] })
    expect(plan.items.some((item) => item.id === "backup:legacy")).toBe(true)
    const result = runUpgrade(sub, plan.items, { layers: ["local"] })
    expect(result.failed).toEqual([])
    expect(existsSync(bak)).toBe(false)
  })
})

describe("升级迁移：本机契约数据", () => {
  // 旧整数版本的最小数据现场：技能状态、事件、索引、队列、账本与两个作用域的回收站清单
  function seedLegacyData(home: string, project: string): void {
    const write = (root: string, rel: string, data: unknown): void => {
      const file = join(root, rel)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`, "utf8")
    }
    write(join(home, ".agents"), ".toolkit-skills.json", { format: "fxri.toolkit.skills-state", schemaVersion: 1, updatedAt: "", sources: {} })
    write(join(project, ".toolkit"), "state.json", { format: "fxri.toolkit.skills-state", schemaVersion: 1, updatedAt: "", sources: {} })
    write(
      join(home, ".toolkit", "usage"),
      "events/2026-11.jsonl",
      '{"schemaVersion":1,"eventId":"e1","skill":"a"}\n{"schemaVersion":1,"eventId":"e2","skill":"b"}\n',
    )
    write(join(home, ".toolkit", "usage"), "index.json", { schemaVersion: 1, updatedAt: "", eventIds: [], keys: [] })
    write(join(home, ".toolkit", "usage"), "state/queue/b1.json", {
      schemaVersion: 1,
      batchId: "b1",
      sessionId: "s",
      agentHint: "trae",
      cwd: "",
      occurredAt: "2026-11-27T00:00:00+08:00",
      skills: ["a"],
    })
    write(join(home, ".toolkit", "usage"), "upload-ledger.json", { schemaVersion: 1, updatedAt: "", sent: [] })
    for (const root of [home, project]) {
      write(root, ".toolkit/trash/20260101-abcdef/manifest.json", {
        schemaVersion: 1,
        id: "20260101-abcdef",
        createdAt: "2026-01-01T00:00:00.000Z",
        command: "skill uninstall",
        scope: root === home ? "global" : "project",
        root,
        entries: [],
        status: "complete",
      })
    }
  }

  it("检出旧整数写法并原地重写版本，纳入备份会话且可恢复，重复执行零变更", () => {
    const home = makeProject({})
    const project = makeProject({})
    seedLegacyData(home, project)
    setHomeDirForTest(home)

    const plan = buildUpgradePlan(project, { layers: ["global", "project"] })
    expect(plan.items.map((item) => item.id)).toEqual([
      "data:skills-state-global",
      "data:skills-state-project",
      "data:usage-events",
      "data:usage-index",
      "data:usage-queue",
      "data:usage-ledger",
      "data:trash-global",
      "data:trash-project",
    ])
    expect(plan.autoResidue).toBe(8)

    const result = runUpgrade(project, plan.items, { layers: ["global", "project"] })
    expect(result.failed).toEqual([])
    expect(result.residue).toEqual([])

    // 版本字段统一为两位，事件逐行重写且保留原有字段
    const state = JSON.parse(readFileSync(join(home, ".agents", ".toolkit-skills.json"), "utf8")) as { schemaVersion: string }
    expect(state.schemaVersion).toBe("1.0")
    const events = readFileSync(join(home, ".toolkit", "usage", "events", "2026-11.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { schemaVersion: string; eventId: string })
    expect(events.map((event) => event.schemaVersion)).toEqual(["1.0", "1.0"])
    expect(events.map((event) => event.eventId)).toEqual(["e1", "e2"])
    const index = JSON.parse(readFileSync(join(home, ".toolkit", "usage", "index.json"), "utf8")) as { schemaVersion: string; eventIds: string[] }
    expect(index.schemaVersion).toBe("1.0")
    expect(index.eventIds).toEqual(["e1", "e2"])

    // 幂等：同现场再检测不再产生数据项
    const again = buildUpgradePlan(project, { layers: ["global", "project"] })
    expect(again.items.filter((item) => item.surface === "data")).toEqual([])

    // 数据文件与工程文件共用备份清单，--restore 可回滚到旧版本写法
    const globalBackup = result.backups.find((dir) => dir.startsWith(join(home, ".toolkit", "backup")))
    expect(globalBackup).toBeTruthy()
    expect((JSON.parse(readFileSync(join(globalBackup as string, "manifest.json"), "utf8")) as { data?: boolean }).data).toBe(true)
    const restored = restoreBackup(globalBackup as string, { roots: upgradeRoots(project) })
    expect(restored.restored).toContain(join(home, ".agents", ".toolkit-skills.json"))
    expect((JSON.parse(readFileSync(join(home, ".agents", ".toolkit-skills.json"), "utf8")) as { schemaVersion: number }).schemaVersion).toBe(1)
  })

  it("--skip-events 跳过事件文件，索引就地改版本保留去重数据", () => {
    const home = makeProject({})
    const project = makeProject({})
    seedLegacyData(home, project)
    // 覆盖索引内容：验证跳过事件时索引就地改版本、不清空已有去重数据
    writeFileSync(join(home, ".toolkit", "usage", "index.json"), `${JSON.stringify({ schemaVersion: 1, updatedAt: "", eventIds: ["keep"], keys: [] })}\n`, "utf8")
    setHomeDirForTest(home)

    const plan = buildUpgradePlan(project, { layers: ["global"], skipEvents: true })
    expect(plan.items.some((item) => item.id === "data:usage-events")).toBe(false)
    const result = runUpgrade(project, plan.items, { layers: ["global"], skipEvents: true })
    expect(result.residue).toEqual([])

    const events = readFileSync(join(home, ".toolkit", "usage", "events", "2026-11.jsonl"), "utf8")
    expect(JSON.parse(events.trim().split("\n")[0] as string).schemaVersion).toBe(1)
    const index = JSON.parse(readFileSync(join(home, ".toolkit", "usage", "index.json"), "utf8")) as { schemaVersion: string; eventIds: string[] }
    expect(index.schemaVersion).toBe("1.0")
    expect(index.eventIds).toEqual(["keep"])
  })

  it("高于当前 toolkit 的版本只列人工项，不降级写入", () => {
    const home = makeProject({
      ".toolkit/usage/events/2026-11.jsonl": '{"schemaVersion":"2.0","eventId":"e1","skill":"a"}\n',
    })
    const project = makeProject({})
    setHomeDirForTest(home)

    const plan = buildUpgradePlan(project, { layers: ["global"] })
    const item = plan.items.find((entry) => entry.id === "data:usage-events")
    expect(item?.status).toBe("manual")
    expect(item?.manualHint).toContain("先升级 toolkit")
    expect(plan.autoResidue).toBe(0)
    const before = readFileSync(join(home, ".toolkit", "usage", "events", "2026-11.jsonl"), "utf8")
    runUpgrade(project, plan.items, { layers: ["global"] })
    expect(readFileSync(join(home, ".toolkit", "usage", "events", "2026-11.jsonl"), "utf8")).toBe(before)
  })

  it("同项内混有损坏文件时整项判人工，不部分重写", () => {
    const home = makeProject({})
    const project = makeProject({})
    const trashRoot = join(project, ".toolkit", "trash")
    mkdirSync(join(trashRoot, "a"), { recursive: true })
    mkdirSync(join(trashRoot, "b"), { recursive: true })
    writeFileSync(join(trashRoot, "a", "manifest.json"), JSON.stringify({ schemaVersion: 1, entries: [] }), "utf8")
    writeFileSync(join(trashRoot, "b", "manifest.json"), "{", "utf8")
    setHomeDirForTest(home)

    const plan = buildUpgradePlan(project, { layers: ["project"] })
    const item = plan.items.find((entry) => entry.id === "data:trash-project")
    expect(item?.status).toBe("manual")
    expect(item?.manualHint).toContain("无法解析")
    const before = readFileSync(join(trashRoot, "a", "manifest.json"), "utf8")
    runUpgrade(project, plan.items, { layers: ["project"] })
    expect(readFileSync(join(trashRoot, "a", "manifest.json"), "utf8")).toBe(before)
  })

  it("版本字段缺失按人工项处理并显示「缺失」", () => {
    const home = makeProject({})
    const project = makeProject({})
    mkdirSync(join(project, ".toolkit", "trash", "c"), { recursive: true })
    writeFileSync(join(project, ".toolkit", "trash", "c", "manifest.json"), JSON.stringify({ entries: [] }), "utf8")
    setHomeDirForTest(home)

    const plan = buildUpgradePlan(project, { layers: ["project"] })
    const item = plan.items.find((entry) => entry.id === "data:trash-project")
    expect(item?.status).toBe("manual")
    expect(`${item?.action}${item?.manualHint}`).toContain("缺失")
  })

  it("事件文件同时含旧版本与无法识别行时，旧行重写并把无法识别文件列入提示", () => {
    const home = makeProject({
      ".toolkit/usage/events/2026-11.jsonl": '{"schemaVersion":1,"eventId":"e1","skill":"a"}\n{"schemaVersion":"x","eventId":"e2","skill":"b"}\n',
    })
    const project = makeProject({})
    setHomeDirForTest(home)

    const plan = buildUpgradePlan(project, { layers: ["global"] })
    const item = plan.items.find((entry) => entry.id === "data:usage-events")
    expect(item?.status).toBe("planned")
    expect(item?.manualHint).toContain("无法识别")
    const result = runUpgrade(project, plan.items, { layers: ["global"] })
    expect(result.residue).toEqual([])
    const lines = readFileSync(join(home, ".toolkit", "usage", "events", "2026-11.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { schemaVersion: string })
    expect(lines.map((line) => line.schemaVersion)).toEqual(["1.0", "x"])
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
    const skipped = restoreBackup(dir as string, { roots: [root] })
    expect(skipped.skipped).toContain(join(root, ".toolkitrc.json"))
    expect(readFileSync(join(root, ".toolkitrc.json"), "utf8")).not.toBe(legacyConfig)

    const forced = restoreBackup(dir as string, { overwrite: true, roots: [root] })
    expect(forced.restored).toContain(join(root, ".toolkitrc.json"))
    expect(JSON.parse(readFileSync(join(root, ".toolkitrc.json"), "utf8"))).toMatchObject({ tasks: { dir: ".tasks" } })
  })

  it("清单里的越界路径被跳过，不删除允许根外文件", () => {
    const root = makeProject({})
    const backup = join(root, ".toolkit", "backup", "20260101-000000")
    mkdirSync(backup, { recursive: true })
    const outside = tempDir("fxts-tk-restore-outside-")
    fixtures.push(outside)
    const keep = join(outside, "keep.txt")
    writeFileSync(keep, "keep", "utf8")
    writeFileSync(
      join(backup, "manifest.json"),
      JSON.stringify({ createdAt: "2026-01-01T00:00:00.000Z", entries: [], created: [{ path: keep, postSha: "" }] }),
      "utf8",
    )
    const result = restoreBackup(backup, { overwrite: true, roots: [root] })
    expect(result.skipped).toContain(keep)
    expect(existsSync(keep)).toBe(true)
  })
})
