---
"@fxri/toolkit": patch
---

- 新增：`usage.channel` 配置与 `usage channel [rule|hook]` 命令——规则上报与 Agent Hook 二选一，非法值报错退出，切换时提示清理另一侧配置
- 新增：`usage record --skill <名称> [--skill ...]` 规则通道批量上报；成功静默、退出码恒 0、失败只走 stderr，同批同名技能只记一条，只统计 toolkit 管理且命中 `usage` 配置的技能
- 新增：`usage init --channel`（默认 `rule`）——规则通道只写采集配置、不安装 Hook、不依赖 Agent 检测；`--preset off` 与 `--channel` 同现时 `off` 优先
- 修改：`usage info`、`hooks status`、`doctor` 展示采集通道，并在「通道与 Hook 实际状态不一致」时告警；`hooks install` 在规则通道下提示 Hook 不会写入
- 修改：`usage rule` 文案改为「每批工具调用结束后合并上报一次」，与 `docs/rules/usage.md` 同源；配置不会统计任何技能时先向 stderr 提示空转
- 文档：补规则 / Hook 两通道对比、DeepSeek Harness 运行沙箱限制与改用规则通道的说明，同步 CLI、配置与事件 Schema
- 修改：`usage record` 改为入队即返回，由后台 worker 或下一次 `usage` 命令消费；同一技能调用几次就记几次，不再去重
- 新增：消费时反查会话记录补齐触发词 / 参数 / 结果 / 耗时（Claude Code 可读；dsh 需本机 `zstd`；Trae 暂无可读会话），反查失败只丢字段、不影响技能名与次数
- 新增：内部命令 `usage flush` 与命令入口的惰性兜底，`usage info` 展示队列积压
- 修改：技能识别改用「包内清单 + 状态文件登记来源」的托管名单，不再按 `fxri-` 前缀猜测
- 文档：补明细字段可得性说明——各 Agent 会话记录位置与可读条件、字段为空的三种原因与补救（`usage log` 补录 / 安装 `zstd` / 升级 Node 22.15+），并写明 Node 20 仍为受支持的最低版本
