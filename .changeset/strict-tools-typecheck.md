---
"@fxri/toolkit": patch
---

修复：修复 `toolkit changelog` 帮助拦截与解析错误提示两处 TypeScript 类型错误（`noUncheckedIndexedAccess` 下索引与正则捕获组取值未兜底），改用解构判空与空串兜底；运行时行为与输出不变，本仓库 `pnpm typecheck` 恢复通过

优化：本仓库验收门禁补 `pnpm typecheck`——`pnpm lint`（eslint）与 `pnpm build` 均不做类型检查，此前仅靠 CI 暴露类型错误
