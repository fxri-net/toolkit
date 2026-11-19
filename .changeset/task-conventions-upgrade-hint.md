---
"@fxri/toolkit": patch
---

- 优化：`conventions upgrade` 实跑完成后提示随后执行 `toolkit conventions format` 归一索引表单元格（升级只做结构迁移，不套用单元格形态）
- 修改：`format` 文档说明文本输出最多列 10 条待处理项、`--format json` 输出全量
- 修改：两个技能的可选加速表把「表格归一」补齐为「表格与索引单元格归一」（`fxri-plan-to-task` 1.12.5、`fxri-session-recap` 1.7.2）
