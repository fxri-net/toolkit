---
"@fxri/toolkit": patch
---

- 修复：交互输入被关闭（非 TTY / EOF）时按无交互退出码结束，不再误报为用户按 Ctrl+C 取消
