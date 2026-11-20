// 作用域判定：纯函数，输入配置与现场，输出 active / 命中规则 / 原因
import { matchGlob } from "./glob"
import { matchPathPattern, matchPattern } from "./pattern"
import { normalizeRemote } from "./paths"
import type { ActivationConfig, ScopeContext, ScopeDecision, SkillActivationConfig } from "./types"

// 路径规则首处命中：按判定基准（项目根）解析 glob / re: 规则
function firstPathMatch(list: string[], target: string, context: ScopeContext): string | null {
  return (
    list.find((pattern) =>
      matchPathPattern(target, pattern, { baseDir: context.baseDir, caseInsensitive: context.caseInsensitive }),
    ) ?? null
  )
}

// 远端规则首处命中：远端已归一，按扁平文本 glob 匹配，不走路径解析
function firstRemoteMatch(list: string[], remote: string, caseInsensitive: boolean): string | null {
  return list.find((pattern) => matchGlob(remote, pattern, caseInsensitive)) ?? null
}

// 技能级规则：精确键优先，其次按技能名模式匹配（最长键优先，避免宽泛规则抢先生效）
function resolveSkillRule(
  activation: ActivationConfig,
  skill: string | undefined,
  caseInsensitive: boolean,
): { key: string; rule: SkillActivationConfig } | null {
  if (!skill || !activation.skills) return null
  const exact = activation.skills[skill]
  if (exact) return { key: skill, rule: exact }
  const matched = Object.keys(activation.skills)
    .filter((key) => matchPattern(skill, key, caseInsensitive))
    .sort((left, right) => right.length - left.length)[0]
  const rule = matched ? activation.skills[matched] : undefined
  return matched && rule ? { key: matched, rule } : null
}

// 判定当前目录是否激活：排除项优先，其次启用标记、git 远端与白名单
// 传入技能名时，命中技能级规则则以该规则覆盖 mode / include / exclude，其余条件沿用目录级
export function decideScope(
  activation: ActivationConfig | null,
  context: ScopeContext,
  sourceFile: string | null = null,
): ScopeDecision {
  if (!activation) {
    return {
      active: true,
      mode: "all",
      baseDir: context.baseDir,
      sourceFile,
      matchedRule: null,
      reason: "未配置作用域（默认全域生效）",
    }
  }
  const skillRule = resolveSkillRule(activation, context.skill, context.caseInsensitive)
  const effective: ActivationConfig = skillRule
    ? {
        ...activation,
        mode: skillRule.rule.mode ?? activation.mode,
        include: skillRule.rule.include ?? activation.include,
        exclude: skillRule.rule.exclude ?? activation.exclude,
      }
    : activation
  const prefix = skillRule ? `skill:${skillRule.key}:` : ""
  const scopeText = skillRule ? `技能级规则 ${skillRule.key} ` : ""
  const inactive = (reason: string, matchedRule: string | null = null): ScopeDecision => ({
    active: false,
    mode: effective.mode,
    baseDir: context.baseDir,
    sourceFile,
    matchedRule: matchedRule === null ? null : `${prefix}${matchedRule}`,
    reason: `${scopeText}${reason}`,
  })
  const active = (reason: string, matchedRule: string | null = null): ScopeDecision => ({
    active: true,
    mode: effective.mode,
    baseDir: context.baseDir,
    sourceFile,
    matchedRule: matchedRule === null ? null : `${prefix}${matchedRule}`,
    reason: `${scopeText}${reason}`,
  })

  const excluded = firstPathMatch(effective.exclude, context.baseDir, context)
  if (excluded) return inactive(`命中排除规则 ${excluded}`, `exclude:${excluded}`)

  const markerExclude = effective.markers.exclude.find((name) => context.markers.has(name))
  if (markerExclude) return inactive(`命中排除标记 ${markerExclude}`, `marker-exclude:${markerExclude}`)

  if (effective.markers.include.length > 0) {
    const markerInclude = effective.markers.include.find((name) => context.markers.has(name))
    if (!markerInclude) return inactive(`缺少启用标记：${effective.markers.include.join(" / ")}`)
  }

  if (effective.gitRemotes.length > 0) {
    const remote = context.gitRemote
    if (!remote) return inactive("未检测到 git 远端，无法匹配 gitRemotes")
    const remoteHit = firstRemoteMatch(effective.gitRemotes, normalizeRemote(remote), context.caseInsensitive)
    if (!remoteHit) return inactive(`git 远端未命中：${remote}`)
  }

  if (effective.mode === "allowlist") {
    if (effective.include.length === 0) return inactive("白名单为空")
    const included = firstPathMatch(effective.include, context.baseDir, context)
    if (!included) return inactive("未命中白名单")
    return active(`命中白名单 ${included}`, `include:${included}`)
  }

  return active(effective.mode === "denylist" ? "未命中排除规则" : "未配置限制（全域生效）")
}
