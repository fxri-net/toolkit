---
title: 技能使用情况（usage）
---

# 技能使用情况（usage）

> 本机统计技能使用次数、会话与触发词；默认关闭，数据只留在本机。

## 常用命令

```bash
toolkit usage show              # 查看开关、通道、配置路径、数据目录、队列与计数（默认）
toolkit usage show stats --since 30d --limit 10   # 统计视图
toolkit usage setup init        # 初始化向导，回车即按默认启用（一方 + 第三方技能）
toolkit usage setup wizard      # 交互菜单：状态、统计、开关、Hook、上传、导出与清理
toolkit usage config channel rule    # 采集通道：rule（全局规则上报）/ hook（Agent Hook）
toolkit rules compose --module usage   # 输出可复制进全局规则的文案（等价于原 usage rule）
toolkit usage record --skill fxri-plan-to-task --skill fxri-plan-review   # 规则通道批量上报（静默）
toolkit config set usage.enabled true    # 打开总开关（关闭用 false）
toolkit usage config origins --first-party --third-party
toolkit usage config scope --mode all
toolkit usage config capture --trigger
toolkit usage data doctor
```

`usage enable` / `usage disable` 已由 `toolkit config set usage.enabled true|false` 取代，不保留两套生命周期入口；
旧写法仍可用，命中时由 CLI 提示迁移到 `config set`。其余旧子命令同理：`usage info` → `usage show`、
`usage stats` → `usage show stats`、`usage doctor` → `usage data doctor`，命中时给出弃用提示。

## 子命令与选项

### show：查看现场与统计

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `show` | 开关、通道、配置路径、数据目录、Hook、上传、队列与计数（默认命令） | `--dir`、`--format json` |
| `show stats` | 按技能 / 会话 / 触发词聚合 | `--by skill\|session\|trigger`、`--limit`、`--since`、`--agent`、`--source`、`--skill`、`--unused`、`--dir`、`--format json` |

### data：事件数据

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `data export` | 导出事件 | `--type csv\|json\|jsonl`、`--out`、`--since`、`--dir` |
| `data import` | 导入事件或 transcript | `--type json\|jsonl\|transcript`、`--file`、`--agent`、`--dry-run`、`--dir` |
| `data dedupe` | 压缩重复事件并重建索引 | `--dir` |
| `data purge` | 按保留期或全部清理 | `--older-than 30d`、`--all`、`--dry-run`、`--dir` |
| `data rebuild` | 从事件文件重建索引 | `--dir` |
| `data doctor` | 诊断目录、索引与重复 | `--dir`、`--format json` |

### config：采集配置

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `config channel` | 查看或切换采集通道；切到 `rule` 提示清理 Hook，切到 `hook` 提示删除规则段 | `rule\|hook`、`--format json`；非法值报错退出 |
| `config origins` | 查看或设置来源开关（只打印来源段） | `--first-party` / `--no-first-party`、`--third-party` / `--no-third-party`、`--unmanaged` / `--no-unmanaged`、`--format json` |
| `config scope` | 查看或设置技能范围 | `--mode`、`--add`、`--remove`、`--format json` |
| `config capture` | 查看或设置采集字段 | `--trigger` / `--no-trigger`、`--args` / `--no-args`、`--outcome` / `--no-outcome`、`--format json` |
| `config storage` | 查看或设置存储 | `--dir`、`--rotation`、`--retention`、`--max-size`、`--format json` |
| `config upload` | 上传摘要：开关、待上传数量 | — |
| `config upload setup` | 上传配置向导 | `--yes`、`--protocol`、`--endpoint`、`--headers` |
| `config upload status` | 上传开关、端点与待上传数量 | `--format json` |
| `config upload send --dry-run` | 预览批次与载荷，不发送 | `--limit` |
| `config upload send` | 手工发送一批 | `--limit` |

### setup：生命周期

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `setup init` | 初始化向导：预设、通道、Agent（仅 hook）、来源、字段与存储；首次执行即启用（默认预设「一方 + 第三方技能（数据只留本机，不上传）」，采集字段仍默认关闭），重复执行沿用历史选择、已配置时默认「保持当前配置」并只重装 Hook | `--yes`（须显式给 `--preset`）、`--preset off\|recommended\|third-party`、`--channel rule\|hook`、`--agent`；非 TTY 退出码 2 |
| `setup wizard` | 交互菜单：状态、统计、开关、Hook 管理、上传、导出与清理；子页 ESC 返回、顶层退出、Ctrl+C 退出码 130 | — |
| `setup uninstall` | 停用采集并卸载 Hook，默认保留数据；写前预览，取消即不写 | `--yes`、`--agent`、`--purge`、`--dry-run` |
| `setup hooks install` | 只写 Hook 配置，不开启采集；写前预览并确认，通道为 rule 时提示不生效 | `--agent`、`--yes`、`--dry-run` |
| `setup hooks status` | 查看 Hook 安装状态与最近触发时间；通道与 Hook 不一致时告警 | `--agent`、`--all`、`--dir` |
| `setup hooks remove` | 只移除本包 Hook 命令；写前预览并确认 | `--agent`、`--yes` |

### 顶层命令

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `record` | 规则通道批量上报：入队后立即返回、按出现次数计数、静默、退出码恒 0；明细由后台反查补齐 | `--skill`（可重复或逗号分隔）、`--session`、`--dir` |
| `log` | 手工补录一次使用 | `--skill`、`--session`、`--agent`、`--prompt`、`--args`、`--outcome` |
| `flush` | 内部命令：消费上报队列并写入事件（后台 worker 与惰性兜底调用，通常无需手动执行） | `--dir`、`--limit` |

