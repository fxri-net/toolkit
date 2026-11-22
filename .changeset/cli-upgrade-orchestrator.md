---
"@fxri/toolkit": minor
---

- 新增：`toolkit upgrade` 一键迁移 v1 工程——三层配置段名与旧闸门键、`package.json` 旧钩子与旧命令名、技能旧名、规范载体与历史 `.bak`
- 新增：迁移前计划预览、逐项确认、迁移后残留复检，以及 `--check` / `--dry-run` / `--format json` / `--restore` 备份恢复
- 修改：v1→v2 升级提示改为先执行 `toolkit upgrade`，升级说明页与 CLI 参考同步新增「升级迁移」入口
