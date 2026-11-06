---
"@fxri/toolkit": minor
---

- 新增：Cursor / Codex / Copilot 适配器，兼容 snake_case 与 camelCase 事件字段
- 新增：transcript 导入与手工补录通道，覆盖没有 Hook 的 Agent
- 优化：按 sessionId + toolUseId 做跨适配器去重，doctor 报告重复组数
