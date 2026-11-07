---
"@fxri/toolkit": patch
---

- 新增：`usage hooks install --agent dsh` 支持 DeepSeek Harness——写 `~/.dsh/hooks.json`，并在各 profile 的 `cordis.patch.yml` 维护桥接插件条目，配合 Claude Code 兼容层桥接插件记录技能使用
- 修改：`hooks install` 只处理本机已检测到的 Agent，显式指定未安装的 Agent 告警跳过（全部跳过时非 0 退出），不再凭空创建配置；`hooks remove` / `uninstall` 仍可清理已卸载工具的残留
- 修复：dsh 安装提示改为 CLI 安装，并说明桌面版「添加插件」只接受声明 `dsh.bundle` 的组合包、会拒绝桥接插件
- 修复：官方桥接插件与 dsh 0.2.x 不兼容，默认改用社区实现 `@dsh-cc/hooks-claude-code`；条目按已安装的包名写入（官方版恢复兼容后自动切回）
- 修复：`cordis.patch.yml` 非顶层数组时跳过写入并告警，避免写坏用户配置
- 文档：补齐各 Agent 的启用、关闭与卸载步骤，新增 DeepSeek Harness 接入说明
