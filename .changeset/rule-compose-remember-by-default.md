---
"@fxri/toolkit": patch
---

- 修改：`rule compose` 带 `--out` / `--copy` 时也记住本次组合（产物成功后写入），需要一次性不记忆时加 `--no-cache`
- 修改：`toolkit setup` 的规则步骤与 `rule compose` 共用组合记忆，确认的组合成为下次默认；`--yes` 仍不读写
