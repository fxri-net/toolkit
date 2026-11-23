---
"@fxri/toolkit": patch
---

- 新增：`skill status --matrix [--at <目录>]` 逐技能列出产物形态、当前目录形态与命中规则依据，支持 `--format json`
- 优化：`toolkit status` 检测到旧 `activation` / `skillDelivery.rules` 时给一次迁移提示（只提示，不自动改写）
