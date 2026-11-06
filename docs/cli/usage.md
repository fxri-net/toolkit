---
title: usage（技能使用情况）
---

# usage（技能使用情况）

> 本地统计技能使用次数、会话与触发词；默认关闭，数据只留在本机。

## 常用命令

```bash
toolkit usage init            # 初始化向导，默认保持关闭
toolkit usage info
toolkit usage enable
toolkit usage origins --first-party --third-party
toolkit usage scope --mode all
toolkit usage capture --trigger
toolkit usage stats --since 30d
toolkit usage stats --limit 10
toolkit usage doctor
```

## 子命令与选项

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `init` | 初始化向导：预设、Agent、来源、字段与存储 | `--yes`、`--preset`、`--agent`；非 TTY 退出码 2 |
| `uninstall` | 停用采集并卸载 Hook，默认保留数据 | `--yes`、`--agent`、`--purge`、`--dry-run` |
| `hooks install` | 只写 Hook 配置，不开启采集 | `--agent`、`--dry-run` |
| `hooks status` | 查看 Hook 安装状态与最近触发时间 | `--agent`、`--dir` |
| `hooks remove` | 只移除本包 Hook 命令 | `--agent` |
| `info` | 开关、配置路径、数据目录与计数 | `--dir`、`--format json` |
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
- 非交互初始化用 `toolkit usage init --yes --preset recommended --agent trae`；`custom` / `advanced` 预设仍需交互。
- 默认总开关、Agent、来源、技能范围、字段全部关闭；只开总开关不会产生记录。
- `usage info` 汇总已安装 Hook、上传开关与最近 Hook 错误；`hooks status` 以本地时间显示各 Agent 最近触发记录。
- Hook 安装与采集开启是两步：先 `hooks install`，再 `enable`。支持 Agent 与配置路径见 [Agent 接入](../usage/agents)。
- `include` 空列表等同 `none`；`exclude` 只列出要排除的技能。
- 触发词默认不采集；开启后截断 200 字并复用全局脱敏规则。
- `export` 输出的是已落盘事件；触发词是否出现取决于采集开关。
- `doctor` 只诊断不自动修复；索引不一致时用 `rebuild`，重复事件用 `dedupe`。跨适配器重复按 `(sessionId, toolUseId)` 计数。
- `import --type transcript` 从 Claude 或通用会话记录提取 `tool_use` 块；时间以导入时刻为准，不还原原始会话时间。

## 相关页面

- [技能使用情况概览](../usage/) · [使用情况配置](../usage/configuration) · [CLI 参考](../cli)
