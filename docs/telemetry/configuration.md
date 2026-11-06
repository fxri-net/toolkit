---
title: 遥测配置
---

# 遥测配置

> `telemetry` 段只读全局层 `~/.toolkitrc.json`；项目层与本地层误写只告警、不生效。

## 为什么只允许全局层

遥测会在本机持续写文件。若允许项目层配置，克隆一个仓库就可能被动开启采集。因此 `telemetry` 只认全局层；项目层 / 本地层出现同名段时，toolkit 在 stderr 告警并忽略。

## 完整示例

```json
{
  "telemetry": {
    "enabled": false,
    "agents": { "trae": false, "claude": false },
    "sources": { "firstParty": false, "thirdParty": false, "unmanaged": false },
    "skills": { "mode": "none", "include": [], "exclude": [] },
    "capture": { "triggerPrompt": false, "skillArgs": false, "outcome": false },
    "storage": {
      "dir": "",
      "rotation": "monthly",
      "retentionDays": 180,
      "maxFileBytes": 8388608
    },
    "upload": {
      "enabled": false,
      "protocol": "webhook",
      "endpoint": "",
      "headers": {},
      "allowInsecure": false,
      "batchSize": 100
    }
  }
}
```

## 字段说明

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `false` | 总开关；关闭时 Hook 直接退出 |
| `agents` | object | `{}` | Agent 开关，键为适配器 id（`trae` / `claude` / `cursor` / `codex` / `copilot`），未出现即关闭 |
| `sources.firstParty` | boolean | `false` | toolkit 一方技能（`fxri-*`） |
| `sources.thirdParty` | boolean | `false` | toolkit 分发的第三方技能 |
| `sources.unmanaged` | boolean | `false` | Agent 目录里存在、但不由 toolkit 管理的技能 |
| `skills.mode` | string | `none` | `none` / `all` / `include` / `exclude`；`include` 空列表等同 `none` |
| `skills.include` | string[] | `[]` | `include` 模式的白名单 |
| `skills.exclude` | string[] | `[]` | `exclude` 模式的黑名单 |
| `capture.triggerPrompt` | boolean | `false` | 采集触发词；开启后截断 200 字并脱敏 |
| `capture.skillArgs` | boolean | `false` | 采集技能参数；开启后截断 500 字并脱敏 |
| `capture.outcome` | boolean | `false` | 采集执行结果与耗时 |
| `storage.dir` | string | 空 | 数据目录；空串用默认 `~/.toolkit/telemetry` |
| `storage.rotation` | string | `monthly` | `monthly` / `size` / `none` |
| `storage.retentionDays` | number | `180` | `purge` 的默认保留期 |
| `storage.maxFileBytes` | number | `8388608` | `size` 轮转的单文件上限 |
| `upload.enabled` | boolean | `false` | 上传总开关；默认关闭 |
| `upload.protocol` | string | `webhook` | `webhook` / `otlp-http` / `file` |
| `upload.endpoint` | string | 空 | 上传端点或导出路径 |
| `upload.headers` | object | `{}` | 附加请求头 |
| `upload.allowInsecure` | boolean | `false` | 允许非 localhost 的 HTTP 端点 |
| `upload.batchSize` | number | `100` | 单批事件数 |

## 数据目录优先级

`--dir` > `TOOLKIT_TELEMETRY_DIR` > `storage.dir` > `~/.toolkit/telemetry`。

相对路径按 `process.cwd()` 解析；`~` 展开为当前用户家目录。

## 过滤顺序

总开关 → Agent 开关 → 来源开关 → 技能模式 → 字段开关。任一步不通过就不落盘；字段开关只影响对应字段，不影响事件本身的写入。

## 相关页面

- [技能遥测概览](./index) · [CLI 参考 · telemetry](../cli/telemetry) · [配置参考](../config)
