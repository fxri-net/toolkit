// 作用域策略内核：条件组合、优先级、覆盖语义、技能名单、旧字段对拍与性能约束
import { describe, expect, it } from "vitest"
import {
  compilePolicies,
  decidePolicy,
  isLegacyPolicyId,
  legacyToPolicies,
  readPolicyStats,
  resetPolicyStats,
  type CompileOptions,
  type ScopePolicyInput,
} from "../scope/policy"
import type { ActivationConfig, PolicyLayer, ScopeContext } from "../scope/types"

// 夹具路径不落在真实文件系统，避免 macOS / Windows 把前缀改写
const ROOT = "/tk-policy/project"
const SUB = `${ROOT}/src`

// 构造判定现场：默认 POSIX 路径、无 git 远端、无 marker
function context(overrides: Partial<ScopeContext> = {}): ScopeContext {
  return {
    cwd: ROOT,
    baseDir: ROOT,
    gitRoot: ROOT,
    gitRemote: null,
    markers: new Set<string>(),
    ...overrides,
  }
}

// 编译并判定：缺省按项目层、自动补 id
function decide(policies: ScopePolicyInput[], view = context(), options: CompileOptions = {}) {
  const inputs = policies.map((policy, index) => ({
    ...policy,
    id: policy.id || `p${index}`,
    layer: policy.layer ?? ("project" as PolicyLayer),
  }))
  return decidePolicy(compilePolicies(inputs, ROOT, options), view)
}

// 构造旧字段配置：未写字段取默认值
function activation(overrides: Partial<ActivationConfig> = {}): ActivationConfig {
  return {
    mode: "all",
    include: [],
    exclude: [],
    markers: { include: [], exclude: [] },
    gitRemotes: [],
    ...overrides,
  }
}

// 旧字段对拍：编译为策略后按同一现场判定
function legacy(config: Partial<ActivationConfig>, view = context()) {
  return decidePolicy(compilePolicies(legacyToPolicies(activation(config), "project"), ROOT), view)
}

describe("decidePolicy 条件与默认值", () => {
  it("无规则命中时默认全域生效", () => {
    const decision = decide([])
    expect(decision.active).toBe(true)
    expect(decision.matchedRule).toBeNull()
    expect(decision.reason).toContain("默认全域生效")
  })

  it("同字段 OR、跨字段 AND", () => {
    const rule = [{ id: "rule", when: { paths: [`${ROOT}/**`], markers: ["m"] }, effect: "deny" as const }]
    expect(decide(rule, context()).active).toBe(true)
    expect(decide(rule, context({ markers: new Set(["m"]) })).active).toBe(false)
    const markerOr = [{ id: "or", when: { markers: ["a", "b"] }, effect: "deny" as const }]
    expect(decide(markerOr, context({ markers: new Set(["b"]) })).active).toBe(false)
  })

  it("git 远端按归一后的扁平文本匹配", () => {
    const rule = [{ id: "remote", when: { gitRemotes: ["github.com/acme/**"] }, effect: "deny" as const }]
    expect(decide(rule, context({ gitRemote: "git@github.com:acme/repo.git" })).active).toBe(false)
    expect(decide(rule, context({ gitRemote: "https://github.com/other/repo.git" })).active).toBe(true)
    expect(decide(rule, context()).active).toBe(true)
  })

  it("subpaths 按 cwd 匹配，项目根执行时 allow 失败关闭、deny 不适用", () => {
    const allow = [{ id: "sub", when: { subpaths: ["src/**"] }, effect: "allow" as const }]
    const atRoot = decide(allow)
    expect(atRoot.active).toBe(false)
    expect(atRoot.reason).toContain("子目录")
    expect(decide(allow, context({ cwd: SUB })).active).toBe(true)
    expect(decide(allow, context({ cwd: `${ROOT}/docs` })).active).toBe(true)
    const deny = [{ id: "deny", when: { subpaths: ["src/**"] }, effect: "deny" as const }]
    expect(decide(deny).active).toBe(true)
    expect(decide(deny, context({ cwd: SUB })).active).toBe(false)
  })

  it("子目录 allow 在项目根不会误伤其它技能", () => {
    const allow = [
      { id: "skill-sub", when: { subpaths: ["src/**"] }, skills: { match: ["fxri-vue"] }, effect: "allow" as const },
    ]
    expect(decide(allow, context({ skill: "fxri-text-encoding" })).active).toBe(true)
    expect(decide(allow, context({ skill: "fxri-vue" })).active).toBe(false)
  })
})

