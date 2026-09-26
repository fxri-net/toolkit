---
"@fxri/toolkit": minor
---

- 修改：`toolkit init` 生成的规范入口壳改为落在**已存在的**项目级技能目录的每一处（多 agent 混用团队各写一份、互不覆盖），一个候选目录都没有时回落 `.agents/skills`；不再为使用者未安装的 agent 凭空创建目录
- 优化：项目无 `AGENTS.md` 时，`init` 的跳过提示补充说明：本项目规范仍可经全局技能 `fxri-plan-to-task` 触达
