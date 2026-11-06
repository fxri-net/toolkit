---
"@fxri/toolkit": patch
---

- 修改：`changelog` 的 `version` / `format` / `doc` / `audit` 改为真子命令，各自拥有独立帮助与选项
- 修改：`changelog --audit-net` 改为 `changelog audit`
- 修改：`--check` / `--from` / `--to` / `--title` / `--outline` / `--no-frontmatter` 归 `changelog doc`，`--history` / `--no-sync-doc` 归 `changelog version`
- 修改：`changelog --history format` 改为 `changelog format --history`，`changelog --lang en version` 改为 `changelog version --lang en`
- 修改：同步发版技能 `fxri-release-changelog` 至 1.3.2，命令写法与选项位置说明随子命令化更新
