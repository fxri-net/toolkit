---
"@fxri/toolkit": patch
---

- 修改：`usage stats` 合并 `top` / `sessions` / `triggers`，改用 `--by skill|session|trigger` 与 `--limit`
- 修改：`usage upload --once` 改为 `usage upload send` 子命令，`--dry-run` / `--limit` 随之归入
- 修改：`docs theme --check` / `--write` 改为 `docs theme check` / `docs theme write` 子命令
- 修改：`skills sources notify` 的频率取值改为 `--frequency always|daily|weekly|off`
