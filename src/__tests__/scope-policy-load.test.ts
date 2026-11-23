// 策略配置加载：三层合并、档案覆盖、旧字段编译、非法项剔除与父目录继承
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import { resetScopeCache, resolveScope } from "../scope/load"
import { isLegacyPolicyId, readPolicyStats, resetPolicyStats } from "../scope/policy"

let home = ""
let project = ""
let personal = ""

// 配置里的路径统一用正斜杠书写，跨平台由匹配层归一
function posix(path: string): string {
  return path.replace(/\\/g, "/")
}

function writeGlobal(config: unknown): void {
  writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify(config))
}

function writeProject(config: unknown, dir = project): void {
  writeFileSync(join(dir, ".toolkitrc.json"), JSON.stringify(config))
}

function writeLocal(config: unknown, dir = project): void {
  writeFileSync(join(dir, ".toolkitrc.local.json"), JSON.stringify(config))
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "scope-policy-home-"))
  project = join(home, "work", "repo")
  personal = join(home, "personal")
  mkdirSync(project, { recursive: true })
  mkdirSync(personal, { recursive: true })
  setHomeDirForTest(home)
  resetToolkitConfigCache()
  resetScopeCache()
})

afterEach(() => {
  setHomeDirForTest(undefined)
  resetToolkitConfigCache()
  resetScopeCache()
  rmSync(home, { recursive: true, force: true })
})

describe("resolveScope 策略合并", () => {
  it("策略形态进入判定结论，非法取值与拒绝 + 全文互斥均告警剔除", () => {
    writeProject({
      policies: [
        { id: "shape", when: { paths: [posix(project)] }, effect: "allow", delivery: "gated" },
        { id: "bad", when: { paths: [posix(project)] }, effect: "allow", delivery: "half" },
        { id: "conflict", when: { paths: [posix(project)] }, effect: "deny", delivery: "full" },
      ],
    })
    const report = resolveScope(project)
    expect(report.policies.find((policy) => policy.id === "shape")?.delivery).toBe("gated")
    expect(report.policies.find((policy) => policy.id === "bad")?.delivery).toBeUndefined()
    expect(report.policies.find((policy) => policy.id === "conflict")?.delivery).toBeUndefined()
    // 同具体度下拒绝胜出，本目录形态为不安装
    expect(report.decision.delivery).toBe("off")
    const warnings = report.warnings.join("\n")
    expect(warnings).toContain("delivery 非法")
    expect(warnings).toContain("拒绝的规则不能声明全文")
  })
  it("全局策略 + 项目覆盖 + 本地最高", () => {
    writeGlobal({ policies: [{ id: "global-deny", when: { paths: [`${posix(home)}/**`] }, effect: "deny" }] })
    writeProject({ policies: [{ id: "project-allow", when: { paths: [posix(project)] }, effect: "allow" }] })
    const projectReport = resolveScope(project)
    expect(projectReport.decision.active).toBe(true)
    expect(projectReport.decision.matchedRule).toContain("policy:project-allow")
    expect(projectReport.policies.map((policy) => policy.layer)).toEqual(
      expect.arrayContaining(["global", "project"]),
    )

    writeLocal({ policies: [{ id: "local-deny", when: { paths: [posix(project)] }, effect: "deny" }] })
    const localReport = resolveScope(project)
    expect(localReport.decision.active).toBe(false)
    expect(localReport.decision.matchedRule).toContain("policy:local-deny")
  })

  it("同名档案按最近层整份覆盖", () => {
    writeGlobal({
      skillProfiles: { front: { allow: ["global-*"] } },
      policies: [{ id: "use-front", skills: { mode: "allowlist", profiles: ["front"] } }],
    })
    writeProject({ skillProfiles: { front: { allow: ["project-*"] } } })
    const allowed = resolveScope(project, "project-vue")
    expect(allowed.decision.active).toBe(true)
    expect(allowed.profiles).toHaveLength(1)
    expect(allowed.profiles[0]).toMatchObject({ name: "front", allow: ["project-*"], layer: "project" })
    // 整份覆盖：全局档案的允许项不再生效
    expect(resolveScope(project, "global-vue").decision.active).toBe(false)
  })

  it("项目层旧 activation 覆盖全局新策略", () => {
    writeGlobal({ policies: [{ id: "global-deny", effect: "deny" }] })
    writeProject({ activation: { mode: "allowlist", include: [posix(project)] } })
    const report = resolveScope(project)
    expect(report.decision.active).toBe(true)
    expect(report.policies.some((policy) => isLegacyPolicyId(policy.id))).toBe(true)
  })

  it("全局旧 activation 被项目新策略覆盖", () => {
    writeGlobal({ activation: { mode: "allowlist", include: [`${posix(home)}/personal/**`] } })
    writeProject({ policies: [{ id: "project-allow", when: { paths: [posix(project)] }, effect: "allow" }] })
    const report = resolveScope(project)
    expect(report.decision.active).toBe(true)
    expect(report.decision.matchedRule).toContain("policy:project-allow")
  })

  it("父目录 glob 自动覆盖兄弟项目与新建目录", () => {
    const work = join(home, "work")
    const first = join(work, "a")
    const second = join(work, "b")
    mkdirSync(first, { recursive: true })
    mkdirSync(second, { recursive: true })
    writeGlobal({
      policies: [
        { id: "deny-all", effect: "deny" },
        { id: "work-allow", when: { paths: [`${posix(work)}/**`] }, effect: "allow" },
      ],
    })
    expect(resolveScope(first).decision.active).toBe(true)
    expect(resolveScope(second).decision.active).toBe(true)
    // 新建目录无需重新配置，父目录 glob 自动命中
    const fresh = join(work, "new-project")
    mkdirSync(fresh, { recursive: true })
    expect(resolveScope(fresh).decision.active).toBe(true)
    expect(resolveScope(personal).decision.active).toBe(false)
  })
})

