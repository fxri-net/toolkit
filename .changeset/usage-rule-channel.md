---
"@fxri/toolkit": patch
---

- 新增：`usage.channel` 配置与 `usage channel [rule|hook]` 命令——规则上报与 Agent Hook 二选一，非法值报错退出，切换时提示清理另一侧配置
- 新增：`usage record --skill <名称> [--skill ...]` 规则通道批量上报；成功静默、退出码恒 0、失败只走 stderr，同批同名技能只记一条，只统计 toolkit 管理且命中 `usage` 配置的技能
- 新增：`usage init --channel`（默认 `rule`）——规则通道只写采集配置、不安装 Hook、不依赖 Agent 检测；`--preset off` 与 `--channel` 同现时 `off` 优先
- 修改：`usage info`、`hooks status`、`doctor` 展示采集通道，并在「通道与 Hook 实际状态不一致」时告警；`hooks install` 在规则通道下提示 Hook 不会写入
- 修改：`usage rule` 文案改为「每批工具调用结束后合并上报一次」，与 `docs/rules/usage.md` 同源；配置不会统计任何技能时先向 stderr 提示空转
- 文档：补规则 / Hook 两通道对比、DeepSeek Harness 运行沙箱限制与改用规则通道的说明，同步 CLI、配置与事件 Schema
