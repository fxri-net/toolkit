---
"@fxri/toolkit": patch
---

- 新增：`toolkit changelog doc` 将根 CHANGELOG 同步为文档站镜像页，支持 `--check`、路径 / 标题 / outline / frontmatter 配置
- 新增：`changelog version` 发版后自动同步镜像页，失败只告警不阻断
- 优化：镜像逻辑收敛进 CLI，各项目不再维护本地 `sync-changelog-doc.mjs`
- 修复：项目层配置查找止于 home，避免把全局层 `~/.toolkitrc.json` 误当项目层读取
