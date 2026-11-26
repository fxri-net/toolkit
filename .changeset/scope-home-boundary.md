---
"@fxri/toolkit": patch
---

- 修复：家目录不再被判定为项目根，`~` 下项目面安装、项目面卸载与项目层 / 本地层配置写入会报错并提示改用全局面
- 修复：`toolkit upgrade` 在 `~` 下只迁移全局层，版本门禁仅在本计划含项目层项时生效
- 修复：`skill status` / `skill reconcile` 在 `~` 下不再读取或收敛 home 下的项目产物，`--scope all` 降级为全局面并告警
