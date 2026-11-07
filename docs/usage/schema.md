---
title: 事件 Schema
---

# 事件 Schema

> `schemaVersion` 当前为 `1`；新增字段只增不改，破坏性变更升版本并提供迁移命令。

## 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schemaVersion` | number | 是 | 固定 `1` |
| `eventId` | string | 是 | `sha256:` 前缀的稳定 ID |
| `occurredAt` | string | 是 | 本地时区 ISO 时间 |
| `agent` | string | 是 | 适配器 id：`trae` / `claude` / `cursor` / `codex` / `copilot` / `manual` / `rule`（规则上报） |
| `sessionId` | string | 是 | Agent 会话 id；规则通道按 `--session`、已知环境变量或日期兜底 |
| `toolUseId` | string | 否 | 工具调用 id；缺失时按 2 秒窗口去重 |
| `project` | string | 否 | 工作区路径 |
| `skill` | string | 是 | 技能名 |
| `skillVersion` | string | 否 | 技能真源版本 |
| `skillSource` | string | 是 | `toolkit-first-party` / `toolkit-third-party` / `unmanaged` / `unknown` |
| `managedBy` | string | 是 | `toolkit` / `external` / `unknown` |
| `triggerPrompt` | string | 否 | 触发词，截断 200 字 |
| `skillArgs` | string | 否 | 技能参数，截断 500 字 |
| `outcome` | string | 否 | `success` / `failure` / `unknown` |
| `durationMs` | number | 否 | 工具调用耗时 |
| `originAdapter` | string | 是 | 采集来源：`trae-hooks` / `claude-hooks` / `transcript` / `manual` / `rule` 等 |
| `toolkitVersion` | string | 是 | 写入时的 toolkit 版本 |

## 示例

```json
{
  "schemaVersion": 1,
  "eventId": "sha256:9f2c…",
  "occurredAt": "2026-11-06T10:12:33.123+08:00",
  "agent": "trae",
  "sessionId": "9b4c1f17-4cdb-444e-a372-77405e91b4b9",
  "toolUseId": "call_abc123",
  "project": "d:/Work/Dev-Space/fxri/0001.base/toolkit",
  "skill": "fxri-plan-to-task",
  "skillVersion": "1.9.16",
  "skillSource": "toolkit-first-party",
  "managedBy": "toolkit",
  "originAdapter": "trae-hooks",
  "toolkitVersion": "1.16.0"
}
```

## 去重键

- 首选：`agent + sessionId + toolUseId` 生成 `eventId`。
- 跨适配器：`sessionId + toolUseId` 二次去重，只保留首条。
- 缺少 `toolUseId`：`sessionId + skill + 2 秒窗口`。

机器可读 schema 见仓库根 [schemas/skill-usage-event.v1.json](https://github.com/fxri-net/toolkit/blob/main/schemas/skill-usage-event.v1.json)。

## 兼容策略

- 新增可选字段不升 `schemaVersion`。
- 删除字段、改变字段含义或类型时升 `schemaVersion`，并提供 `usage import` 迁移说明。
- 统计与上传消费方须忽略未知字段，不因新增字段失败。
