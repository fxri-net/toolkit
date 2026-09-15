---
"@fxri/toolkit": patch
---

修复：修复文档站内跨页锚点死链并补全守门覆盖

- 修正 README 与 docs 中 11 处跨页锚点死链（标题改名后未同步，点击不跳转），涉及 `README.md`、`docs/cli.md`、`docs/faq.md`、`docs/getting-started.md`、`docs/guide.md`、`docs/handbook.md`
- 文档一致性测试的锚点用例此前会跳过全部跨页链接（VitePress 把 `.md` 渲染为 `.html` 后被扩展名判断排除），现归一回 `.md` 并按所在目录相对解析
- 扫描范围由 `docs/*.md` 扩至仓库根 `*.md` 与 `skills/**/*.md`，跨页锚点写错、标题改名漏同步均会拦下
