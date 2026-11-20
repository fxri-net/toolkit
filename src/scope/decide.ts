// 作用域判定：纯函数，输入配置与现场，输出 active / 命中规则 / 原因
import { matchGlob } from "./glob"
import { normalizeRemote } from "./paths"
import type { ActivationConfig, ScopeContext, ScopeDecision } from "./types"

// 第一处命中的规则；未命中返回 null
function firstMatch(list: string[], target: string, caseInsensitive: boolean): string | null {
  return list.find((pattern) => matchGlob(target, pattern, caseInsensitive)) ?? null
}

// 判定当前目录是否激活：排除项优先，其次启用标记、git 远端与白名单
export function decideScope(
  activation: ActivationConfig | null,
  context: ScopeContext,
  sourceFile: string | null = null,
): ScopeDecision {
  if (!activation) {
    return { active: true, mode: "all", sourceFile, matchedRule: null, reason: "未配置作用域（默认全域生效）" }
  }
  const inactive = (reason: string, matchedRule: string | null = null): ScopeDecision => ({
    active: false,
    mode: activation.mode,
    sourceFile,
    matchedRule,
    reason,
  })
  const active = (reason: string, matchedRule: string | null = null): ScopeDecision => ({
    active: true,
    mode: activation.mode,
    sourceFile,
    matchedRule,
    reason,
  })

  const excluded = firstMatch(activation.exclude, context.cwd, context.caseInsensitive)
  if (excluded) return inactive(`命中排除规则 ${excluded}`, `exclude:${excluded}`)

  const markerExclude = activation.markers.exclude.find((name) => context.markers.has(name))
  if (markerExclude) return inactive(`命中排除标记 ${markerExclude}`, `marker-exclude:${markerExclude}`)

  if (activation.markers.include.length > 0) {
    const markerInclude = activation.markers.include.find((name) => context.markers.has(name))
    if (!markerInclude) return inactive(`缺少启用标记：${activation.markers.include.join(" / ")}`)
  }

  if (activation.gitRemotes.length > 0) {
    const remote = context.gitRemote
    if (!remote) return inactive("未检测到 git 远端，无法匹配 gitRemotes")
    const remoteHit = firstMatch(activation.gitRemotes, normalizeRemote(remote), context.caseInsensitive)
    if (!remoteHit) return inactive(`git 远端未命中：${remote}`)
  }

  if (activation.mode === "allowlist") {
    if (activation.include.length === 0) return inactive("白名单为空")
    const included = firstMatch(activation.include, context.cwd, context.caseInsensitive)
    if (!included) return inactive("未命中白名单")
    return active(`命中白名单 ${included}`, `include:${included}`)
  }

  return active(activation.mode === "denylist" ? "未命中排除规则" : "未配置限制（全域生效）")
}
