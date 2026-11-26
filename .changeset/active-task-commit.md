---
"@fxri/toolkit": patch
---

- 修改：任务收尾提交只带归档与代码，`.tasks/active/` 默认不入库（不写 `.gitignore`，用户明确要求才例外）
- 新增：`toolkit task check --staged` 校验暂存区，`<任务区>/active/` 任务档默认不入库，命中即失败（`pnpm verify` 已接入），可用 `FX_TOOLKIT_ALLOW_ACTIVE_TASKS=1` 放行
