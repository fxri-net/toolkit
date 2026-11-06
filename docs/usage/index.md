---
title: 技能使用情况概览
---

# 技能使用情况概览

> 统计技能在哪些会话、被哪句话触发、用了多少次；默认关闭，数据只留在本机。

## 用途与场景

- 回答「某个技能用了多少次」「哪些技能从未使用」「某次需求由哪句话触发」。
- 用真实调用记录做技能治理，不依赖人工回忆或模型自述。
- 记录归 `@fxri/toolkit` 管理，可与任务区、技能分发共用一套工具链。

## 默认值

| 项目 | 默认 |
| --- | --- |
| 总开关 | 关闭 |
| Agent 采集 | 全部关闭 |
| 技能来源 | 一方 / 第三方 / 未托管全部关闭 |
| 技能范围 | `none` |
| 触发词 / 参数 / 结果 | 全部不采集 |
| 网络与上传 | 不联网、不上传 |
| 存储位置 | `~/.toolkit/usage` |
| 轮转与保留 | 按月轮转、保留 180 天 |

未开启时，Hook 即使被调用也直接退出，不写文件。

## 快速开始

```bash
toolkit usage info            # 查看当前开关与数据目录
toolkit usage enable          # 打开总开关
toolkit usage origins --first-party
toolkit usage scope --mode all
toolkit usage stats           # 查看统计
```

首次使用建议直接跑 `toolkit usage init`，按向导选择 Agent、来源与字段；所有选项都有默认值，直接回车即可完成。

## 命令总览

| 命令 | 用途 |
| --- | --- |
| `info` | 开关、配置路径、数据目录、Hook 与上传汇总 |
| `init` / `uninstall` | 初始化 / 停用并卸载 Hook（默认保留数据） |
| `enable` / `disable` | 总开关 |
| `origins` | 一方 / 第三方 / 未托管来源开关 |
| `scope` | `none` / `all` / `include` / `exclude` 技能范围 |
| `capture` | 触发词 / 参数 / 结果字段开关 |
| `storage` | 数据目录、轮转、保留期、单文件上限 |
| `stats` | 统计与查询（`--by skill\|session\|trigger`） |
| `export` / `import` | 导出与导入事件 |
| `dedupe` / `purge` / `rebuild` | 去重、清理与索引重建 |
| `doctor` | 目录、索引与重复事件诊断 |
| `upload setup` / `status` / `send`（`--dry-run`） | 可选上传：默认关闭，需显式配置端点 |
| `rule` | 输出可复制的全局规则文案 |

完整参数见 [CLI 参考 · usage](../cli/usage)，配置字段见 [使用情况配置](./configuration)，数据边界见 [隐私与数据边界](./privacy)，事件结构见 [事件 Schema](./schema)。

## 边界与注意

- 历史会话无法自动补录，统计从启用时刻开始。
- 没有 Hook 的 Agent 用 `usage import` 或 `usage log` 补录。
- 上传默认关闭；开启后仍需显式配置端点与认证，详见 [隐私与数据边界](./privacy)。
- 事件 schema 版本为 `1`，新增字段只增不改，详见 [事件 Schema](./schema)。
