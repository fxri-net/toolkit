---
"@fxri/toolkit": patch
---

- 修复：`toolkit init` 写入或保持 `prepare` 刷新钩子时，若 `package.json` 未标 `private` 且无 `files` 白名单，报告新增提示——`prepare` 在 `npm pack` / `npm publish` 前也会执行、可能把项目面技能产物（`.agents/skills/`、`.toolkit/`）打进 npm 包，发布型包请把二者加入 `files` 白名单或 `.npmignore`（只提示、不代改）
- 文档：`docs/faq.md` / `docs/guide.md` / `docs/cli.md` 同步发布型包注意事项
