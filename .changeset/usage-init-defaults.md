---
"@fxri/toolkit": patch
---

- 修改：`usage init` 向导默认启用并覆盖一方与第三方技能，末尾「确认写入配置」默认是，一路回车不再得到空配置
- 修改：`usage init --yes` 未给 `--preset` 时报错退出并提示合法取值，不再静默按关闭处理
- 文档：同步 `usage init` 的默认值与 `--yes` 约束说明
