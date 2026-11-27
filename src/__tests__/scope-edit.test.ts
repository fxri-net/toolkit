// scope 写命令计划：相对基准、白黑互转、移除 / 转入、默认值与清除、denylist 兼容
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { setHomeDirForTest } from "../config"
import { applyPlan, describePlan, modeLabel, planAdd, planDefault, planRemove, planReset, readScopeState } from "../scope/edit"
import { isLiteralPath, toTreePattern } from "../scope/paths"
import { tempDir } from "./helpers"

let home = ""
let root = ""
let sub = ""
let configFile = ""

function seed(activation: Record<string, unknown>): void {
  writeFileSync(configFile, `${JSON.stringify({ activation }, null, 2)}\n`)
}

function readActivation(): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(configFile, "utf8")) as { activation: Record<string, unknown> }
  return parsed.activation
}

beforeEach(() => {
  home = tempDir("fxts-tk-scope-edit-")
  setHomeDirForTest(home)
  root = join(home, "repo")
  sub = join(root, "sub")
  configFile = join(root, ".toolkitrc.json")
  mkdirSync(join(root, ".git"), { recursive: true })
  mkdirSync(sub, { recursive: true })
  seed({
    mode: "all",
    include: [],
    exclude: [],
    markers: { include: ["AGENTS.md"], exclude: [] },
    gitRemotes: ["github.com/acme/**"],
  })
})

afterEach(() => {
  setHomeDirForTest(undefined)
  rmSync(home, { recursive: true, force: true })
})

describe("加入白 / 黑名单", () => {
  it("项目层相对路径按项目根解析，加入白名单切换默认值", () => {
    const plan = planAdd(readScopeState("project", sub), "include", ["work"], sub)
    expect(plan.nextInclude).toEqual([resolve(root, "work")])
    expect(plan.nextMode).toBe("allowlist")
    expect(plan.changed).toBe(true)
  })

  it("同路径已在黑名单时就地互转", () => {
    seed({ mode: "all", include: [], exclude: [resolve(root, "work")] })
    const plan = planAdd(readScopeState("project", sub), "include", ["work"], sub)
    expect(plan.nextExclude).toEqual([])
    expect(plan.nextInclude).toEqual([resolve(root, "work")])
    expect(plan.changes.join("\n")).toContain("移入：[白]")
  })

  it("加入黑名单保持默认值不变", () => {
    const plan = planAdd(readScopeState("project", sub), "exclude", ["legacy"], sub)
    expect(plan.nextMode).toBe("all")
    expect(plan.nextExclude).toEqual([resolve(root, "legacy")])
    expect(plan.changes.join("\n")).toContain("新增：[黑]")
  })

  it("tree 模式把裸目录扩为 /**，已含通配符的保持不变", () => {
    const plan = planAdd(readScopeState("project", sub), "include", ["work"], sub, true)
    expect(plan.nextInclude).toEqual([toTreePattern(resolve(root, "work"))])
    expect(plan.nextInclude[0]?.endsWith("/**")).toBe(true)
  })
})

describe("目录覆盖规则", () => {
  it("裸路径补 /**，已含通配符或 re: 原样保留", () => {
    expect(toTreePattern("/work")).toBe("/work/**")
    expect(toTreePattern("/work/")).toBe("/work/**")
    expect(toTreePattern("/work/**")).toBe("/work/**")
    expect(toTreePattern("re:^/work$")).toBe("re:^/work$")
  })

  it("字面路径判定：通配符与 re: 规则不做存在性检查", () => {
    expect(isLiteralPath("D:/Work/Dev-Space")).toBe(true)
    expect(isLiteralPath("D:/Work/Dev-Space/**")).toBe(false)
    expect(isLiteralPath("D:/Work/Dev-Space/*")).toBe(false)
    expect(isLiteralPath("re:^/work$")).toBe(false)
  })
})

describe("移除与互转", () => {
  it("默认从两列表同时移除", () => {
    const include = resolve(root, "a")
    const exclude = resolve(root, "b")
    seed({ mode: "allowlist", include: [include], exclude: [exclude] })
    const plan = planRemove(readScopeState("project", sub), ["a", "b"], { from: "both", startDir: sub })
    expect(plan.nextInclude).toEqual([])
    expect(plan.nextExclude).toEqual([])
    expect(plan.changes.join("\n")).toContain("移除：[白]")
    expect(plan.changes.join("\n")).toContain("移除：[黑]")
  })

  it("指定来源侧并转入另一侧", () => {
    const include = resolve(root, "a")
    seed({ mode: "allowlist", include: [include], exclude: [] })
    const plan = planRemove(readScopeState("project", sub), ["a"], { from: "include", to: "exclude", startDir: sub })
    expect(plan.nextInclude).toEqual([])
    expect(plan.nextExclude).toEqual([include])
    expect(plan.changes.join("\n")).toContain("转入：[黑]")
  })
})

describe("默认值与清除限制", () => {
  it("切换为仅名单内生效时，空白名单给出警告并落盘", () => {
    const state = readScopeState("project", sub)
    const plan = planDefault(state, false)
    expect(plan.nextMode).toBe("allowlist")
    expect(plan.warnings.join("\n")).toContain("白名单为空")
    applyPlan(plan)
    const activation = readActivation()
    expect(activation.mode).toBe("allowlist")
    expect(activation.markers).toEqual({ include: ["AGENTS.md"], exclude: [] })
    expect(activation.gitRemotes).toEqual(["github.com/acme/**"])
  })

  it("清除限制清空两列表并保留标记 / 远端", () => {
    seed({ mode: "allowlist", include: [resolve(root, "a")], exclude: [resolve(root, "b")], markers: { include: ["AGENTS.md"], exclude: [] } })
    const plan = planReset(readScopeState("project", sub))
    applyPlan(plan)
    const activation = readActivation()
    expect(activation.mode).toBe("all")
    expect(activation.include).toEqual([])
    expect(activation.exclude).toEqual([])
    expect(activation.markers).toEqual({ include: ["AGENTS.md"], exclude: [] })
  })

  it("无变化时不落盘，只提示", () => {
    const plan = planReset(readScopeState("project", sub))
    expect(plan.changed).toBe(false)
    expect(describePlan(plan)).toEqual(["没有变化，无需写入"])
  })
})

describe("denylist 兼容", () => {
  it("兼容读为 all，写入时归一并在预览中说明", () => {
    seed({ mode: "denylist", include: [], exclude: [] })
    const state = readScopeState("project", sub)
    expect(state.mode).toBe("all")
    expect(state.legacyDenylist).toBe(true)
    const plan = planAdd(state, "exclude", ["legacy"], sub)
    expect(plan.warnings.join("\n")).toContain("denylist 归一为 all")
    applyPlan(plan)
    expect(readActivation().mode).toBe("all")
  })

  it("默认值人读文案固定", () => {
    expect(modeLabel("all")).toBe("全部生效")
    expect(modeLabel("allowlist")).toBe("仅名单内生效")
  })
})
