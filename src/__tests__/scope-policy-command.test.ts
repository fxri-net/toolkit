// 策略写命令计划层：新增 / 移除 / 清除 / 档案与技能快捷视图的校验与落盘结果
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resetToolkitConfigCache, setHomeDirForTest } from "../config"
import {
  applyPolicyPlan,
  listProfilesInLayer,
  planPolicyAdd,
  planPolicyRemove,
  planPolicyReset,
  planProfileRemove,
  planProfileUpsert,
  planSkillReset,
  profileAllowPatterns,
  readPolicyState,
} from "../scope/edit-policy"
import { resetScopeCache } from "../scope/load"

let home = ""
let project = ""

function writeGlobal(config: unknown): void {
  writeFileSync(join(home, ".toolkitrc.json"), JSON.stringify(config))
}

function writeProject(config: unknown): void {
  writeFileSync(join(project, ".toolkitrc.json"), JSON.stringify(config))
}

function writeLocal(config: unknown): void {
  writeFileSync(join(project, ".toolkitrc.local.json"), JSON.stringify(config))
}

function readGlobal(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(home, ".toolkitrc.json"), "utf8")) as Record<string, unknown>
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "scope-policy-command-"))
  project = join(home, "repo")
  mkdirSync(join(project, ".tasks"), { recursive: true })
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

describe("planPolicyAdd", () => {
  it("生成不可变 id 并写入条件与技能维度", () => {
    const plan = planPolicyAdd(readPolicyState("global", project), {
      effect: "allow",
      name: "demo",
      when: { paths: ["/work/**"] },
      skills: { mode: "allowlist", allow: ["fxri-plan-review"] },
    })
    expect(plan.changed).toBe(true)
    const details = plan.details.join("\n")
    expect(details).toContain("效果：allow")
    expect(details).toContain("paths=/work/**")
    expect(details).toContain("mode=allowlist")
    expect(details).toContain("allow=fxri-plan-review")
    applyPolicyPlan(plan)
    const saved = readGlobal()
    const policies = saved.policies as Array<Record<string, unknown>>
    expect(policies).toHaveLength(1)
    expect(policies[0]!.id).toMatch(/^policy-/)
    expect(policies[0]!.name).toBe("demo")
    expect(policies[0]!.layer).toBeUndefined()
    expect(policies[0]!.when).toEqual({ paths: ["/work/**"] })
    expect(policies[0]!.skills).toEqual({ mode: "allowlist", allow: ["fxri-plan-review"] })
  })

  it("id 重复时跨层报错", () => {
    writeProject({ policies: [{ id: "team-only", effect: "deny" }] })
    resetToolkitConfigCache()
    expect(() => planPolicyAdd(readPolicyState("global", project), { id: "team-only", effect: "allow" })).toThrow(
      "已存在于 project 层",
    )
    writeGlobal({ policies: [{ id: "dup", effect: "allow" }] })
    resetToolkitConfigCache()
    expect(() => planPolicyAdd(readPolicyState("global", project), { id: "dup", effect: "allow" })).toThrow(
      "已存在于 global 层",
    )
  })

  it("deny 未限定技能时要求 --yes，带技能选择器时不要求", () => {
    const state = readPolicyState("global", project)
    expect(planPolicyAdd(state, { effect: "deny", when: { paths: ["/x"] } }).requiresYes).toBe(true)
    expect(planPolicyAdd(state, { effect: "deny", skills: { match: ["fxri-plan-review"] } }).requiresYes).toBe(false)
  })

  it("未知档案 / 未知技能 / 非法模式均拒绝写入", () => {
    const state = readPolicyState("global", project)
    expect(() => planPolicyAdd(state, { effect: "allow", skills: { profiles: ["missing"] } })).toThrow("未找到档案")
    expect(() => planPolicyAdd(state, { effect: "allow", skills: { allow: ["ghost-skill"] } })).toThrow("未找到技能")
    expect(() => planProfileUpsert(state, { name: "front", allow: ["ghost-skill"] })).toThrow("未找到技能")
    expect(() => planPolicyAdd(state, { effect: "allow", when: { paths: ["re:("] } })).toThrow("非法")
  })

  it("id 含空白或 legacy: 前缀时拒绝写入", () => {
    const state = readPolicyState("global", project)
    expect(() => planPolicyAdd(state, { id: "bad id", effect: "allow" })).toThrow("空白")
    expect(() => planPolicyAdd(state, { id: "legacy:mine", effect: "allow" })).toThrow("legacy:")
  })

  it("空条件与无效技能模式给出告警", () => {
    const state = readPolicyState("global", project)
    const plan = planPolicyAdd(state, { effect: "allow", skills: { allow: ["fxri-*"] } })
    expect(plan.warnings.join("\n")).toContain("兜底规则")
    expect(plan.warnings.join("\n")).toContain("仅在 --mode allowlist 下生效")
    const empty = planPolicyAdd(state, { effect: "allow", skills: { mode: "allowlist" } })
    expect(empty.warnings.join("\n")).toContain("不允许任何技能")
  })
})

