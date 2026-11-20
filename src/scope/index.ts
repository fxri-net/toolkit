// 作用域能力出口：路径、判定、配置加载与契约类型
export * from "./types"
export { globToRegExp, matchGlob } from "./glob"
export { expandHome, findGitRoot, normalizeRemote, readGitRemote, resolveComparablePath } from "./paths"
export { decideScope } from "./decide"
export { loadActivation, resolveScope, type ScopeReport } from "./load"
