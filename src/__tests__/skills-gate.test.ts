// 内容闸门：入口壳产物、幂等切换、状态展示、卸载归属与 guard 的激活 / 未激活契约
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { runGuard } from "../scope/guard"
import { autoLinkSkills, installSkills, isSkillGateShell, isSkillGated, listPackageSkills, readSkillsInstallConfig, readSkillsState, removeSkills, resetSkillGateWarnings, resetSkillsRootCache, setPackageRootForTest, skillsSourceDir, skillsStateFile, skillsStatus } from "../skills"

// 默认全部技能都被接管（include: ["*"]）
const ALL_SKILLS = listPackageSkills().map((skill) => skill.name)

// 临时 home：产物只落在临时目录，不触碰真实用户全局技能目录
let home = ""
// 用例前的 CI 环境值：autoLink 在 CI 下跳过，需临时清空避免宿主环境影响断言
let savedCI: string | undefined

// 主目标目录 ~/.agents/skills
function primaryDir(): string {
  return join(home, ".agents", "skills")
}

// 取安装报告里主目标的结果
function primaryTarget(report: ReturnType<typeof installSkills>) {
  const found = report.targets.find((t) => t.kind === "primary")
  if (!found) throw new Error("安装报告缺少主目标")
  return found
}

// 取状态文件里某目标目录的条目名，可按产物形态过滤
function stateEntries(dir: string, mode?: "link" | "copy" | "gate"): string[] {
  const state = readSkillsState()
  for (const source of Object.values(state?.sources ?? {})) {
    const target = source.targets.find((entry) => entry.dir === dir)
    if (target) return target.entries.filter((entry) => !mode || entry.mode === mode).map((entry) => entry.name)
  }
  return []
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-gate-"))
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  savedCI = process.env.CI
  delete process.env.CI
  // 首次开启提示属于产品输出，测试里收敛掉避免刷屏
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (savedCI === undefined) delete process.env.CI
  else process.env.CI = savedCI
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetSkillsRootCache()
  resetSkillGateWarnings()
  rmSync(home, { recursive: true, force: true })
})

describe("内容闸门安装形态", () => {
  it("开启后默认全部技能写入口壳", () => {
    const report = installSkills({ gate: true })
    const primary = primaryTarget(report)
    expect([...primary.gates].sort()).toEqual([...ALL_SKILLS].sort())
    const gatedDir = join(primaryDir(), "fxri-plan-to-task")
    const content = readFileSync(join(gatedDir, "SKILL.md"), "utf8")
    expect(isSkillGateShell(content)).toBe(true)
    expect(content).toContain("toolkit scope guard fxri-plan-to-task")
    // 正文只保留 guard 指示与识别标记，不夹带方案之外的流程提示
    expect(content).not.toContain("不要凭猜测")
    // 入口壳只含 SKILL.md，不携带 references，避免未激活目录读到正文流程
    expect(existsSync(join(gatedDir, "references"))).toBe(false)
    expect(stateEntries(primaryDir(), "gate")).toContain("fxri-plan-to-task")
  })

  it("include / exclude 规则裁剪接管范围", () => {
    const report = installSkills({ gate: { include: ["fxri-*"], exclude: ["fxri-text-encoding"] } })
    const primary = primaryTarget(report)
    expect(primary.gates).toContain("fxri-plan-to-task")
    expect(primary.gates).not.toContain("fxri-text-encoding")
  })

  it("技能声明 metadata.gate: false 时退出接管", () => {
    expect(isSkillGated("fxri-plan-to-task", false, { include: ["*"], exclude: [] })).toBe(false)
    expect(isSkillGated("fxri-plan-to-task", undefined, { include: ["fxri-*"], exclude: [] })).toBe(true)
    expect(isSkillGated("fxri-plan-to-task", undefined, { include: ["*"], exclude: ["fxri-plan-*"] })).toBe(false)
  })

  it("metadata.gate 非法值告警一次并按未声明处理", () => {
    const root = mkdtempSync(join(tmpdir(), "tk-gate-root-"))
    mkdirSync(join(root, "skills", "bad-gate"), { recursive: true })
    writeFileSync(
      join(root, "skills", "bad-gate", "SKILL.md"),
      ["---", "name: bad-gate", "metadata:", "  version: 1.0.0", "  gate: no", "---", "", "# 演示", ""].join("\n"),
    )
    setPackageRootForTest(root)
    resetSkillGateWarnings()
    const warn = vi.mocked(console.warn)
    warn.mockClear()
    expect(listPackageSkills()[0]?.gate).toBeUndefined()
    const hits = () => warn.mock.calls.filter((call) => String(call[0]).includes("metadata.gate 非法")).length
    expect(hits()).toBe(1)
    listPackageSkills()
    expect(hits()).toBe(1)
    rmSync(root, { recursive: true, force: true })
  })

  it("重复开启幂等：同一内容跳过，不重写产物", () => {
    installSkills({ gate: true })
    const again = installSkills({ gate: true })
    expect(primaryTarget(again).skipped).toEqual(expect.arrayContaining(ALL_SKILLS))
    expect(primaryTarget(again).gates).toEqual(expect.arrayContaining(ALL_SKILLS))
  })

  it("--embed 回退全文、再次开启往返稳定", () => {
    installSkills({ gate: true })
    const embedded = installSkills({ gate: false })
    expect(primaryTarget(embedded).gates).toEqual([])
    expect(lstatSync(join(primaryDir(), "fxri-plan-to-task")).isSymbolicLink()).toBe(true)
    const regated = installSkills({ gate: true })
    expect(primaryTarget(regated).gates).toEqual(expect.arrayContaining(ALL_SKILLS))
    expect(stateEntries(primaryDir(), "gate")).toEqual(expect.arrayContaining(ALL_SKILLS))
  })

  it("失效外部来源安装时跳过并告警", () => {
    writeFileSync(
      join(home, ".toolkitrc.json"),
      JSON.stringify({ skillsInstall: { sources: { gone: { root: join(home, "missing-source") } } } }),
    )
    resetToolkitConfigCache()
    const warn = vi.mocked(console.warn)
    warn.mockClear()
    const report = installSkills({ skills: ["fxri-plan-to-task"], gate: false })
    expect(report.skills).toContain("fxri-plan-to-task")
    expect(warn.mock.calls.some((call) => String(call[0]).includes("跳过失效的外部来源"))).toBe(true)
  })

  it("status 将入口壳单列为 gate 形态且不计入问题", () => {
    installSkills({ gate: true })
    const primary = skillsStatus().targets.find((t) => t.dir === primaryDir())
    const item = primary?.items.find((i) => i.name === "fxri-plan-to-task")
    expect(item?.state).toBe("gate")
  })

  it("闸门开关随安装成功落盘，预演不写", () => {
    installSkills({ gate: true, dryRun: true })
    expect(readSkillsInstallConfig().gate).toBeUndefined()
    installSkills({ gate: true })
    expect(readSkillsInstallConfig().gate).toBe(true)
    installSkills({ gate: false })
    expect(readSkillsInstallConfig().gate).toBe(false)
  })

  it("入口壳内容过期时 status 报 gate-drift，重跑 install 恢复", () => {
    installSkills({ gate: true })
    const file = join(primaryDir(), "fxri-plan-to-task", "SKILL.md")
    writeFileSync(file, `${readFileSync(file, "utf8")}<!-- 过期 -->\n`, "utf8")
    const stateOf = (name: string) =>
      skillsStatus().targets.find((target) => target.dir === primaryDir())?.items.find((item) => item.name === name)?.state
    expect(stateOf("fxri-plan-to-task")).toBe("gate-drift")
    installSkills({ gate: true })
    expect(stateOf("fxri-plan-to-task")).toBe("gate")
  })

  it("卸载按归属清理入口壳目录", () => {
    installSkills({ gate: true })
    removeSkills()
    for (const name of ALL_SKILLS) expect(existsSync(join(primaryDir(), name))).toBe(false)
    expect(existsSync(skillsStateFile())).toBe(false)
  })

  it("闸门开启时 autoLink 不改写入口壳", () => {
    installSkills({ gate: true })
    const before = readFileSync(join(primaryDir(), "fxri-plan-to-task", "SKILL.md"), "utf8")
    // 自愈只处理 mode=link 的登记条目，入口壳不在其范围
    expect(readSkillsState()?.sources.toolkit?.targets.some((t) => t.entries.some((e) => e.mode === "gate"))).toBe(true)
    expect(autoLinkSkills()).toBe(0)
    expect(readFileSync(join(primaryDir(), "fxri-plan-to-task", "SKILL.md"), "utf8")).toBe(before)
  })
})

