---
"@fxri/toolkit": patch
---

- 新增：`toolkit upgrade --prune-backups [--keep <n>]` 清理迁移备份目录与本包已知 `.bak`，支持 `--dry-run` 预览与 `--layers` 限定范围；缺省只清当前项目（`~` 下只清全局面）
- 修改：`toolkit setup` 的技能安装说明改为按所处目录自动判定全局或项目面
- 修改：`--help` 与 `toolkit help` 不再加载配置，避免帮助输出前的旧段告警与无谓写盘
