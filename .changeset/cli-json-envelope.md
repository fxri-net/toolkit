---
"@fxri/toolkit": major
---

- 修改：报告类 `--format json` 输出统一为 `{ schemaVersion, command, ok, data, issues }` 信封，域载荷收进 `data`
- 修改：`command` 为实际命令路径（如 `task`、`task list`、`task stats`、`skill status`、`scope policy list`、`usage config channel`）
- 修改：check 类报告的 `ok` 反映结论（存在 error 时为 `false`）；问题同时映射到顶层 `issues`（`level` / `scope` / `message`）
- 修改：`usage data export`、`task export <path>` 与 `release changeset` 透传保持原格式，不套信封
