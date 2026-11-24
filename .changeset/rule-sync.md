---
"@fxri/toolkit": patch
---

- 新增：`toolkit rule sync` 把提交信息规则同步到项目内 `.trae/rules/git-commit-message.md`，支持 `--dry-run` 看差异、`--yes` 直接写入
- 新增：同步文件首部记录生成版本与正文摘要，无差异零改动；被手改或无生成标记时默认停在「查看」，不默认覆盖
- 修改：`toolkit status` 对项目内提交规则漂移只提示「跑 toolkit rule sync 更新」，不改文件
- 文档：`docs/cli/rule.md`、`docs/cli/status.md`、`docs/cli/setup.md`、`docs/rules/commit.md` 同步显式同步口径
