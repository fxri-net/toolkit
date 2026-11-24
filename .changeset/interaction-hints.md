---
"@fxri/toolkit": patch
---

- 修改：规则预设的显示名、模块清单与适用面统一由 `templates/rules/ruleset.json` 派生，`rule compose` 交互选项与文档站组合器各附一行说明
- 修改：`toolkit setup` 四项勾选补「做什么 + 写到哪里」说明；`usage setup` 的预设、通道、技能范围与轮转选项，以及 `upgrade` 的迁移项补影响面说明
- 重大：`rule list --format json` 的 `presets` 由模块 id 数组改为含 `label` / `summary` / `modules` 的对象
- 文档：`docs/cli/rule.md`、`docs/cli/setup.md`、`docs/rules/index.md` 同步预设适用面与四项说明
