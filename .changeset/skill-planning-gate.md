---
"@fxri/toolkit": patch
---

- 修改：`fxri-plan-to-task` 增加讨论态 / 方案态 / 执行态三态闸门，需求清单、意见与「继续评估」不构成执行授权，「开始」按批次失效
- 修改：`fxri-plan-to-task` 区分「落档」与「继续评估」并给出落档的动作边界；任务档在规划态的修订不进入提交，提交只在归档后一次
- 修改：`fxri-plan-review` 落档由 `fxri-plan-to-task` 执行且不提交，闸门判定改指三态
