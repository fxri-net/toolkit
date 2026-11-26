---
"@fxri/toolkit": patch
---

- 修改：`fxri-plan-task` / `fxri-plan-review` 收紧微操作边界，需同步生成物、测试或文档的改动不再视为对象级微操作
- 修改：全局规则「工作流」与仓库协作规则同步该边界，多文件同步先回方案态
