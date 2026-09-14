---
"@fxri/toolkit": patch
---

修改：任务统计 JSON 输出补齐 schemaVersion 锚点

- `toolkit tasks stats --format json` 顶层新增 `schemaVersion: 1`，与 `tasks --export`、`skills --format json` 统一口径；既有统计字段保持原位与语义不变，按旧 key 读取的消费方不受影响
- 序列化收敛为技能域与任务统计域共用的单一出口，schemaVersion 锚点位置不再分散维护
