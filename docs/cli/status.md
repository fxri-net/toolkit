---
title: 整体状态（status）
---

# 整体状态（status）

> 一条命令汇总任务区、技能现场、配置层、文档站、迁移与版本 / 弃用项；只读、只汇总，不修复、不改任何文件。
> 问题按所属区块标注，可直接对照各域命令处理。

```bash
toolkit status                # 人类摘要：逐区块一行结论 + 待处理项（只汇总现状，退出码恒 0）
toolkit status --check        # 存在 error 级问题时退出 1，可直接作为自查门禁
toolkit status --format json  # 统一信封输出到 stdout（诊断仍走 stderr）
```

## 输出内容

| 区块 | 取数来源 | 说明 |
| --- | --- | --- |
| 任务区 | `task check` 同一实现 | 待办任务数与 error / warn 列表（带文件与行号） |
| 技能现场 | `skill status` 同一实现 | 已选择技能数、安装目标数、待收敛项、版本双写位不一致 |
| 配置层 | `config status` 同一实现 | 命中层数与待处理项；**不打印任何配置值** |
| 文档站 | `docs nav check` / `docs dist check` 同一实现 | 未检测到文档站时跳过；产物未构建只标注「跳过」、不算问题 |
| 迁移 | `upgrade --check` 同一检测实现 | 仅当检测到 v1 旧形态时出现；只提示、不自动修复，不产生 `issues` |
| 版本与弃用 | 包版本 + 命令注册表 | 已登记迁移目标的命令；`data.runtimeHits` 当前恒为空数组，旧命令命中记录由后续版本接线 |

`status` 只调用各域既有检查函数，不重写规则；与 `pnpm verify` 的分工：

- `status` 面向「我现在该修什么」：按域给出现场与待处理项
- `verify` 面向「能否交付」：聚合门禁，任一步失败即阻断

## 迁移提示

检测到旧配置段、旧 `prepare` 或旧技能名等 v1 形态时，追加「迁移」区块；没有残留则整节省略，不制造日常噪音：

```text
⚠️ 迁移：发现 3 项 v1 形态待迁移
  可自动 2 项 / 需人工 1 项
  分布：配置 1、工程文件 1、技能现场 1
  运行 toolkit upgrade --check 查看完整清单（只提示，不自动修复）
```

只查项目层与本地层（全局层与当前工程无关）。迁移项不进入 `issues`，`--check` 退出码不受影响。

## 规则快照提示

项目内存在 `.trae/rules/git-commit-message.md` 且正文与当前版本不一致时，追加一条 `info` 级提示（只提示、不改文件）：

```text
规则快照：.trae/rules/git-commit-message.md 与当前版本不一致（当前 2.0.4），运行 toolkit rule sync 更新
```

`info` 不影响退出码；同步由用户显式执行 `toolkit rule sync`，`status` 与 `init` 都不自动改写该文件。

## 未初始化现场

找不到任务区目录时不逐域报错，只输出一行提示与下一步：

```text
当前目录未初始化：未找到任务区 .tasks
下一步：运行 toolkit task init 创建任务区、规范载体与技能入口层
```

该现场仍按成功退出（含 `--check`），初始化后才会进入逐域汇总。

## 参数

| 参数 | 说明 |
| --- | --- |
| `--check` | 存在 error 级问题时按失败退出；warn / info 不影响退出码（与 `task check` 同口径） |
| `--format <format>` | 仅支持 `json`；非法值报错并按失败退出，不做聚合 |

## 退出码

与全工具口径一致：默认只汇总时成功退出；`--check` 存在 error 级问题、`--format` 取值非法均按失败退出。
数值与含义见[退出码与解析错误](./exit-codes)。

## JSON 契约

顶层为统一信封（字段定义见[输出约定](../cli#输出约定)，由 `src/json-output.ts` 统一构造）。

| 字段 | 内容 | 稳定性 |
| --- | --- | --- |
| `command` / `code` / `message` / `extend.exitCode` / `issues[]` | 命令名、报告结论码、结论文案、进程退出码、聚合问题（`level` / `scope` / `message`） | 稳定契约 |
| `data.version` / `data.initialized` / `data.sections[]` / `data.deprecated[]` / `data.runtimeHits[]` | 版本、初始化标记、逐区块摘要、静态迁移项、运行时命中记录 | 可能随版本扩展 |

⚠️ `issues[].level` 为 `error` / `warn` / `info`，`scope` 为 `任务区` / `技能现场` / `配置层` / `文档站`；
`code` 只在无 error 级问题时为 `200`（否则 `422`），而 `extend.exitCode` 仅在带 `--check` 且存在 error 时为 `1`。

⚠️ 文本模式把 home 前缀折叠为 `~/…`（避免共享日志泄露本机目录结构）；`--format json` 保留绝对路径供脚本定位。

## 相关页面

- 参考：[CLI 参考](../cli) · [任务管理](./task) · [配置体检](./config)
- 相关：[技能分发](./skill) · [文档站校验](./docs-check) · [退出码](./exit-codes)
