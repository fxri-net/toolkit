---
"@fxri/toolkit": patch
---

- 修复：TTY 下 `task add` / `task update` 答完提示后仍要求 `--yes` 并以 2 退出的问题，改为仅非交互环境要求确认
