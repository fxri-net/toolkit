修复：范围字段多值口径落地并补齐污染检测

- 任务范围（scope）多值以半角加号分隔（如 `toolkit+lxgl-web`）；`--scope` 过滤改按任一段命中，`tasks stats` 按范围拆段统计
- `tasks check` 对范围含顿号/逗号/括号软告警并给修复指引
- `tasks import` 对范围列含顿号/逗号/括号提示按单值写入（不自动转换）
- `tasks normalize` 检出历史归档范围污染：顿号/逗号分隔可 `--fix` 自动归一为半角加号，括号注释仅提示人工确认

---

'@fxri/toolkit': patch
