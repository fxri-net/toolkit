---
"@fxri/toolkit": patch
---

- 重大：v1 顶层 `init` 只保留任务区初始化并迁为 `toolkit task init`，`--dir` / `--no-hooks` 随能力迁入 task 域；本机接入向导另用 `toolkit setup`
- 修改：init 实现迁入 `src/tasks/init.ts`，文档站链接常量上移到 `src/links.ts`，不留转发壳
- 修改：源码内提示文案、文档与技能引用统一为 `toolkit task init`，技能 `fxri-plan-task` 升版
- 文档：接入向导页落点为 `docs/cli/setup.md`，项目初始化说明并入 `docs/cli/task.md`
