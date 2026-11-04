---
"@fxri/toolkit": minor
---

- 新增：统一版本提示器，命令成功时按 `updateCheck.notify`（默认 `always`）在结尾输出一句话，TTY 走 stderr、非 TTY 走 stdout
- 新增：`updateCheck` 支持 `notify` / `channels.cli.notify` / `registry` 配置，registry 按配置 > 环境变量 > 项目 / 家目录 `.npmrc` > 默认解析，支持 `NPM_TOKEN` 与 `_authToken`
- 新增：`skills status` 文本与 `--format json` 增加版本检查块 / `versionStatus`，展示 CLI 当前版本、最新版本、registry 来源与提示频率
- 修复：升级提示仅在命令成功时输出，帮助、业务失败、解析失败、`skills path`、`skills status`、JSON 与 changelog 透传不再产生额外文本
