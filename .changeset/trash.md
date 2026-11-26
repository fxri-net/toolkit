---
"@fxri/toolkit": patch
---

- 新增：`toolkit trash list|restore|prune|stats`，支持来源命令 / 时间过滤、恢复到指定目录、按 `--keep` / `--older-than` / `--all` 清理与占用统计
- 修改：`skill uninstall`、`skill install` 替换 / 改名清理的旧产物与 `--prune` 清理项、`upgrade --prune-backups`、`upgrade --restore` 的用户可见删除默认进入项目内回收站，`--no-trash` 才永久删除
