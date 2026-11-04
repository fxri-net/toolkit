---
"@fxri/toolkit": patch
---

- 新增：`FX_DEBUG_UPDATE_CHECK=1` 输出每轮提示判定依据到 stderr，不改变提示结果
- 修复：执行 `skills install` 后同一版本不再重复提示，来源版本变化或 CLI 升级后自动恢复
- 新增：`skills status` 展示上次检查时间与下次可提示时间，JSON 侧补 `checkedAt` / `nextHintAt`
