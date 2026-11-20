---
"@fxri/toolkit": patch
---

- 新增：`tasks normalize --fix` 剥离 `active/` 与 `archive/` 下任务档的 UTF-8 BOM（只对带 BOM 的文件写回，输出附「去除 BOM N 个文件」）
- 修改：`tasks normalize` 的定位从「归档块归一化」扩为「任务区归一化」，帮助与文档同步
