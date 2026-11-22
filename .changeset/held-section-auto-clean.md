---
"@fxri/toolkit": patch
---

- 修改：`task update` 从「搁置」转出时自动删除 `## 搁置` 节（转「已放弃」保留作终结理由）
- 新增：`task archive` 对已完成任务残留的 `## 搁置` 节输出软告警（受 `--no-warn` 控制，不阻断）
