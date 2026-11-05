---
"@fxri/toolkit": patch
---

- 修复：`tasks check --dir` 跨仓校验时入口壳改为按任务目录所属仓库查找，与 `conventions status --dir` 同口径，不再漏报入口壳告警
- 修改：`scope` 软告警补空格分支——端名与分类标签含空格时提示改用半角加号连接
