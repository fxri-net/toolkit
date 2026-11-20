---
"@fxri/toolkit": minor
---

- 新增：`activation.skills` 技能级作用域，按技能名（glob / `re:`）覆盖 `mode` / `include` / `exclude`，未命中回落目录级
- 新增：`scope status --skill <name>` 按技能级规则判定，`matchedRule` 以 `skill:<键>:` 前缀标明来源
- 修改：`scope list` 文本与 JSON 输出技能级规则
