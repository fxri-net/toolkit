---
title: check 与 tasks（校验与任务区）
---

# check 与 tasks：校验与任务区

> 软告警开关、勾选框与词标记扫描，以及任务目录与导入列映射。

## check：校验与告警

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `warnings` | boolean | `true` | 软告警总开关（`tasks check` 的 warn 输出、归档/发版提醒、changelog 无类型前缀条目告警）；被 `--warn/--no-warn` 与 `FX_CHECK_WARN` 覆盖 |
| `includeCheckbox` | boolean | `true` | `tasks check` 是否把正文未勾选的 `- [ ]` 扫为未闭合待办 |
| `pendingMarkers` | boolean | `true` | `tasks check` 是否扫描词标记（待办/待实施/…）；只认正文行首子项形态，跳过标题、代码块与引用块 |

`tasks check` 另校验 `scope` 取值是否在 `.tasks/conventions/index.md` 的端清单内（`common` 恒合法），载体缺失时跳过；只校验 active 任务，不回溯归档。

## tasks：任务目录与导入列映射

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `dir` | string | `".tasks"` | 任务目录；支持绝对路径或 `../` 相对路径，任务区可放项目外（如独立文档仓库）；被 CLI `--dir` 覆盖，`init`、`tasks` 与 `conventions` 同口径 |
| `importColumns` | object | 无 | 键 = 实际表头列名（匹配不区分大小写），值 = 标准字段名（`title`/`status`/`owner`/`scope`/`created`/`updated`/`completed`/`depends`/`body`）；优先级高于内置别名表 |

```json
{
  "tasks": {
    "dir": "../my-tasks-repo",
    "importColumns": { "我的标题": "title", "Deadline": "completed" }
  }
}
```

## 相关页面

- 参考：[配置参考总览](../config) · [tasks 命令](../cli/tasks) · [配置体检](../cli/config)
