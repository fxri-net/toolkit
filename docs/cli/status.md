---
title: 整体状态（status）
---

# 整体状态（status）

> 一条命令汇总任务区、技能现场、配置层、文档站与版本 / 弃用项；只读、只汇总，不修复、不改任何文件。
> 问题按所属区块标注，可直接对照各域命令处理。

```bash
toolkit status                 # 人类摘要：逐区块一行结论 + 待处理项（只汇总现状，退出码恒 0）
toolkit status --check         # 存在 error 级问题时退出 1，可直接作为自查门禁
toolkit status --format json   # 统一信封输出到 stdout（诊断仍走 stderr）
```

## 输出内容

| 区块 | 取数来源 | 说明 |
| --- | --- | --- |
| 任务区 | `task check` 同一实现 | 待办任务数与 error / warn 列表（带文件与行号） |
| 技能现场 | `skill status` 同一实现 | 已选择技能数、安装目标数、待收敛项、版本双写位不一致 |
| 配置层 | `config status` 同一实现 | 命中层数与待处理项；**不打印任何配置值** |
| 文档站 | `docs nav check` / `docs dist check` 同一实现 | 未检测到文档站时跳过；产物未构建只标注「跳过」、不算问题 |
| 版本与弃用 | 包版本 + 命令注册表 | 已登记迁移目标的命令；`data.runtimeHits` 当前恒为空数组，旧命令命中记录由后续版本接线 |

`status` 只调用各域既有检查函数，不重写规则；与 `pnpm verify` 的分工：

- `status` 面向「我现在该修什么」：按域给出现场与待处理项
- `verify` 面向「能否交付」：聚合门禁，任一步失败即阻断

## 未初始化现场

找不到任务区目录时不逐域报错，只输出一行提示与下一步：

```text
当前目录未初始化：未找到任务区 .tasks
下一步：运行 toolkit init 创建任务区、规范载体与技能入口层
```

该现场退出码仍为 `0`（含 `--check`），初始化后才会进入逐域汇总。

## 参数

| 参数 | 说明 |
| --- | --- |
| `--check` | 存在 error 级问题时退出 `1`；warn / info 不影响退出码（与 `task check` 同口径） |
| `--format <format>` | 仅支持 `json`；非法值报错并退出 `1`，不做聚合 |

## 退出码

| 场景 | 退出码 |
| --- | --- |
| 默认模式（只汇总） | `0`（未初始化也是 `0`） |
| `--check` 且存在 error 级问题 | `1` |
| `--format` 非法 | `1` |

## JSON 契约

顶层为统一信封：`schemaVersion` / `command` / `ok` / `data` / `issues`（信封由 `src/json-output.ts` 统一构造）。

| 字段 | 内容 | 稳定性 |
| --- | --- | --- |
| `command` / `ok` / `issues[]` | 命令名、总体结论、聚合问题（`level` / `scope` / `message`） | 稳定契约 |
| `data.version` / `data.initialized` / `data.sections[]` / `data.deprecated[]` / `data.runtimeHits[]` | 版本、初始化标记、逐区块摘要、静态迁移项、运行时命中记录 | 可能随版本扩展 |

⚠️ `issues[].level` 为 `error` / `warn` / `info`，`scope` 为 `任务区` / `技能现场` / `配置层` / `文档站`；`ok` 只在无 error 级问题时为 `true`。

⚠️ 文本模式把 home 前缀折叠为 `~/…`（避免共享日志泄露本机目录结构）；`--format json` 保留绝对路径供脚本定位。

## 相关页面

- 参考：[CLI 参考](../cli) · [任务管理](./task) · [配置体检](./config)
- 相关：[技能分发](./skill) · [文档站校验](./docs-check) · [退出码](./exit-codes)