describe("guard 契约", () => {
  // 捕获 stdout / stderr 输出，避免污染测试报告
  function capture() {
    const out: string[] = []
    const err: string[] = []
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      err.push(String(chunk))
      return true
    })
    // console.error 走 stderr 流，同样收进缓冲
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      err.push(args.map(String).join(" "))
    })
    return { out: () => out.join(""), err: () => err.join("\n") }
  }

  it("未配置作用域时输出包内正文，参考目录走 stderr", () => {
    const io = capture()
    const code = runGuard("fxri-plan-to-task")
    expect(code).toBe(0)
    expect(io.out()).toBe(readFileSync(join(skillsSourceDir(), "fxri-plan-to-task", "SKILL.md"), "utf8"))
    expect(io.err()).toContain("参考文件目录")
  })

  it("未激活时退出码 3 且 stdout 为空", () => {
    writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify({ activation: { mode: "allowlist", include: ["Z:/definitely-not-here/**"] } }))
    resetToolkitConfigCache()
    const io = capture()
    const code = runGuard("fxri-plan-to-task")
    expect(code).toBe(3)
    expect(io.out()).toBe("")
    expect(io.err()).toContain("未在当前目录激活")
  })

  it("未知技能与路径穿越均拒绝，退出码 1", () => {
    const io = capture()
    expect(runGuard("no-such-skill")).toBe(1)
    expect(runGuard("../package")).toBe(1)
    expect(io.err()).toContain("技能名非法")
  })

  it("外部来源技能按状态文件登记解析正文", () => {
    const pkgRoot = mkdtempSync(join(tmpdir(), "tk-gate-pkg-"))
    mkdirSync(join(pkgRoot, "skills"), { recursive: true })
    setPackageRootForTest(pkgRoot)
    const sourceRoot = mkdtempSync(join(tmpdir(), "tk-gate-ext-"))
    mkdirSync(join(sourceRoot, "ext-skill"), { recursive: true })
    const body = "# 外部技能\n\n正文\n"
    writeFileSync(join(sourceRoot, "ext-skill", "SKILL.md"), body)
    mkdirSync(join(home, ".agents"), { recursive: true })
    writeFileSync(
      skillsStateFile(),
      JSON.stringify({
        format: "fxri.toolkit.skills-state",
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        sources: { ext: { kind: "local", version: "1.0.0", temporary: false, root: sourceRoot, targets: [] } },
      }),
    )
    const io = capture()
    expect(runGuard("ext-skill")).toBe(0)
    expect(io.out()).toBe(body)
    rmSync(pkgRoot, { recursive: true, force: true })
    rmSync(sourceRoot, { recursive: true, force: true })
  })
})
