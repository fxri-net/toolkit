---
"@fxri/toolkit": major
---

- 修改：报告类 `--format json` 输出统一为 `{ schemaVersion, command, code, message, data, extend, debug, issues }` 八键信封，域载荷收进 `data`
- 修改：`command` 为实际命令路径（如 `task`、`task list`、`task stats`、`skill status`、`scope policy list`、`usage config channel`）
- 修改：用整数 `code` 表达业务结论（成功 `200`、报告含 error `422`），移除可被推导的 `ok`；`message` 缺省为 `成功` / `成功（N 项提示）` / 首条 error 文案
- 修改：进程退出码移入 `extend.exitCode`，与 `code` 分离；`extend` / `debug` 恒为对象（缺省 `{}`），`issues` 恒为数组（缺省 `[]`）
- 修改：check 类报告存在的问题同时映射到顶层 `issues`（`level` / `scope` / `message`）
- 修改：`usage data export`、`task export <path>` 与 `release changeset` 透传保持原格式，不套信封
