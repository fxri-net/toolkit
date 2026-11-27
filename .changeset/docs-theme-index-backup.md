---
"@fxri/toolkit": patch
---

- 优化：`docs theme write` 覆盖自定义 `index.ts` 前先备份为 `index.ts.toolkit-backup-<时间戳>`，避免静默丢失改动
