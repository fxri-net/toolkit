---
"@fxri/toolkit": patch
---

优化：skills remove 报告目标改用显示名标识

- 卸载报告的目标行由绝对路径改为 `显示名：路径`，与 `skills install` / `skills status` 同口径；canonical 目录优先判为「canonical（多家 agent 共读）」，内置快照表内的 agent 目录打印其显示名
- 表外目标（自定义 `--dir`）无显示名可反查，回落为绝对路径；`--format json` 的每个目标新增 `label` 字段（反查不到为 `null`）
