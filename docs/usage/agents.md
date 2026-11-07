---
title: Agent 接入
---

# Agent 接入

> Hook 是事件驱动的短进程：Agent 命中事件时启动一次命令，读 stdin、写一行记录后退出；没有常驻进程、没有定时轮询。

## 支持矩阵

| Agent | 状态 | 配置路径 | 能力 |
| --- | --- | --- | --- |
| Trae | 已验证（需在 IDE 内启用） | `~/.trae-cn/hooks.json`（回退 `~/.trae/hooks.json`） | `PostToolUse` / `UserPromptSubmit` |
| DeepSeek Harness | 已接入，需实测 | `~/.dsh/hooks.json` + 各 profile 的 `cordis.patch.yml` | `PostToolUse` / `UserPromptSubmit` |
| Claude Code | 已接入，需实测 | `~/.claude/settings.json`（`CLAUDE_CONFIG_DIR` 可改写） | `PostToolUse` / `UserPromptSubmit` |
| Cursor | 已接入，需实测 | `~/.cursor/hooks.json` | `PostToolUse` |
| Codex CLI | 已接入，需实测 | `$CODEX_HOME/hooks.json`（缺省 `~/.codex/hooks.json`） | `PostToolUse` |
| GitHub Copilot CLI | 已接入，需实测 | `$COPILOT_HOME/hooks.json`（缺省 `~/.copilot/hooks.json`） | `PostToolUse` |

「需实测」表示配置路径与载荷字段按公开资料实现，尚未在真实环境验证；接入后先用 `hooks status` 与 `doctor` 核对。

未列出的 Agent 可用 `usage import` 或 `usage log` 补录：

```bash
toolkit usage import --type transcript --file ~/.claude/projects/xxx.jsonl
toolkit usage log --skill fxri-plan-to-task --session manual-1 --prompt "归档任务"
```

## 安装与启用是两步

```bash
toolkit usage hooks install --agent trae   # 只写 Hook 配置
toolkit usage enable                        # 才打开采集总开关
```

未开启总开关时，Hook 即使被调用也直接退出，不写文件。`hooks install` 支持 `--dry-run` 预览，写前自动备份原配置；配置无法解析时不覆盖。

`hooks install` 只处理**本机已检测到**的 Agent：Trae 看 `~/.trae-cn` 或 `~/.trae`，DeepSeek Harness 看 `~/.dsh`，Claude Code 看 `CLAUDE_CONFIG_DIR` 或 `~/.claude`，Cursor 看 `~/.cursor`，Codex 看 `CODEX_HOME` 或 `~/.codex`，Copilot 看 `COPILOT_HOME` 或 `~/.copilot`。显式 `--agent` 但本机未检测到时告警跳过，全部跳过时以非 0 退出，不会凭空创建配置；工具卸载后残留的 Hook 用 `hooks remove` / `uninstall` 清理，这两个命令不要求 Agent 仍在本机。

### Trae：还需在 IDE 内启用

写完 `~/.trae-cn/hooks.json` 并不等于 Trae 会执行它，还需在 IDE 侧登记启用：

1. 打开 **设置 > Hooks**，配置类型选「全局」；
2. 在「已配置的 Hooks」处点「创建」（已存在配置文件时用齿轮图标打开），在安全警示面板点「启用」；
3. 「运行方式」选「本地自动运行」——沙箱方式可能拦截 Hook 写数据目录；
4. 启用后**重启 Trae 或开新会话**才会重新加载，历史会话不补录。

验证方式：在 Trae 的「输出」面板查看 `Agent Hooks` 通道日志，并执行 `toolkit usage hooks status` 确认「最近触发」出现时间。

### DeepSeek Harness：需装桥接插件

dsh 不直接读 `hooks.json`，要经官方桥接插件 `@deepseek-ai/dsh-hooks-claude-code` 才生效，分两步：

1. `toolkit usage hooks install --agent dsh`：写 `~/.dsh/hooks.json`，并在每个已存在的 profile（`~/.dsh/profiles/<name>/cordis.patch.yml`）写入 `# >>> toolkit usage hooks` 标记块，把插件条目的 `configPath` 指向该文件；
2. 安装桥接插件（只需一次）：先**完全退出**桌面版（含托盘），再执行 `dsh plugin --profile desktop add @deepseek-ai/dsh-hooks-claude-code`，装完重新打开应用。
   ⚠️ 不要用桌面版「添加插件」：它只接受声明 `dsh.bundle` 的组合包，对本插件会报 `declares no dsh.bundle` 并拒绝安装。

