---
"@fxri/toolkit": patch
---

- 重大：`toolkit init` 更名为 `toolkit task init`，顶层 `init` 不再提供任务区初始化，`--dir` / `--no-hooks` 随能力迁入 task 域
- 修改：init 实现迁入 `src/tasks/init.ts`，文档站链接常量上移到 `src/links.ts`，不留转发壳
- 修改：源码内提示文案、文档与技能引用统一为 `toolkit task init`，技能 `fxri-plan-task` 升版
- 文档：`docs/cli/init.md` 暂保留为旧链接落点，指向 `task init` 说明
