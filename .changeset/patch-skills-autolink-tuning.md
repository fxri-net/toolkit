---
"@fxri/toolkit": patch
---

优化技能链接自愈的开销与稳定性，并修正 `toolkit skills status` 的处置指引。

- 自愈改为一次列目录取现场条目类型，不再逐条 `lstatSync`，稳态开销明显下降
- `toolkit skills status` 末尾汇总按型给出指引：缺失 / 悬空 / 指向错误 / 副本漂移用 `install` 补齐，同名冲突用 `install --force` 覆盖
- 收窄状态分类口径：同名实体目录只有登记为本包副本时才算「副本已漂移」（裸 `install` 即可刷新），未登记的属用户 / 上游产物，报「同名冲突」并需 `--force` 覆盖
- 修复自愈「重建失败」时状态记录被静默写掉的问题：失败条目保留在 `~/.agents/.toolkit-skills.json`，下次运行仍会重试
