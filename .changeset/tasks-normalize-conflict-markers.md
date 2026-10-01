---
"@fxri/toolkit": minor
---

新增：`toolkit tasks normalize` 支持检出并解决归档文件中的 git 冲突标记——多人同天归档、`pull` 后同一归档文件出现冲突标记时，`--fix` 按并集去重 + 完成时间降序确定性合并（保留冲突两侧任务块、丢弃 diff3 的 `|||||||` base 段与全部标记行），无需人工逐块合并；`toolkit tasks check` 同步以软告警暴露
文档：`fxri-plan-to-task` 技能同步归档冲突标记处置口径（失败模式表、手工归档步骤、多写者约定），版本 1.4.5 → 1.5.0
