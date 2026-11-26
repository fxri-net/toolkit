---
"@fxri/toolkit": patch
---

- 修改：无 `node_modules`（如 Yarn PnP）时作用域改按 CLI 包根是否位于项目根内判定，全局缓存型安装仍需显式 `--scope project`
