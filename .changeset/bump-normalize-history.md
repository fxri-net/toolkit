---
"@fxri/toolkit": patch
---

- 修改：`release bump` 在同步镜像前自动归一历史块——changesets 写入会重排多行条目，原先会把中间态写进归档页、下次归一又整体回退；`--history` 保留为兼容参数
- 修改：`fxri-release-changelog` 技能修正空行成因说明，并注明 bump 已默认归一、手工 `changeset version` 后需自行补跑
