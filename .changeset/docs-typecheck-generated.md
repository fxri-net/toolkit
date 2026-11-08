---
"@fxri/toolkit": patch
---

- 优化：文档站类型检查纳入 `pnpm verify`，覆盖 `.ts` / `.mts` 与显式列出的 `.vue`
- 修复：文档站规则组合器改用生成的 TS 数据模块，移除 `?raw` 导入与相关类型声明，IDE 不再报 2307
- 修复：生成的 `RULESET` 使用显式可变类型，`RuleComposer` 不再做 readonly 到 `string[]` 的转换
- 新增：遍历 `docs/**/*.vue` 的覆盖率测试，组件漏配 `files` 时门禁失败
