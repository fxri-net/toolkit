---
"@fxri/toolkit": patch
---

新增：新增 `toolkit conventions format` 子命令，把格式化器为 GFM 表格填充出的空白层归一为紧凑形态——只动单元格间距与列对齐填充、不改语义，幂等、跳过 fenced code block，支持 `--dry-run` 预演与 `--format json`
新增：`toolkit init` 检测到宿主疑似使用 prettier 时幂等托管 `.prettierignore`，把任务区整目录排除，从源头避免表格被列对齐填充（本包源仓库、任务区外置或即仓库根、无 prettier 迹象三种情形跳过）
新增：`toolkit conventions status` 与 `toolkit tasks check` 检出表格列对齐填充并提示上述两种处置（软告警，不阻断）