describe("planPolicyRemove / planPolicyReset", () => {
  it("按 id 与唯一名称移除，同名歧义要求 --id", () => {
    writeGlobal({
      policies: [
        { id: "a", name: "same", effect: "allow" },
        { id: "b", name: "same", effect: "allow" },
        { id: "c", name: "unique", effect: "allow" },
      ],
    })
    const state = readPolicyState("global", project)
    expect(() => planPolicyRemove(state, { name: "same" }, true)).toThrow("多个同名")
    const byName = planPolicyRemove(state, { name: "unique" }, true)
    expect(byName.changes[0]).toContain("unique")
    const byId = planPolicyRemove(state, { id: "a" }, true)
    expect(byId.nextConfig.policies).toHaveLength(2)
  })

  it("跨层同名且未显式 --layer 时拒绝按名称删除", () => {
    writeGlobal({ policies: [{ id: "g", name: "team", effect: "allow" }] })
    writeProject({ policies: [{ id: "p", name: "team", effect: "allow" }] })
    resetToolkitConfigCache()
    expect(() => planPolicyRemove(readPolicyState("global", project), { name: "team" }, false)).toThrow(
      "请显式指定 --layer",
    )
    expect(planPolicyRemove(readPolicyState("global", project), { name: "team" }, true).changed).toBe(true)
  })

  it("按路径与 --all 清除，--all 未确认时拒绝，旧 activation 不受影响", () => {
    writeGlobal({
      activation: { mode: "all" },
      policies: [
        { id: "a", when: { paths: ["/x"] }, effect: "allow" },
        { id: "b", when: { paths: ["/y"] }, effect: "allow" },
      ],
    })
    const state = readPolicyState("global", project)
    const byPath = planPolicyReset(state, { paths: ["/x"], confirmed: true })
    expect(byPath.nextConfig.policies).toHaveLength(1)
    expect(byPath.changes.join("\n")).toContain("activation")
    expect(() => planPolicyReset(state, { all: true, confirmed: false })).toThrow("--yes")
    const cleared = planPolicyReset(state, { all: true, confirmed: true })
    expect(cleared.nextConfig.policies).toBeUndefined()
    expect(cleared.nextConfig.activation).toEqual({ mode: "all" })
    expect(() => planPolicyReset(state, { confirmed: true })).toThrow("请指定")
  })

  it("技能维度清除只删带 skills 的策略", () => {
    writeGlobal({
      policies: [
        { id: "path", when: { paths: ["/x"] }, effect: "allow" },
        { id: "skill", skills: { mode: "allowlist", allow: ["fxri-*"] }, effect: "allow" },
      ],
    })
    const state = readPolicyState("global", project)
    expect(() => planSkillReset(state, false)).toThrow("--yes")
    const plan = planSkillReset(state, true)
    const policies = plan.nextConfig.policies as Array<Record<string, unknown>>
    expect(policies).toHaveLength(1)
    expect(policies[0]!.id).toBe("path")
  })
})

