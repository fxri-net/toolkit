---
"@fxri/toolkit": patch
---

- 修改：环境变量统一为 `FX_TOOLKIT_` 前缀（`FX_TOOLKIT_REDACT` / `FX_TOOLKIT_CHECK_WARN` / `FX_TOOLKIT_NO_UPDATE_CHECK` / `FX_TOOLKIT_DEBUG_UPDATE_CHECK` / `FX_TOOLKIT_USAGE_DIR` / `FX_TOOLKIT_USAGE_AGENT` / `FX_TOOLKIT_USAGE_NO_WORKER` / `FX_TOOLKIT_USAGE_SESSION`），避免同组多产品变量撞名
- 修改：旧名（`FX_*` 与 `TOOLKIT_USAGE_*`）继续兼容读取，生效时 stderr 提示一次；新旧同时存在取新名；旧名计划下个 major 移除
- 修复：`TOOLKIT_TELEMETRY_DIR` 的兼容提示指向新的 `FX_TOOLKIT_USAGE_DIR`