`hooks status --agent dsh` 会在插件缺失或标记块缺失时提示。桥接插件把 `tool_response` 扁平化为文本，`outcome` 字段恒为 `unknown`（Trae 等原生 Hook 会按返回体推断成功与否），其余字段正常。

重复执行 `toolkit usage init` 会沿用历史选择：已配置时默认「保持当前配置（只重装 Hook）」，选择「自定义」则逐项回填现有值。升级后修复 Hook 路径时优先用「保持当前配置」。

## 启用、关闭与卸载

| 目的 | 命令 | 影响 |
| --- | --- | --- |
| 只写 Hook 配置 | `toolkit usage hooks install --agent <id>` | 写各 Agent 的 Hook 文件，不打开采集 |
| 打开采集 | `toolkit usage enable` | 事件开始落盘 |
| 只关采集 | `toolkit usage disable` | Hook 保留，事件不再写入 |
| 只删 Hook | `toolkit usage hooks remove --agent <id>` | 只移除本包条目，保留其它 Hook 与数据 |
| 停用并移除 Hook | `toolkit usage uninstall --agent <id>` | 关闭总开关并删本包 Hook，数据保留；加 `--purge` 删数据 |

`hooks status` 以本地时间显示最近触发时间与最近状态；`uninstall` 支持 `--dry-run` 预演。Hook 错误写入数据目录的 `hook-errors.log`，只保留最近 200 行。

工具侧若另有 Hook 开关，需要一并处理，否则命令侧删了配置、工具侧仍按旧配置调用：

- **Trae**：在 **设置 > Hooks** 停用或删除该全局 Hook；只跑 `hooks remove` 不在 IDE 里停用时，Trae 仍会调用。
- **DeepSeek Harness**：`hooks remove --agent dsh` 会删 `~/.dsh/hooks.json` 的本包命令并移除各 profile 的标记块（文件恢复为 `[]`）；桥接插件不自动卸载，可在 **设置 → Plugins** 卸载，或退出桌面版后 `dsh plugin --profile desktop remove @deepseek-ai/dsh-hooks-claude-code`。
- **Claude Code**：无独立开关，Hook 随 `settings.json` 生效；关闭用 `hooks remove --agent claude`（或手工删掉其中的 `hooks` 段），重启后不再调用。
- **Cursor / Codex CLI / GitHub Copilot CLI**：配置即刻写入各自 `hooks.json`，关闭用 `hooks remove` 后重启工具或开新会话；工具自带 Hook 管理界面时以其界面为准。

彻底清理顺序：先在工具侧停用或删除 Hook（如有独立开关）→ `usage hooks remove` 或 `usage uninstall` → 需要时 `usage uninstall --purge` 删除事件。

## 触发词如何关联

`UserPromptSubmit` 到达时把 prompt 写入 `state/sessions/<hash>.json`；同会话后续 `PostToolUse` 读取作为触发词。缓存 24 小时过期，避免读到陈旧会话。只有 `capture.triggerPrompt` 开启时才缓存。

## 补录与去重

- `import --type transcript` 支持 Claude JSONL 与通用 JSON / JSONL，从 `tool_use` 块提取工具调用，并把最近一次用户消息作为触发词。
- `log` 用于没有 Hook 的 Agent；`manual` 属于用户显式补录，不受 Agent 开关限制。
- 同一调用被两个适配器捕获时，按 `(sessionId, toolUseId)` 只保留首条；`dedupe` 可清理历史重复，`doctor` 会报告跨适配器重复组数。

## 注意

- Hook 命令写入当前 Node 与 CLI 的归一化绝对路径（`realpath` 解析后的稳定目标），不依赖 PATH；fnm / nvm 等版本管理器的会话级临时软链不会写进配置。
- Hook 命令按平台生成：Windows 经 `powershell -NoProfile -Command "& '…'"` 包装（Agent 在 Windows 上经 PowerShell 执行），macOS / Linux 用单引号直接拼接；路径含空格或单引号时按各自 shell 规则转义。
- 旧版「两个双引号串并列」的命令在 Windows 上会被 PowerShell 当成表达式而执行失败；`hooks status` 与 `doctor` 会标记形态过期，重跑 `hooks install` 即替换为新形态。
- `hooks status` 会显式提示「已配置但尚未执行过」；`hooks status` 与 `doctor` 还会校验命令里的 Node / CLI 路径是否存在，失效时提示重跑 `hooks install`。
- 旧版本安装的 Hook 仍指向 `telemetry` 命令，升级后不再生效；`hooks status` 与 `doctor` 会提示，重跑 `hooks install` 即替换为新命令。
- transcript 的时间以导入时刻为准，不还原原始会话时间。
