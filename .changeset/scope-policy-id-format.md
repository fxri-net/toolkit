---
"@fxri/toolkit": patch
---

- 修复：`scope policy add --id` 拒绝含空白、控制字符或 `legacy:` 前缀的标识，避免联动分析漏报与只读误标
