---
"@fxri/toolkit": patch
---

- 文档：文档站补齐站点成熟度要素——站点标题与内页标签统一为中文品牌「方弦工具集」，导航栏新增品牌 logo 与 favicon，配置社交分享卡片 og-image（1200×630 品牌图）；开启「最后更新于」（按 git 提交时间）与「在 GitHub 上编辑此页」，新增站点页脚与 sitemap；新增「更新日志」页面镜像根 CHANGELOG.md 全量历史并挂载导航与侧栏入口，提供 `pnpm sync:changelog-doc` 命令随发版自动同步；README 顶部增加品牌 logo；CI 文档站构建改为完整克隆保证 lastUpdated 日期准确
