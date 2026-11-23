---
"@fxri/toolkit": patch
---

- 新增：作用域策略支持 `delivery`（`full` / `gated` / `off`），同一条规则同时给出生效结论与内容形态，可表达「同一技能在 A 目录入口壳、在 B 目录全文」
- 修复：作用域判定与分发形态改为同一套解析器，消除「策略允许、形态却是入口壳」的分歧
- 新增：`scope policy add --delivery`；`scope policy list` 与 `scope status --skills` 显示形态；`deny` 与 `full` 互斥，加载告警并丢弃
