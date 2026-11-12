---
"@fxri/toolkit": patch
---

- 优化：`usage` 子命令按组拆分为 lifecycle / config / upload / data 与共用上下文模块，`commands.ts` 仅保留域入口
- 优化：子命令顺序、选项与输出逐字不变，行为基线快照零差异
