---
"@fxri/toolkit": patch
---

- 新增：`skills status` 单列「经 canonical 共读的 agent」，DeepSeek Harness 等共读 agent 不再被误判为不支持（JSON 输出新增 `canonicalReaders` 字段）
- 新增：项目面候选目录增加 eve 的 `agent/skills`，该目录已存在时落入口薄壳
- 文档：补充 canonical 共读 agent 清单，以及 DeepSeek Harness 全局 / 项目级技能目录说明
