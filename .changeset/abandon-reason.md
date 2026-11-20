---
"@fxri/toolkit": patch
---

- 新增：`status: 已放弃` 的档须在正文写非空 `> 放弃原因：` 行，`tasks check` 缺行 / 空值 / 非已放弃残留均软告警
- 新增：`tasks archive` 对缺放弃原因的已放弃档给一条合并软告警（受 `--no-warn` 控制，不阻断归档）
- 修改：明确 `completed` 在已放弃档表示放弃（终结）时刻；统一「解除条件 / 重启条件」两个既有术语，不再引入第三种写法
- 文档：`SPEC.md` 新增 §2.4 放弃理由，任务规范通用版、`docs/guide.md` 与 `docs/cli/tasks.md` 同步

升级提示：新增为 warn 级校验，若项目要求 `tasks check` 的 warn 为 0，请先为存量已放弃档补齐放弃原因。
