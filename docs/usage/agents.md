---
title: Agent 接入
---

# Agent 接入

> Hook 是事件驱动的短进程：Agent 命中事件时启动一次命令，读 stdin、写一行记录后退出；没有常驻进程、没有定时轮询。

## 支持矩阵

| Agent | 状态 | 配置路径 | 能力 |
| --- | --- | --- | --- |
| Trae | 已验证 | `~/.trae-cn/hooks.json`（回退 `~/.trae/hooks.json`） | `PostToolUse` / `UserPromptSubmit` |
| Claude Code | 已验证 | `~/.claude/settings.json`（`CLAUDE_CONFIG_DIR` 可改写） | `PostToolUse` / `UserPromptSubmit` |
| Cursor | 已接入，需实测 | `~/.cursor/hooks.json` | `PostToolUse` |
| Codex CLI | 已接入，需实测 | `$CODEX_HOME/hooks.json`（缺省 `~/.codex/hooks.json`） | `PostToolUse` |
| GitHub Copilot CLI | 已接入，需实测 | `$COPILOT_HOME/hooks.json`（缺省 `~/.copilot/hooks.json`） | `PostToolUse` |

「需实测」表示配置路径与载荷字段按公开资料实现，尚未在真实环境验证；接入后先用 `hooks status` 与 `doctor` 核对。

未列出的 Agent 可用 `usage import` 或 `usage log` 补录：

```bash
toolkit usage import --format transcript --file ~/.claude/projects/xxx.jsonl
toolkit usage log --skill fxri-plan-to-task --session manual-1 --prompt "归档任务"
```

## 安装与启用是两步

```bash
toolkit usage hooks install --agent trae   # 只写 Hook 配置
toolkit usage enable                        # 才打开采集总开关
```

未开启总开关时，Hook 即使被调用也直接退出，不写文件。`hooks install` 支持 `--dry-run` 预览，写前自动备份原配置；配置无法解析时不覆盖。

## 管理 Hook

```bash
toolkit usage hooks status
toolkit usage hooks remove --agent trae
toolkit usage uninstall --agent trae
```

`hooks status` 以本地时间显示最近触发时间与最近状态；`uninstall` 停用采集并移除本包 Hook，默认保留事件，`--purge-data` 才删除。Hook 错误写入数据目录的 `hook-errors.log`，只保留最近 200 行。

## 触发词如何关联

`UserPromptSubmit` 到达时把 prompt 写入 `state/sessions/<hash>.json`；同会话后续 `PostToolUse` 读取作为触发词。缓存 24 小时过期，避免读到陈旧会话。只有 `capture.triggerPrompt` 开启时才缓存。

## 补录与去重

- `import --format transcript` 支持 Claude JSONL 与通用 JSON / JSONL，从 `tool_use` 块提取工具调用，并把最近一次用户消息作为触发词。
- `log` 用于没有 Hook 的 Agent；`manual` 属于用户显式补录，不受 Agent 开关限制。
- 同一调用被两个适配器捕获时，按 `(sessionId, toolUseId)` 只保留首条；`dedupe` 可清理历史重复，`doctor` 会报告跨适配器重复组数。

## 注意

- Hook 命令写入当前 Node 与 CLI 的绝对路径，不依赖 PATH。
- Windows 下 Hook 由 PowerShell 执行，路径含空格时已用双引号包裹。
- 旧版本安装的 Hook 仍指向 `telemetry` 命令，升级后不再生效；`hooks status` 与 `doctor` 会提示，重跑 `hooks install` 即替换为新命令。
- transcript 的时间以导入时刻为准，不还原原始会话时间。
