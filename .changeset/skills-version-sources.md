---
"@fxri/toolkit": minor
---

- 新增：技能版本提示支持内置技能与第三方来源分别配置，内置默认 `inherit`，第三方支持 `channels.externalSkills` 与 `sources.<name>` 逐源覆盖
- 新增：`skills sources` 展示来源版本与生效提示频率；`skills sources notify <name> <频率>` 支持 `--scope global|project` 与 `--format json`
- 新增：`skills sources refresh [name]` 刷新来源缓存与版本，支持 `--dry-run` 与 `--format json`，只更新元数据、不自动安装
- 新增：`skills status` 的 `versionStatus` 增加 `channels`、`sources` 与两面 `skillsOutdated`
