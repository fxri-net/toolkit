---
"@fxri/toolkit": patch
---

- 修改：`--clean-backups` / `--drop-legacy` 改名为 `--prune-backups` / `--prune-legacy`，与既有 `--prune` 动词族一致
- 修改：`--prune-backups` 缺省只清当前项目，`~` 下只清全局面；显式 `--layers` 才跨面清理
- 修复：全局 `.bak` 单独收编到全局备份根，不再进入当前项目备份目录
