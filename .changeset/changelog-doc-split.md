---
"@fxri/toolkit": patch
---

- 新增：`release mirror` 按主版本分页，`docs/changelog.md` 只保留最新主版本，旧主版本归档到同名目录下的 `<major>.x.md`
- 新增：`release mirror --dry-run` 只列出将写入与清理的文件，不写盘
- 修改：`release mirror --check` 逐页比对主页与归档页，报告首个差异页并汇总缺页 / 多页 / 内容差异
- 优化：`docs.nav.pageSizeExclude` 支持相对路径前缀，默认整目录豁免 `docs/changelog/`
