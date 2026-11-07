---
title: usage（技能使用情况）
---

# usage（技能使用情况）

> 本地统计技能使用次数、会话与触发词；默认关闭，数据只留在本机。

## 常用命令

```bash
toolkit usage init            # 初始化向导，默认保持关闭
toolkit usage info
toolkit usage channel rule    # 采集通道：rule（全局规则上报）/ hook（Agent Hook）
toolkit usage rule            # 输出可复制进全局规则的文案
toolkit usage record --skill fxri-plan-to-task --skill fxri-plan-review   # 规则通道批量上报（静默）
toolkit usage enable
toolkit usage origins --first-party --third-party
toolkit usage scope --mode all
toolkit usage capture --trigger
toolkit usage stats --since 30d --limit 10
toolkit usage doctor
```

## 子命令与选项

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `init` | 初始化向导：预设、通道、Agent（仅 hook）、来源、字段与存储；重复执行沿用历史选择，已配置时默认「保持当前配置」并只重装 Hook | `--yes`、`--preset`、`--channel rule\|hook`、`--agent`；非 TTY 退出码 2 |
| `uninstall` | 停用采集并卸载 Hook，默认保留数据 | `--yes`、`--agent`、`--purge`、`--dry-run` |
| `channel` | 查看或切换采集通道；切到 `rule` 提示清理 Hook，切到 `hook` 提示删除规则段 | `rule\|hook`、`--format json`；非法值报错退出 |
| `record` | 规则通道批量上报：入队后立即返回、按出现次数计数、静默、退出码恒 0；明细由后台反查补齐 | `--skill`（可重复或逗号分隔）、`--session`、`--dir` |
| `flush` | 内部命令：消费上报队列并写入事件（后台 worker 与惰性兜底调用，通常无需手动执行） | `--dir`、`--limit` |
| `hooks install` | 只写 Hook 配置，不开启采集；通道为 rule 时提示不生效 | `--agent`、`--dry-run` |
| `hooks status` | 查看 Hook 安装状态与最近触发时间；通道与 Hook 不一致时告警 | `--agent`、`--dir` |
| `hooks remove` | 只移除本包 Hook 命令 | `--agent` |
| `info` | 开关、通道、配置路径、数据目录、队列与计数 | `--dir`、`--format json` |
| `enable` / `disable` | 打开 / 关闭总开关 | — |
| `origins` | 查看或设置来源开关 | `--first-party` / `--no-first-party`、`--third-party` / `--no-third-party`、`--unmanaged` / `--no-unmanaged` |
| `scope` | 查看或设置技能范围 | `--mode`、`--add`、`--remove` |
| `capture` | 查看或设置采集字段 | `--trigger` / `--no-trigger`、`--args` / `--no-args`、`--outcome` / `--no-outcome` |
| `storage` | 查看或设置存储 | `--dir`、`--rotation`、`--retention`、`--max-size` |
| `stats` | 按技能 / 会话 / 触发词聚合 | `--by skill\|session\|trigger`、`--limit`、`--since`、`--agent`、`--source`、`--skill`、`--unused` |
| `export` | 导出事件 | `--type csv\|json\|jsonl`、`--out`、`--since` |
| `import` | 导入事件或 transcript | `--type json\|jsonl\|transcript`、`--file`、`--agent`、`--dry-run` |
| `log` | 手工补录一次使用 | `--skill`、`--session`、`--agent`、`--prompt`、`--args`、`--outcome` |
| `dedupe` | 压缩重复事件 | `--dir` |
| `purge` | 按保留期或全部清理 | `--older-than 30d`、`--all`、`--dry-run` |
| `rebuild` | 从事件文件重建索引 | `--dir` |
| `doctor` | 诊断目录、索引与重复 | `--dir`、`--format json` |
| `upload setup` | 上传配置向导 | `--yes`、`--protocol`、`--endpoint`、`--headers` |
| `upload status` | 上传开关、端点与待上传数量 | `--format json` |
| `upload send --dry-run` | 预览批次与载荷，不发送 | `--limit` |
| `upload send` | 手工发送一批 | `--limit` |
| `rule` | 输出可复制全局规则 | — |

## 时间参数

`--since` 支持 `30d`、`24h`、`60m` 与 `YYYY-MM-DD`；非法值报错退出，不静默回落到全部时间。

## 边界与注意

- 无参数执行 `toolkit usage` 进入交互菜单；非 TTY 打印帮助并以退出码 2 结束。
- 通道二选一：`usage.channel` 为 `rule` 时只有 `usage record` 写入、Hook 不写入；为 `hook` 时只有 Hook 写入、`record` 静默跳过。切换通道不会自动清理另一侧配置。
- 非交互初始化用 `toolkit usage init --yes --preset recommended --channel rule`（默认 `rule`）；`--channel hook` 时会安装 Hook 并需要检测到 Agent，`--preset off` 与 `--channel` 同时出现时 `off` 优先；`custom` / `advanced` 预设仍需交互。
- 默认总开关、Agent、来源、技能范围、字段全部关闭；只开总开关不会产生记录。
- `usage info` 汇总通道、已安装 Hook、上传开关与最近 Hook 错误；`hooks status` 以本地时间显示各 Agent 最近触发记录，`--all` 可一并列出本机未安装的 Agent（查残留配置）。
- `record` 只统计 toolkit 管理的技能（包内一方与 toolkit 登记来源），且必须命中 `usage` 配置（总开关、来源、技能范围）；未托管技能与未命中配置的技能静默忽略。规则路径不产生触发词与参数，这两类字段由后台反查会话记录补齐。
- **异步消费**：`record` 只入队，随后由派生 worker 或下一次 `usage` 命令消费；`stats` 可能有数秒到一条命令的延迟，`info` 的「队列」行显示积压条数。反查失败只丢明细字段，技能名与次数照常落盘。
- `rule` 在「当前配置不会统计任何技能」时先向 stderr 提示空转，再输出规则文案。
- `usage stats --by trigger` 每条输出「次数｜最近调用时间｜触发词｜技能」，便于看某技能的调用明细。
- Hook 安装与采集开启是两步：先 `hooks install`，再 `enable`。支持 Agent 与配置路径见 [Agent 接入](../usage/agents)。
- `hooks install` 只处理本机已检测到的 Agent；显式 `--agent` 未检测到时告警跳过，全部跳过才以非 0 退出。`hooks remove` / `uninstall` 不要求 Agent 仍在本机，便于清理残留配置。
- DeepSeek Harness 还需安装官方桥接插件 `@deepseek-ai/dsh-hooks-claude-code`，步骤见 [Agent 接入](../usage/agents)。
- Hook 命令按当前平台生成：Windows 经 PowerShell 包装（`powershell -NoProfile -Command "& '…'"`），macOS / Linux 用单引号拼接；升级后重跑 `hooks install` 即可把存量旧形态刷成新形态，`hooks status` / `doctor` 会提示形态过期。
- `include` 空列表等同 `none`；`exclude` 只列出要排除的技能。
- 触发词默认不采集；开启后截断 200 字并复用全局脱敏规则。
- `export` 输出的是已落盘事件；触发词是否出现取决于采集开关。
- `doctor` 只诊断不自动修复；索引不一致时用 `rebuild`，重复事件用 `dedupe`。跨适配器重复按 `(sessionId, toolUseId)` 计数。
- `import --type transcript` 从 Claude 或通用会话记录提取 `tool_use` 块；时间以导入时刻为准，不还原原始会话时间。

## 相关页面

- [技能使用情况概览](../usage/) · [使用情况配置](../usage/configuration) · [CLI 参考](../cli)
