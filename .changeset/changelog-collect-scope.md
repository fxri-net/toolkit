---
"@fxri/toolkit": patch
---

- 修复：`changelog version` / `format` 遍历时改写第三方包日志的问题，改用依赖目录与产物目录语义判据加 gitignore 兜底，判据不依赖 git 跟踪状态
- 新增：`changelog version` / `format` 支持 `--exclude` / `--include` 覆盖遍历范围
