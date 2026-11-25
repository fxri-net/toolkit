---
"@fxri/toolkit": patch
---

- 修复：`fxri-plan-review` 输出纪律与「不自动改任务文件」自相矛盾——统一为只输出结论与表格、标记后续是否落档，落档由落档流程执行，不再承诺直接写入；description 去掉未实现的「修订计划表」
- 修复：`fxri-release-changelog` 只列三种类型前缀，改为指向 `references/changelog-format.md` 的完整前缀表，并在 `AGENTS.md` 同步前缀表真源位置
- 修复：`fxri-plan-recap` 引用兄弟技能 `task-spec.md` 缺 `../` 前缀，与同文件其它引用口径不一致
- 修复：`fxri-plan-task` 读取地图漏 `conflict-check.md`、可跳过列计数失真；补「四级时间源取证」的口径指针
