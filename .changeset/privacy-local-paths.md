---
"@fxri/toolkit": patch
---

- 新增：`privacy.localPaths`（`off` / `warn` / `error`，默认 `off`）与写盘归一，开启后 `task add` / `update` / `import` / `archive` 把本机绝对路径归一为 `<本机>/…/末段`、`~/…/末段`
- 新增：本仓 `.toolkitrc.json` 启用 `error` 档自举；业务仓库不配置即保持 `off`，归档可继续保留本地路径
- 优化：`--no-redact` 只关密钥脱敏，路径归一由档位独立控制
