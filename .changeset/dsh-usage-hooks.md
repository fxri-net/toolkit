---
"@fxri/toolkit": minor
---

- 新增：`usage hooks install --agent dsh` 支持 DeepSeek Harness——写 `~/.dsh/hooks.json`，并在各 profile 的 `cordis.patch.yml` 维护官方桥接插件条目，配合 `@deepseek-ai/dsh-hooks-claude-code` 记录技能使用
- 修改：`hooks install` 只处理本机已检测到的 Agent，显式指定未安装的 Agent 告警跳过（全部跳过时非 0 退出），不再凭空创建配置；`hooks remove` / `uninstall` 仍可清理已卸载工具的残留
- 文档：补齐各 Agent 的启用、关闭与卸载步骤，新增 DeepSeek Harness 接入说明