describe("decidePolicy 优先级", () => {
  it("层优先级 local > project > global", () => {
    const globalDeny = { id: "global", layer: "global" as const, effect: "deny" as const }
    const projectAllow = { id: "project", layer: "project" as const, effect: "allow" as const }
    expect(decide([globalDeny, projectAllow]).active).toBe(true)
    expect(decide([globalDeny, projectAllow]).matchedRule).toContain("policy:project")
    const localDeny = { id: "local", layer: "local" as const, effect: "deny" as const }
    expect(decide([globalDeny, projectAllow, localDeny]).active).toBe(false)
  })

  it("同层子目录规则优先于路径规则", () => {
    const pathDeny = { id: "paths", when: { paths: [`${ROOT}/**`] }, effect: "deny" as const }
    const subAllow = { id: "sub", when: { subpaths: ["src/**"] }, effect: "allow" as const }
    const decision = decide([pathDeny, subAllow], context({ cwd: SUB }))
    expect(decision.active).toBe(true)
    expect(decision.matchedRule).toContain("policy:sub")
  })

  it("技能选择器精确名优先于 glob、再优先于无约束", () => {
    const none = { id: "none", effect: "deny" as const }
    const glob = { id: "glob", effect: "deny" as const, skills: { match: ["fxri-*"], mode: "all" as const } }
    const exact = {
      id: "exact",
      effect: "allow" as const,
      skills: { match: ["fxri-plan-review"], mode: "all" as const },
    }
    const decision = decide([none, glob, exact], context({ skill: "fxri-plan-review" }))
    expect(decision.active).toBe(true)
    expect(decision.matchedRule).toContain("policy:exact")
  })

  it("同具体度下条件更多者优先，条件相同则 deny 优先", () => {
    const allow = { id: "allow", when: { paths: [`${ROOT}/**`] }, effect: "allow" as const }
    const denyBoth = { id: "deny", when: { paths: [`${ROOT}/**`], markers: ["m"] }, effect: "deny" as const }
    expect(decide([allow, denyBoth], context({ markers: new Set(["m"]) })).active).toBe(false)
    // 路径越长越具体：宽规则 deny 压过精确路径 allow
    const allowExact = { id: "allow-exact", when: { paths: [ROOT] }, effect: "allow" as const }
    const denyBroad = { id: "deny-broad", when: { paths: [`${ROOT}/**`] }, effect: "deny" as const }
    expect(decide([allowExact, denyBroad]).active).toBe(false)
    // 条件完全相同时 deny 优先，后写的 allow 不能翻盘
    const allowSame = { id: "allow-same", effect: "allow" as const }
    const denySame = { id: "deny-same", effect: "deny" as const }
    expect(decide([allowSame, denySame]).active).toBe(false)
  })

  it("同层同具体度后写覆盖", () => {
    const first = { id: "first", effect: "deny" as const }
    const second = { id: "second", effect: "deny" as const }
    const decision = decide([first, second])
    expect(decision.active).toBe(false)
    expect(decision.matchedRule).toContain("policy:second")
  })
})

