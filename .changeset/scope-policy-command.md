---
"@fxri/toolkit": patch
---

- 新增：`toolkit scope policy` 命令面，统一新增 / 列出 / 移除 / 清除路径、标记、远端与技能维度策略
- 新增：`toolkit scope skills` 快捷视图与 `toolkit scope status --skills`，按技能维度查看允许 / 拒绝结论
- 优化：策略支持 `--id` 跨层唯一标识、`--at` 指定判定起点，帮助写明层优先级与覆盖语义