describe("档案与快捷视图", () => {
  it("档案整份写入与移除", () => {
    const state = readPolicyState("global", project)
    const upsert = planProfileUpsert(state, { name: "front", allow: ["fxri-*"] })
    expect(upsert.details.join("\n")).toContain("allow：fxri-*")
    expect(upsert.details.join("\n")).toContain("deny：无")
    applyPolicyPlan(upsert)
    expect(readGlobal().skillProfiles).toEqual({ front: { allow: ["fxri-*"] } })
    expect(() => planProfileUpsert(readPolicyState("global", project), { name: "front" })).toThrow("至少提供")
    const removed = planProfileRemove(readPolicyState("global", project), "front")
    expect(removed.nextConfig.skillProfiles).toBeUndefined()
  })

  it("档案写入未提供的名单会告警并展示清空结果", () => {
    writeGlobal({ skillProfiles: { front: { allow: ["fxri-plan-review"], deny: ["fxri-text-encoding"] } } })
    const plan = planProfileUpsert(readPolicyState("global", project), {
      name: "front",
      allow: ["fxri-plan-to-task"],
    })
    expect(plan.warnings.join("\n")).toContain("将清空原 deny")
    expect(plan.details.join("\n")).toContain("deny：无")
  })

  it("allowlist 引用无 allow 项档案与 deny 展开给出定向提示", () => {
    writeGlobal({ skillProfiles: { denyOnly: { deny: ["fxri-plan-review"] } } })
    const state = readPolicyState("global", project)
    const plan = planPolicyAdd(state, {
      effect: "allow",
      skills: { mode: "allowlist", profiles: ["denyOnly"] },
    })
    expect(plan.warnings.join("\n")).toContain("没有 allow 项")
    expect(() => profileAllowPatterns(project, ["denyOnly"], "global")).toThrow("没有允许项")
  })

  it("移除档案时提示引用与同名回退", () => {
    writeGlobal({
      skillProfiles: { front: { allow: ["fxri-*"] } },
      policies: [{ id: "use-front", name: "使用档案", skills: { mode: "allowlist", profiles: ["front"] } }],
    })
    writeProject({ skillProfiles: { front: { allow: ["fxri-a"] } } })
    resetToolkitConfigCache()
    const plan = planProfileRemove(readPolicyState("global", project), "front")
    const warnings = plan.warnings.join("\n")
    expect(warnings).toContain("仍被 1 条策略引用")
    expect(warnings).toContain("use-front")
    expect(warnings).toContain("回落到")
    expect(plan.changed).toBe(true)
  })

  it("档案允许项展开用于技能排除", () => {
    writeGlobal({ skillProfiles: { front: { allow: ["fxri-a", "fxri-b"] } } })
    expect(profileAllowPatterns(project, ["front"], "global")).toEqual(["fxri-a", "fxri-b"])
    expect(() => profileAllowPatterns(project, ["missing"], "global")).toThrow("未找到档案")
  })

  it("按层列出档案，未传层由命令使用合并视图", () => {
    writeGlobal({ skillProfiles: { front: { allow: ["fxri-*"] } } })
    writeProject({ skillProfiles: { team: { deny: ["fxri-plan-review"] } } })
    resetToolkitConfigCache()
    expect(listProfilesInLayer(readPolicyState("global", project))).toEqual([
      { name: "front", allow: ["fxri-*"], deny: [] },
    ])
    expect(listProfilesInLayer(readPolicyState("project", project))).toEqual([
      { name: "team", allow: [], deny: ["fxri-plan-review"] },
    ])
  })

  it("策略只能引用同层及更低层定义的档案", () => {
    writeProject({ skillProfiles: { projectOnly: { allow: ["fxri-*"] } } })
    resetToolkitConfigCache()
    expect(() =>
      planPolicyAdd(readPolicyState("global", project), {
        effect: "allow",
        skills: { mode: "allowlist", profiles: ["projectOnly"] },
      }),
    ).toThrow("project 层")
    expect(
      planPolicyAdd(readPolicyState("project", project), {
        effect: "allow",
        skills: { mode: "allowlist", profiles: ["projectOnly"] },
      }).changed,
    ).toBe(true)

    writeLocal({ skillProfiles: { localOnly: { allow: ["fxri-*"] } } })
    resetToolkitConfigCache()
    expect(() =>
      planPolicyAdd(readPolicyState("project", project), {
        effect: "allow",
        skills: { mode: "allowlist", profiles: ["localOnly"] },
      }),
    ).toThrow("local 层")

    writeGlobal({ skillProfiles: { shared: { allow: ["fxri-*"] } } })
    resetToolkitConfigCache()
    expect(
      planPolicyAdd(readPolicyState("project", project), {
        effect: "allow",
        skills: { mode: "allowlist", profiles: ["shared"] },
      }).changed,
    ).toBe(true)
  })

  it("项目层不可写时给出原因并拒绝", () => {
    const loose = join(home, "loose")
    mkdirSync(loose, { recursive: true })
    expect(() => readPolicyState("project", loose)).toThrow("未写入配置")
  })
})
