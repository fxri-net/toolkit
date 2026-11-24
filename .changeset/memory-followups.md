---
"@fxri/toolkit": patch
---

- 修复：`task add` 交互的影响范围默认值改为项目内最近任务（含归档），读不到时回落 `cli`，不再固定 `cli`
- 优化：`rule compose` 交互记住上次选中的预设，下次默认高亮该预设
- 优化：`rule list` 的「当前缓存」标注上次预设 / 自定义，JSON 新增 `selectionPreset` 字段
- 文档：升级页的规则快照命令补 `--no-cache`，避免一次性生成快照改写默认组合
