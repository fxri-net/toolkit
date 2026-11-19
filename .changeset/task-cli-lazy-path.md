---
"@fxri/toolkit": patch
---

- 优化：CLI 启动不再提前解析 `@changesets/cli` 的 bin 路径，`--help`、`tasks`、`skills` 等命令省去约 90ms 的模块定位开销，透传子命令首次执行时才解析并缓存
