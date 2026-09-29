---
"@fxri/toolkit": patch
---

- 优化：门禁类型检查此前读基础 `tsconfig.json`（其 `exclude` 排除 `**/__tests__` 等测试路径），测试文件长期落在类型检查盲区；现类型检查改走放行该排除项的 `tsconfig.typecheck.json`，并清零由此暴露的存量测试类型错误
