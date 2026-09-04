---
"@fxri/toolkit": patch
---

修复：tasks archive 对 CRLF 源文件做换行还原时二次转换产生双重 CR（`\r\r\n`），读取 active 任务统一归一为 LF、解析归档块剥离孤立 CR；文档修订：根 README 特性列表补零依赖 AI 技能包条目；skills/README.md 补 npm 包自带技能目录路径（node_modules/@fxri/toolkit/skills/）；fxri-plan-to-task 可选加速节补 `toolkit tasks normalize`
