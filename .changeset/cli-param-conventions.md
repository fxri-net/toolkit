---
"@fxri/toolkit": patch
---

- 修改：`usage origins` / `usage capture` 的布尔开关改为 `--x` / `--no-x` 成对写法，旧的 `on|off` 取值移除
- 修改：`usage purge --older-than` 改为接受 `30d` / `24h` / `60m`，裸数字按非法值报错
- 修改：`usage uninstall` 新增 `--dry-run` 预演，`--purge-data` 更名为 `--purge`
- 修改：`usage export` / `usage import` 的文件格式参数由 `--format` 更名为 `--type`，`--format` 只用于 stdout
- 修改：`skills install --yes` 拆分为 `--yes` 与 `--use-saved`，两者语义区分
