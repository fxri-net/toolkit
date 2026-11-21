---
"@fxri/toolkit": minor
---

- 新增：`docs/upgrade-v2.md` 升级说明，覆盖三步升级、命令 / 技能 / 配置段对照、JSON 信封与锚点变化
- 新增：`scripts/generate-upgrade-table.mjs` 从命令注册表生成对照表，`pnpm verify` 校验生成段未漂移
- 优化：v1 更新检查识别 2.x 时先引导阅读升级页，不直接给出安装命令
