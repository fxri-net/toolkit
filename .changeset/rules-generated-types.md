---
"@fxri/toolkit": patch
---

- 修复：生成的 `RULESET` 改为显式可变类型，`RuleComposer` 不再做 readonly 到 `string[]` 的转换
- 修复：`docs/tsconfig.json` 显式包含 `RuleComposer.vue`，`vue-tsc` 真正检查组件
