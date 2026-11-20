// 作用域能力出口：路径、模式、判定、配置加载与契约类型
export * from "./types"
export { globToRegExp, matchGlob } from "./glob"
export { compilePattern, matchPathPattern, matchPattern, REGEX_PREFIX, type CompiledPattern, type PatternKind } from "./pattern"
export { expandHome, findGitRoot, findProjectRoot, normalizeRemote, readGitRemote, resolveComparablePath } from "./paths"
export { decideScope } from "./decide"
export { loadActivation, resolveScope, type ScopeReport } from "./load"
export { packageSkillDir, resolveGuard, runGuard, type GuardResult } from "./guard"
