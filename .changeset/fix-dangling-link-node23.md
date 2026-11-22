---
"@fxri/toolkit": patch
---

- 修复：Windows 上 Node 23 清理悬空技能链接时 `rmSync` 不生效，改为对悬空链接走 `unlink`，避免残留与后续 `EEXIST`
