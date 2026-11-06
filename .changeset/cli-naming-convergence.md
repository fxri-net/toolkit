---
"@fxri/toolkit": patch
---

- 修改：`toolkit skills remove` 更名为 `toolkit skills uninstall`，与 `skills install` 对称
- 修改：`toolkit usage status` 更名为 `usage info`，避免与 `usage stats` 一字之差
- 修改：`usage skills` 更名为 `usage scope`、`usage sources` 更名为 `usage origins`，避免与顶层 `skills` / `skills sources` 同名不同义
- 修改：`usage hooks uninstall` 更名为 `usage hooks remove`，与域级 `usage uninstall` 区分
- 修改：`usage ingest` 改为隐藏命令，不再出现在 `usage --help`
- 修改：`usage rule print` 简化为 `usage rule`
