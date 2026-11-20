---
"@fxri/toolkit": patch
---

- 新增：`tasks normalize` 只读模式报告归档文件的 UTF-8 BOM（`fixable`，可 `--fix` 去除），补齐 active 报、archive 不报的不对称
- 修改：`tasks check` 的 active BOM 告警补「可用 `toolkit tasks normalize --fix` 修复」指引
