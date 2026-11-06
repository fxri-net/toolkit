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
| Cursor | 待接入 | `~/.cursor/hooks.json` | `PostToolUse` |
| Codex CLI | 待接入 | 由 Hook 载荷或 transcript 提供 | 需实测 |
| GitHub Copilot CLI | 待接入 | 由 hooks 与 `transcriptPath` 提供 | 需实测 |

未列出的 Agent 可用 `telemetry import` 或 `telemetry log` 补录。

## 安装与启用是两步

```bash
toolkit telemetry hooks install --agent trae   # 只写 Hook 配置
toolkit telemetry enable                        # 才打开采集总开关
```

未开启总开关时，Hook 即使被调用也直接退出，不写文件。`hooks install` 支持 `--dry-run` 预览，写前自动备份原配置；配置无法解析时不覆盖。

## 管理 Hook

```bash
toolkit telemetry hooks status
toolkit telemetry hooks uninstall --agent trae
```

`uninstall` 只移除包含 `telemetry ingest --agent <id>` 的命令，不影响用户其它 Hook。Hook 错误写入数据目录的 `hook-errors.log`，只保留最近 200 行。

## 触发词如何关联

`UserPromptSubmit` 到达时把 prompt 写入 `state/sessions/<hash>.json`；同会话后续 `PostToolUse` 读取作为触发词。缓存 24 小时过期，避免读到陈旧会话。只有 `capture.triggerPrompt` 开启时才缓存。

## 注意

- Hook 命令写入当前 Node 与 CLI 的绝对路径，不依赖 PATH。
- 多个 Agent 同时接入时，同一调用可能被多个适配器捕获；跨适配器去重按 `(sessionId, toolUseId)` 在后续版本提供。
- Windows 下 Hook 由 PowerShell 执行，路径含空格时已用双引号包裹。
