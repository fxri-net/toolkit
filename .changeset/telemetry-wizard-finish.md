---
"@fxri/toolkit": patch
---

- 新增：`telemetry init --yes --preset` 与 `upload setup --yes` 非交互入口
- 新增：`telemetry uninstall` 停用采集、卸载 Hook，默认保留本地事件
- 优化：`hooks status` 显示最近触发时间，`telemetry status` 汇总 Hook、上传与最近错误
