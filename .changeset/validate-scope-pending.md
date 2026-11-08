---
"@fxri/toolkit": patch
---

- 修复：任务区词标记扫描只认行首子项形态，跳过标题、代码块与引用块，正常引用不再误报
- 新增：`tasks check` 校验 `scope` 取值是否在 conventions 端清单内（`common` 恒合法）
- 优化：`tasks stats` 标注统计口径（含归档 / 仅未完成 / 仅已归档）
