---
"@fxri/toolkit": patch
---

- 修复：`toolkit conventions format` 把「单一事实源」中可解析到具体 `.md` 的路径（含 AGENTS.md、docs/、templates/ 等载体外文件）也转为相对链接，通配与不可解析项保持行内代码
- 修复：`conventions status` 与 `tasks check` 检出「归属为单个主题分册但源列指向别的分册」的路由错位
- 修改：`fxri-plan-to-task` 升至 1.12.6，规范载体规范把「载体内外二分」改为「可解析即链接 + 例外清单」
