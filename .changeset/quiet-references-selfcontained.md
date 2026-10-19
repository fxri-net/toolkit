---
"@fxri/toolkit": patch
---

- 修复：`fxri-session-recap` 恢复模式二引用兄弟技能 `conventions-migration.md` 时补包内真源兜底，单独加载该篇也能定位升级链路
- 修复：`fxri-plan-to-task` 的 v2 → v3 升级步骤直接写出 `retired.md` 固定表头，迁移不再需要反向查 `conventions-spec.md`
- 优化：`conventions-spec.md` 声明 `.tasks/` 外层骨架以 `task-spec.md` 为真源，避免两份目录树各自演进漂移
