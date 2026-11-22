---
"@fxri/toolkit": patch
---

- 新增：`upgrade --diff` 输出配置文件与 `package.json` 的行级差异，`--dry-run` 仍只输出清单
- 新增：`--diff --format json` 时 `data.diffs[]` 给出 `file` 与 unified diff 文本
