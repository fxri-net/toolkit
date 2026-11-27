---
"@fxri/toolkit": patch
---

- 重大：对外 JSON 与数据文件的 `schemaVersion` / `formatVersion` 由整数改为 `MAJOR.MINOR` 两位字符串（如 `1.0`）；读取端兼容历史整数，写出端统一两位
- 优化：各契约独立声明版本常量、独立递增，不再共享同一个版本号
- 文档：事件 schema 更名为 `skill-usage-event.schema.json`（版本只写在文件内），相关 JSON 示例与状态文件说明同步两位口径
