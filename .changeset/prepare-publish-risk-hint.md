---
"@fxri/toolkit": patch
---

- 修复：`toolkit init` 的发布型包误打包提示不再绑定 `prepare` 刷新钩子——判据独立为「`package.json` 未标 `private` 且无 `files` 白名单」，覆盖原先漏报的 `--no-hooks`、未声明本地依赖、非等价 `prepare` 等情形
- 修复：上述提示的产物清单补全——加入内置任务区 `.tasks/`（任务区外置时不计入打包面），并说明 `npm` 无 `.npmignore` 时退回 `.gitignore` 的打包面原理
- 文档：`docs/faq.md` / `docs/guide.md` / `docs/cli.md` 同步发布型包注意事项
