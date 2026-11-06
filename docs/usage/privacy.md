---
title: 隐私与数据边界
---

# 隐私与数据边界

> 默认只写本机、默认不联网、默认不上传；上传必须由用户显式开启并配置端点。

## 本地存储

- 默认目录 `~/.toolkit/usage`，可用 `storage.dir`、`TOOLKIT_USAGE_DIR` 或 `--dir` 改写。
- 事件按 JSONL 追加写，默认按月轮转、保留 180 天。
- `index.json` 与 `upload-ledger.json` 是可重建的辅料，不作为唯一真源。

## 采集内容

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| 技能名、版本、来源 | 采集 | 用于统计与治理 |
| Agent、会话、工具调用 ID | 采集 | 用于去重与会话回溯 |
| 项目路径 | 采集 | 便于区分工作区 |
| 触发词 | 不采集 | 开启后截断 200 字并脱敏 |
| 技能参数 | 不采集 | 开启后截断 500 字并脱敏 |
| 执行结果、耗时 | 不采集 | 开启后记录 |

脱敏复用全局 `redact` 规则，覆盖邮箱、JWT、API Key、手机号、身份证、IPv4 等。

## 上传边界

- `upload.enabled` 默认 `false`；未开启时使用情况模块不发起网络请求。
- 非 localhost 端点必须 HTTPS；`allowInsecure` 默认 `false`。
- `upload send --dry-run` 只预览批次与脱敏后载荷，不发请求、不写账本。
- 上传账本按 `eventId` 幂等，重试不会重复计数。
- 定时上传由用户自行配置系统计划任务，toolkit 不安装常驻进程。

静态检查用例会扫描 `src/usage`（`upload.ts` 除外），出现 `fetch(` 或 `http(s).request(` 即失败，防止未启用路径偷偷联网。

## 清理与删除

```bash
toolkit usage purge --older-than 30d
toolkit usage purge --all
```

`purge` 只删事件文件并重建索引；上传账本与配置保留，避免误删后重复上传或丢失授权记录。
