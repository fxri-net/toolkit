---
"@fxri/toolkit": patch
---

- 修复：多选列表不再把「退出 / ← 返回」放进选项，改由提示文案标注「ESC 取消」或「ESC 返回上一步」，避免按 `a` 全选时把出口一并勾上
- 优化：`rule compose` 自定义模块、`scope` 扫描结果、`usage setup init` 的 Agent 多选统一走同一提示口径，ESC 均按正常导航以 `0` 结束
