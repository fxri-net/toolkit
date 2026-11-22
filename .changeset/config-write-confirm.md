---
"@fxri/toolkit": patch
---

- 修复：`config set` / `config unset` 非 TTY 缺 `--yes` 时退出码由 1 改为 2，与其它写确认命令一致
- 优化：`exit-codes` 与配置参考明确 `scope` 写命令在非 TTY 带参直写是已知例外
