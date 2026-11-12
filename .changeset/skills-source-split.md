---
"@fxri/toolkit": patch
---

- 优化：`skills` 源能力按职责拆分为 package / metadata / remote / targets / artifact / paths 六个模块，`source.ts` 改为统一出口
- 优化：模块对外导出与运行行为不变，行为基线快照零差异
