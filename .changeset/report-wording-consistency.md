---
"@fxri/toolkit": patch
---

- 修复：旧名副本无法确认归属时按失败条目回报并给出人工清理指引，不再提示无效的 `--force`
- 修复：`skills status` 汇总单列「来源已无此名」的旧名残留，指引 `uninstall --skills`
- 文档：补充 install 报告的 `migrated` 字段与「文本层补充视图不进 JSON」的口径
- 优化：`tasks archive --task` 帮助文案收敛为单任务描述
