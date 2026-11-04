---
"@fxri/toolkit": patch
---

- 新增：`scripts/check-consistency.mjs` 并挂入 `pnpm verify`，校验技能版本四处一致、技能表用途列片段与任务登记的触达路径
- 修改：任务正文可用 `- 文档触达：<路径>` 登记本次触达文件，仓库自检核对路径存在性
- 修改：`fxri-plan-to-task` references 补触达登记约定，技能版本 1.9.9
