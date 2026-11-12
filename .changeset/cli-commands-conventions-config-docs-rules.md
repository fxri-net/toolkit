---
"@fxri/toolkit": patch
---

- 优化：`conventions`、`config`、`docs`、`rules` 命令迁入 `src/commands/` 独立模块，`cli.ts` 收敛为命令装配入口（2536 → 116 行）
- 优化：命令顺序与 help 输出逐字不变，行为基线快照零差异
