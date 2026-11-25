---
"@fxri/toolkit": patch
---

- 修改：`task init` 判忽略项是否已覆盖改按 gitignore 语义（通配 / 目录规则 / 否定 / `**`），非 git 目录不再只认全名，已有 `*.lock`、`*.local.json`、`.toolkitrc.*.bak` 时不再追加冗余行
- 修改：两份配置备份合并写入为一条 `.toolkitrc.*.bak`，命中集合仅限配置备份，不含 `.toolkitrc.json` 等团队配置本体
- 修改：存量项目重跑 `task init` 时，片段里分开的两行 `.bak` 会收敛为一条 `.toolkitrc.*.bak`，覆盖范围不变
