---
"@fxri/toolkit": patch
---

- 修复：导航结构定义补齐 VitePress 官方的 `activeMatch` / `rel` / `target` / `noIcon` / `base` / `docFooterText`，不再把合法字段判为未知字段
- 修复：检查器遇到未支持的 schema 关键字时直接报错，不再静默忽略
- 优化：导航规则版本升至 `1.2.0`