> `usage rule` 已移除：输出全局规则文案请用 `toolkit rules compose --module usage`（与旧命令输出逐字一致）。
> 总开关改由 `toolkit config set usage.enabled true|false` 写入；旧的 `usage enable` / `usage disable` 命中时提示迁移。

## 时间参数

`--since` 支持 `30d`、`24h`、`60m` 与 `YYYY-MM-DD`；非法值报错退出，不静默回落到全部时间。

## 边界与注意

- 裸 `toolkit usage` 在 TTY 下进入交互菜单；非 TTY 输出 `show` 摘要与子命令提示并以退出码 0 结束。
  需要显式交互入口时用 `toolkit usage setup wizard`（非 TTY 退出码 2）；菜单子页按 ESC 返回、顶层按 ESC 或选「退出」结束，Ctrl+C 退出码 130，取消不写任何文件。
- `usage show` / `usage show stats`、`usage config` 的 `channel` / `origins` / `scope` / `capture` / `storage`、
  `usage setup hooks status`、`usage data doctor` 等支持 `--format json`：文本与 JSON 由同一份摘要数据渲染，
  文本模式只输出本段（`config origins` 不再打印整份配置），JSON 模式只含本段载荷（前置 `schemaVersion`）。
- `usage setup hooks install` / `usage setup hooks remove` / `usage setup uninstall` 写前统一打印预览并确认；
  非 TTY 须显式加 `--yes`，否则以退出码 2 提示用法。
  `usage setup uninstall --dry-run` 只打印预览，不写配置、不动 Hook、不删数据。
- `usage setup init` 的多步向导支持按 ESC 回到上一步、按 Ctrl+C 取消（退出码 130，不写任何文件）；首步按 ESC 等同取消。
- 通道二选一：`usage.channel` 为 `rule` 时只有 `usage record` 写入、Hook 不写入；为 `hook` 时只有 Hook 写入、`record` 静默跳过。切换通道不会自动清理另一侧配置。
- 非交互初始化用 `toolkit usage setup init --yes --preset recommended --channel rule`（默认 `rule`）；
   `--channel hook` 时会安装 Hook 并需要检测到 Agent，`--preset off` 与 `--channel` 同时出现时 `off` 优先；
   `custom` / `advanced` 预设仍需交互。
- 默认总开关、Agent、来源、技能范围、字段全部关闭；只开总开关不会产生记录。
- `usage show` 汇总通道、已安装 Hook、上传开关与最近 Hook 错误；
  `usage setup hooks status` 以本地时间显示各 Agent 最近触发记录，`--all` 可一并列出本机未安装的 Agent（查残留配置）。
- `record` 只统计 toolkit 管理的技能（包内一方与 toolkit 登记来源），且必须命中 `usage` 配置（总开关、来源、技能范围）；未托管技能与未命中配置的技能静默忽略。
   规则路径不产生触发词与参数，这两类字段由后台反查会话记录补齐。
- **异步消费**：`record` 只入队，随后由派生 worker 或下一次 `usage` 命令消费；
  `usage show stats` 可能有数秒到一条命令的延迟，`usage show` 的「队列」行显示积压条数。反查失败只丢明细字段，技能名与次数照常落盘。
- **明细缺失的三个原因**：该 Agent 会话记录不可读（Trae 不落可读文件）、会话格式尚未适配（dsh 为 v4 事件流）、或记录已过期 / 被清理。
   补救见 [Agent 接入 · 拿不到明细时的补救](../usage/agents#拿不到明细时的补救)：`usage log` 手工补录、改用 Hook 通道。
- 原 `usage rule` 的「当前配置不会统计任何技能」空转提示随命令移除；改用 `toolkit rules compose --module usage` 时不再做该检查。
- `usage show stats --by trigger` 每条输出「次数｜最近调用时间｜触发词｜技能」，便于看某技能的调用明细。
- Hook 安装与采集开启是两步：先 `usage setup hooks install`，再 `toolkit config set usage.enabled true`。
  支持 Agent 与配置路径见 [Agent 接入](../usage/agents)。
- `usage setup hooks install` 只处理本机已检测到的 Agent；显式 `--agent` 未检测到时告警跳过，全部跳过才以非 0 退出。
   `usage setup hooks remove` / `usage setup uninstall` 不要求 Agent 仍在本机，便于清理残留配置。
- DeepSeek Harness 还需安装官方桥接插件 `@deepseek-ai/dsh-hooks-claude-code`，步骤见 [Agent 接入](../usage/agents)。
- Hook 命令按当前平台生成：Windows 经 PowerShell 包装（`powershell -NoProfile -Command "& '…'"`），macOS / Linux 用单引号拼接；
   升级后重跑 `usage setup hooks install` 即可把存量旧形态刷成新形态，`usage setup hooks status` / `usage data doctor` 会提示形态过期。
- `include` 空列表等同 `none`；`exclude` 只列出要排除的技能。
- 触发词默认不采集；开启后截断 200 字并复用全局脱敏规则。
- `usage data export` 输出的是已落盘事件；触发词是否出现取决于采集开关。
- `usage data doctor` 只诊断不自动修复；索引不一致时用 `usage data rebuild`，重复事件用 `usage data dedupe`。跨适配器重复按 `(sessionId, toolUseId)` 计数。
- `usage data doctor --format json` 的诊断项为 `items: { code, level, message }[]`：`code` 供脚本断言，
   `level` 区分必须处理（`warn`）与提示（`info`）；文本模式分别以 ⚠️ / ℹ️ 前缀输出。
- `usage data import --type transcript` 从 Claude 或通用会话记录提取 `tool_use` 块；时间以导入时刻为准，不还原原始会话时间。

## 相关页面

- [技能使用情况概览](../usage/) · [使用情况配置](../usage/configuration) · [CLI 参考](../cli)
