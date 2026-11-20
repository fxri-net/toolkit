---
"@fxri/toolkit": minor
---

- 新增：新增 `skills gate [on|off]` 查看 / 切换内容闸门，`skills mount [dir]` 承接批量挂载；`scope mount` 保留为提示迁移的别名
- 修改：`skills install` 三步交互支持 ESC 逐级返回，取消与确认统一走交互基座，互斥校验收敛为冲突表
- 修改：`skills install --all` 与 `skills bump --all`（含 patch / --set）非交互须显式 `--yes`，`--dry-run` 只预览
- 修改：`skills sources notify` 接受 `--layer` 作为配置层别名，与 `--scope` 冲突时报错
