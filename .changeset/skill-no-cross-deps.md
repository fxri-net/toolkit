---
"@fxri/toolkit": patch
---

- 修改：`fxri-writing-docs` 的落地步骤恢复「按仓库发版链路发布」，执行方式以仓库约定为准，变更集写法与 bump 判定仍指向 `fxri-release-changelog`
- 修改：`fxri-release-changelog` 的归档检查改为「发版前须已归档」，归档方式按仓库既有约定，`toolkit task archive` 降为无专用流程时的默认手段
- 修改：`fxri-plan-review` 恢复用户明确接受后可直接落档（实施方案、拆分、验收与计划表均可修正），边界为不改用户已确认的目标与范围，写入方式按仓库既有流程
- 修改：`fxri-plan-review` 的 references 同步落档口径，去掉「不写任务文件 / 交给落档流程」的绝对禁令