describe("decidePolicy 技能维度", () => {
  it("allowlist 需命中允许名单且不在排除名单", () => {
    const rule = [{ id: "allowlist", skills: { mode: "allowlist" as const, allow: ["fxri-a"], deny: ["fxri-b"] } }]
    expect(decide(rule, context({ skill: "fxri-a" })).active).toBe(true)
    const rejected = decide(rule, context({ skill: "fxri-c" }))
    expect(rejected.active).toBe(false)
    expect(rejected.reason).toContain("不在允许名单")
    const denied = decide(rule, context({ skill: "fxri-b" }))
    expect(denied.active).toBe(false)
    expect(denied.reason).toContain("在排除名单")
  })

  it("denylist 默认放行，仅排除名单拒绝", () => {
    const rule = [{ id: "denylist", skills: { mode: "denylist" as const, deny: ["fxri-*"] } }]
    expect(decide(rule, context({ skill: "fxri-vue" })).active).toBe(false)
    expect(decide(rule, context({ skill: "custom-skill" })).active).toBe(true)
  })

  it("档案按引用展开允许与拒绝名单", () => {
    const rule = [{ id: "profile", skills: { mode: "allowlist" as const, profiles: ["front"] } }]
    const options: CompileOptions = {
      profiles: { front: { allow: ["fxri-vue"], deny: ["fxri-vue-legacy"] } },
    }
    expect(decide(rule, context({ skill: "fxri-vue" }), options).active).toBe(true)
    expect(decide(rule, context({ skill: "fxri-react" }), options).active).toBe(false)
    expect(decide(rule, context({ skill: "fxri-vue-legacy" }), options).active).toBe(false)
    // 未定义档案按无允许项处理
    expect(decide(rule, context({ skill: "fxri-vue" })).active).toBe(false)
  })

  it("未指定技能时技能名单不参与判定", () => {
    const rule = [{ id: "allowlist", skills: { mode: "allowlist" as const, allow: ["fxri-a"] } }]
    const decision = decide(rule)
    expect(decision.active).toBe(true)
    expect(decision.reason).toContain("未指定技能")
  })
})

describe("legacyToPolicies 行为对拍", () => {
  it("allowlist 命中 / 未命中 / 空白名单", () => {
    expect(legacy({ mode: "allowlist", include: [ROOT] }).active).toBe(true)
    expect(legacy({ mode: "allowlist", include: [`${ROOT}/other`] }).active).toBe(false)
    expect(legacy({ mode: "allowlist" }).active).toBe(false)
    expect(legacy({ mode: "allowlist", include: [ROOT] }).matchedRule).toContain("legacy:project:include")
  })

  it("排除规则优先于白名单与启用条件", () => {
    expect(legacy({ mode: "allowlist", include: [ROOT], exclude: [ROOT] }).active).toBe(false)
    // 标记不满足时排除仍然生效
    const decision = legacy({ markers: { include: ["m"], exclude: [] }, exclude: [ROOT] })
    expect(decision.active).toBe(false)
    expect(decision.matchedRule).toContain("legacy:project:exclude")
  })

  it("marker 启用与排除、git 远端作为附加条件", () => {
    const withMarker = { mode: "all" as const, markers: { include: ["m"], exclude: [] } }
    expect(legacy(withMarker).active).toBe(false)
    expect(legacy(withMarker, context({ markers: new Set(["m"]) })).active).toBe(true)
    const markerExclude = { markers: { include: [], exclude: ["blocked"] } }
    expect(legacy(markerExclude).active).toBe(true)
    expect(legacy(markerExclude, context({ markers: new Set(["blocked"]) })).active).toBe(false)
    const remote = { gitRemotes: ["github.com/acme/**"] }
    expect(legacy(remote, context({ gitRemote: "git@github.com:acme/repo.git" })).active).toBe(true)
    expect(legacy(remote, context({ gitRemote: "git@github.com:other/repo.git" })).active).toBe(false)
    expect(legacy(remote).active).toBe(false)
  })

  it("denylist 模式默认放行，命中排除拒绝", () => {
    expect(legacy({ mode: "denylist" }).active).toBe(true)
    expect(legacy({ mode: "denylist", exclude: [ROOT] }).active).toBe(false)
  })

  it("技能级 denylist 覆盖目录级，未命中技能回落目录级", () => {
    const config = {
      mode: "allowlist" as const,
      include: [ROOT],
      skills: { "fxri-plan-review": { mode: "denylist" as const, exclude: [ROOT] } },
    }
    const review = legacy(config, context({ skill: "fxri-plan-review" }))
    expect(review.active).toBe(false)
    expect(review.matchedRule).toContain("legacy:project:skill-exclude")
    expect(legacy(config, context({ skill: "fxri-text-encoding" })).active).toBe(true)
  })

  it("技能级 allowlist 在名单外按失败关闭拒绝", () => {
    const config = {
      mode: "all" as const,
      skills: { "fxri-plan-review": { mode: "allowlist" as const, include: [`${ROOT}/work/**`] } },
    }
    const inWork = context({ baseDir: `${ROOT}/work/repo`, cwd: `${ROOT}/work/repo`, skill: "fxri-plan-review" })
    expect(legacy(config, inWork).active).toBe(true)
    expect(legacy(config, context({ skill: "fxri-plan-review" })).active).toBe(false)
    expect(legacy(config, context({ skill: "fxri-text-encoding" })).active).toBe(true)
  })

  it("技能级规则沿用目录级标记条件", () => {
    const config = {
      markers: { include: ["m"], exclude: [] },
      skills: { "fxri-plan-review": { exclude: [] } },
    }
    expect(legacy(config, context({ skill: "fxri-plan-review" })).active).toBe(false)
    expect(legacy(config, context({ skill: "fxri-plan-review", markers: new Set(["m"]) })).active).toBe(true)
    // 未命中技能选择器的技能仍走目录级判定
    expect(legacy(config, context({ skill: "fxri-text-encoding" })).active).toBe(false)
  })

  it("项目层旧 activation 优先于全局新策略", () => {
    const projectLegacy = legacyToPolicies(activation({ mode: "allowlist", include: [ROOT] }), "project")
    const projectAllow = compilePolicies(projectLegacy, ROOT)
    const globalDeny: ScopePolicyInput = { id: "global", layer: "global", effect: "deny" }
    expect(decidePolicy(projectAllow, context()).active).toBe(true)
    expect(decidePolicy(compilePolicies([globalDeny, ...projectLegacy], ROOT), context()).active).toBe(true)
    // 项目层兜底拒绝同样压过全局允许
    const combined = compilePolicies(
      [
        { id: "global-allow", layer: "global", effect: "allow" },
        ...legacyToPolicies(activation({ mode: "allowlist", include: [`${ROOT}/other`] }), "project"),
      ],
      ROOT,
    )
    expect(decidePolicy(combined, context()).active).toBe(false)
  })

  it("旧字段标识可被命令层识别", () => {
    expect(isLegacyPolicyId("legacy:project:include:0")).toBe(true)
    expect(isLegacyPolicyId("policy-abc")).toBe(false)
  })
})

