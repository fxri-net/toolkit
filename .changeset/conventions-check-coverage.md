---
"@fxri/toolkit": patch
---

- 新增：`toolkit conventions status` 输出 `checkCoverage`（`covered` / `uncovered` / `unknownIds`），一句话结论追加「其中 N 条无检测入口」
- 新增：检测代码可用 `// C-<n>` 行内注释标注对应规范，索引外引用以 info 提示
- 修改：`fxri-plan-to-task` references 补「检测入口标注约定」，技能版本 1.9.8
