---
"@fxri/toolkit": patch
---

- 新增：`toolkit privacy scan [--fix]` 按 `privacy.localPaths` 档位扫描本机绝对路径，任务归档 / 规范载体 / 变更集阻断，文档与技能只提示
- 新增：`--fix` 只归一任务区与规范载体，文档与技能只报告；档位 `off` 时整次扫描跳过
- 优化：`task check` 复用同一扫描，`pnpm verify` 新增隐私步骤（`off` 时零噪音）