describe("resolveScope 策略校验", () => {
  it("非法项告警剔除，id 重名与缺省 id 按规则处理", () => {
    writeGlobal({
      policies: [
        "not-an-object",
        { id: "dup", name: "first", effect: "deny" },
        { id: "dup", name: "second", effect: "allow" },
        { id: "bad-effect", effect: "maybe" },
        { id: "bad-path", when: { paths: ["re:("] }, effect: "deny" },
        { name: "no-id", when: { paths: [posix(project)] }, effect: "allow" },
        { id: "unknown-profile", skills: { profiles: ["missing"] } },
        { id: "bad-when", when: "oops", effect: "deny" },
        { id: "bad-markers", when: { markers: "m" }, effect: "deny" },
        { id: "bad-mode", skills: { mode: "sometimes" } },
        { id: "with-layer", layer: "local", effect: "deny" },
        { id: "bad-name", name: 3, effect: "deny" },
        { id: "empty-list", when: { paths: [] }, effect: "deny" },
      ],
    })
    const report = resolveScope(project)
    const text = report.warnings.join("\n")
    expect(text).toContain("须为对象")
    expect(text).toContain("id 重复")
    expect(text).toContain("effect 非法")
    expect(text).toContain("模式「re:(」已忽略")
    expect(text).toContain("缺少 id")
    expect(text).toContain("档案「missing」不存在")
    expect(text).toContain("兜底规则")
    expect(text).toContain("由配置文件所在层决定")
    // 同层同 id 保留后写；非法 effect / 模式 / 条件形态使整条策略作废
    expect(report.policies.find((policy) => policy.id === "dup")?.name).toBe("second")
    expect(report.policies.some((policy) => policy.id === "bad-effect")).toBe(false)
    expect(report.policies.some((policy) => policy.id === "bad-path")).toBe(false)
    expect(report.policies.some((policy) => policy.id === "bad-when")).toBe(false)
    expect(report.policies.some((policy) => policy.id === "bad-markers")).toBe(false)
    expect(report.policies.some((policy) => policy.id === "bad-mode")).toBe(false)
    expect(report.policies.some((policy) => policy.id.startsWith("auto:global:"))).toBe(true)
  })

  it("未知档案引用剔除后 allowlist 按失败关闭拒绝", () => {
    writeGlobal({
      policies: [{ id: "unknown-profile", skills: { mode: "allowlist", profiles: ["missing"] } }],
    })
    const report = resolveScope(project, "fxri-vue")
    expect(report.warnings.join("\n")).toContain("档案「missing」不存在")
    expect(report.decision.active).toBe(false)
  })

  it("手写策略 id 含空白或 legacy 前缀时派生 auto id", () => {
    writeGlobal({
      policies: [
        { id: "bad id", when: { paths: [posix(project)] }, effect: "allow" },
        { id: "legacy:mine", when: { paths: [posix(project)] }, effect: "deny" },
      ],
    })
    const report = resolveScope(project)
    expect(report.warnings.join("\n")).toContain("id 非法")
    expect(report.policies).toHaveLength(2)
    expect(report.policies.every((policy) => policy.id.startsWith("auto:global:"))).toBe(true)
  })

  it("手写跨层档案引用告警但保留当前项目解析", () => {
    writeProject({ skillProfiles: { projectOnly: { allow: ["fxri-*"] } } })
    writeGlobal({
      policies: [{ id: "global-use-project", skills: { mode: "allowlist", profiles: ["projectOnly"] } }],
    })
    const report = resolveScope(project, "fxri-plan-review")
    expect(report.warnings.join("\n")).toContain("无法稳定引用")
    expect(report.decision.active).toBe(true)
  })

  it("非数组 policies 与空档案名告警忽略", () => {
    writeGlobal({
      policies: {},
      skillProfiles: { " ": { allow: ["fxri-*"] }, bad: { allow: ["re:("] } },
    })
    const report = resolveScope(project)
    const text = report.warnings.join("\n")
    expect(text).toContain("policies 须为数组")
    expect(text).toContain("空档案名")
    expect(text).toContain("档案 bad 含非法模式")
    expect(report.policies).toHaveLength(0)
    expect(report.profiles).toHaveLength(0)
    expect(report.decision.active).toBe(true)
  })

  it("200 条策略加载与缓存判定在宽松预算内", () => {
    const policies = Array.from({ length: 200 }, (_, index) => ({
      id: `p${index}`,
      when: { paths: [`${posix(home)}/work/**`] },
      effect: index % 2 === 0 ? "deny" : "allow",
    }))
    writeGlobal({ policies })
    const started = Date.now()
    const report = resolveScope(project)
    expect(report.policies).toHaveLength(200)
    expect(Date.now() - started).toBeLessThan(3000)
    // 同一现场重复判定命中进程内快照：不再编译正则、不再预计算与排序
    resetPolicyStats()
    const cachedStart = Date.now()
    for (let index = 0; index < 100; index += 1) resolveScope(project)
    expect(Date.now() - cachedStart).toBeLessThan(3000)
    expect(readPolicyStats()).toEqual({ compiles: 0, sorts: 0 })
  })
})
