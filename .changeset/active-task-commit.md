---
"@fxri/toolkit": patch
---

- 修改：任务收尾提交只带归档与代码，`.tasks/active/` 默认不入库（不写 `.gitignore`，用户明确要求才例外）
- 新增：`pnpm verify` 增加 active 任务暂存检查，暂存 `.tasks/active/` 文件时失败，可用 `FX_TOOLKIT_ALLOW_ACTIVE_TASKS=1` 放行
