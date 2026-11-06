---
title: telemetry（技能使用遥测）
---

# telemetry（技能使用遥测）

> 本地统计技能使用次数、会话与触发词；默认关闭，数据只留在本机。

## 常用命令

```bash
toolkit telemetry init            # 初始化向导，默认保持关闭
toolkit telemetry status
toolkit telemetry enable
toolkit telemetry sources --first-party on --third-party on
toolkit telemetry skills --mode all
toolkit telemetry capture --trigger on
toolkit telemetry stats --since 30d
toolkit telemetry top --limit 10
toolkit telemetry doctor
```

## 子命令与选项

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `init` | 初始化向导：预设、Agent、来源、字段与存储 | 交互式；非 TTY 退出码 2 |
| `hooks install` | 只写 Hook 配置，不开启采集 | `--agent`、`--dry-run` |
| `hooks status` | 查看 Hook 安装状态 | `--agent` |
| `hooks uninstall` | 只移除本包 Hook 命令 | `--agent` |
| `status` | 开关、配置路径、数据目录与计数 | `--dir`、`--format json` |
| `enable` / `disable` | 打开 / 关闭总开关 | — |
| `sources` | 查看或设置来源开关 | `--first-party on\|off`、`--third-party`、`--unmanaged` |
| `skills` | 查看或设置技能范围 | `--mode`、`--add`、`--remove` |
| `capture` | 查看或设置采集字段 | `--trigger`、`--args`、`--outcome` |
| `storage` | 查看或设置存储 | `--dir`、`--rotation`、`--retention`、`--max-size` |
| `stats` | 按技能 / Agent / 来源聚合 | `--since`、`--agent`、`--source`、`--skill`、`--unused` |
| `top` | 技能排行 | `--limit`、`--since` |
| `sessions` | 按会话列出 | `--since`、`--limit` |
| `triggers` | 按触发词查看 | `--skill`、`--limit`、`--since` |
| `export` | 导出事件 | `--format csv\|json\|jsonl`、`--out`、`--since` |
| `import` | 导入事件 | `--format json\|jsonl`、`--file`、`--dry-run` |
| `log` | 手工补录一次使用 | `--skill`、`--session`、`--agent`、`--prompt`、`--args`、`--outcome` |
| `dedupe` | 压缩重复事件 | `--dir` |
| `purge` | 按保留期或全部清理 | `--older-than`、`--all` |
| `rebuild` | 从事件文件重建索引 | `--dir` |
| `doctor` | 诊断目录、索引与重复 | `--dir`、`--format json` |
| `rule print` | 输出可复制全局规则 | — |

## 时间参数

`--since` 支持 `30d`、`24h`、`60m` 与 `YYYY-MM-DD`；非法值报错退出，不静默回落到全部时间。

## 边界与注意

- 无参数执行 `toolkit telemetry` 进入交互菜单；非 TTY 打印帮助并以退出码 2 结束。
- 默认总开关、Agent、来源、技能范围、字段全部关闭；只开总开关不会产生记录。
- Hook 安装与采集开启是两步：先 `hooks install`，再 `enable`。支持 Agent 与配置路径见 [Agent 接入](../telemetry/agents)。
- `include` 空列表等同 `none`；`exclude` 只列出要排除的技能。
- 触发词默认不采集；开启后截断 200 字并复用全局脱敏规则。
- `export` 输出的是已落盘事件；触发词是否出现取决于采集开关。
- `doctor` 只诊断不自动修复；索引不一致时用 `rebuild`，重复事件用 `dedupe`。

## 相关页面

- [技能遥测概览](../telemetry/) · [遥测配置](../telemetry/configuration) · [CLI 参考](../cli)
