---
"@fxri/toolkit": patch
---

修复：`toolkit tasks --export` 的 `.xlsx`「已归档」sheet 补齐「创建日期」列（列序：任务名 / 状态 / 负责人 / 范围 / 创建日期 / 完成时间 / 来源文件），使归档行导出→导入往返后 `created` 不再回落运行当天、落回正确的月份目录
