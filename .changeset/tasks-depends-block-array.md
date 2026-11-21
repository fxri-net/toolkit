---
"@fxri/toolkit": patch
---

- 修复：`depends_on` 的 YAML 块状数组写法被静默解析为空，现支持块状数组并与内联数组结果一致
- 文档：任务文件规范补明 `depends_on` 的两种合法写法
