---
"@fxri/toolkit": patch
---

- 新增：`docs nav check` 与 `docs dist check`，文档站导航与产物校验随包分发为单一实现，各站点不再各自维护校验脚本
- 新增：随包分发 `schemas/site-nav.schema.json`，导航数据改为 `docs/site-nav.json` 单一真源，`docs nav check` 先校验结构再判定规则
- 优化：`docs nav check` 支持 `--format json`，输出含独立于包版本的 `ruleVersion`
- 优化：删去重复的静态 `sitemap.transformItems` 断言，404 排除由产物断言覆盖