describe("compilePolicies 校验与性能", () => {
  it("缺省 id 按层与序号派生，name 进入命中标识", () => {
    const set = compilePolicies([{ id: "", name: "主规则", effect: "deny" }], ROOT)
    const decision = decidePolicy(set, context())
    expect(decision.matchedRule).toBe("policy:global:policy:0 (主规则)")
  })

  it("非法模式使整条策略作废，不产生残缺匹配", () => {
    const set = compilePolicies(
      [
        { id: "bad-path", when: { paths: ["re:("] }, effect: "deny" },
        { id: "bad-remote", when: { gitRemotes: ["re:("] }, effect: "deny" },
        { id: "bad-skill", skills: { match: ["re:("] }, effect: "deny" },
        { id: "bad-allow", skills: { allow: ["re:("] }, effect: "deny" },
      ],
      ROOT,
    )
    expect(set.policies).toHaveLength(0)
    expect(decidePolicy(set, context()).active).toBe(true)
  })

  it("空 match 视为无技能约束", () => {
    const decision = decide([{ id: "empty-match", skills: { match: [] }, effect: "deny" }], context())
    expect(decision.active).toBe(false)
    expect(decision.matchedRule).toContain("policy:empty-match")
  })

  it("200 条规则 × 10k 次判定不触发正则编译与排序", () => {
    const policies: ScopePolicyInput[] = Array.from({ length: 200 }, (_, index) => ({
      id: `p${index}`,
      layer: index % 3 === 0 ? "local" : index % 3 === 1 ? "project" : "global",
      when: { paths: [`${ROOT}/group${index % 10}/**`, ROOT], markers: index % 5 === 0 ? ["m"] : [] },
      effect: index % 2 === 0 ? "deny" : "allow",
      skills: index % 7 === 0 ? { mode: "allowlist" as const, allow: ["fxri-*"] } : undefined,
    }))
    const set = compilePolicies(policies, ROOT)
    expect(set.policies).toHaveLength(200)
    resetPolicyStats()
    const started = Date.now()
    for (let index = 0; index < 10000; index += 1) {
      decidePolicy(
        set,
        context({ cwd: `${ROOT}/group${index % 10}/src`, skill: "fxri-plan-review", markers: new Set(["m"]) }),
      )
    }
    expect(Date.now() - started).toBeLessThan(5000)
    expect(readPolicyStats()).toEqual({ compiles: 0, sorts: 0 })
  })
})
