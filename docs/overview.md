---
title: 一图看懂
---

# 一图看懂

> 读完这页能回答三个问题：由哪几块组成、各自管什么、怎么配合。名词解释见[快速开始 · 几个术语](./getting-started#几个术语-先说人话)；
> 想先对号入座见[适用场景](./scenarios)。

<script setup>
import ConceptMap from './.vitepress/theme/components/diagrams/ConceptMap.vue'
import TaskJourney from './.vitepress/theme/components/diagrams/TaskJourney.vue'
import ModelMap from './.vitepress/theme/components/diagrams/ModelMap.vue'
</script>

## 一句话

把对话里的方案变成仓库里可校验的资产，再把做法分发给 AI——循环跑起来之后，换人不换做法、换会话不丢上下文。

## 一张图看懂

<ConceptMap />

- 从下往上是「接入 → 能力 → 产出」：接入动作把能力装进来，能力在日常使用中产出仓库资产。
- 每块都可点击：想查细节直接点进对应分页；悬浮会提示目标。
- 关系看完还想查全量命令，展开下面的完整结构。

::: details 展开完整结构（命令域）

| 域 | 一句话 | 入口命令 | 命令页 |
| --- | --- | --- | --- |
| `toolkit setup` | 本机接入：技能、规则、生效范围 | `setup` | [本机接入](./cli/setup) |
| `toolkit task` | 任务管理：建档、校验、归档、统计 | `task` | [任务管理](./cli/task) |
| `toolkit status` | 整体状态只读聚合 | `status` | [整体状态](./cli/status) |
| `toolkit rule` | 全局规则组合与缓存 | `rule` | [全局规则](./cli/rule) |
| `toolkit scope` | 按目录决定技能是否生效 | `scope` | [作用域](./cli/scope) |
| `toolkit skill` | 技能分发、校验、版本与来源 | `skill` | [技能分发](./cli/skill) |
| `toolkit usage` | 技能使用情况：统计与导出（默认关闭） | `usage` | [技能使用情况](./cli/usage) |
| `toolkit convention` | 规范载体升级、归一与体检 | `convention` | [规范载体](./cli/convention) |
| `toolkit release` | 多语言 CHANGELOG 与发版 | `release` | [发版与更新日志](./cli/release) |
| `toolkit upgrade` | 旧工程与本机契约数据迁移 | `upgrade` | [升级迁移](./cli/upgrade) |
| `toolkit trash` | 项目内回收站：查看、恢复与清理 | `list` / `restore` / `prune` / `stats` | [回收站](./cli/trash) |
| `toolkit concept` | 概念目录：查看可迁移的工程概念与采纳步骤（本仓参考实现单独登记） | `list` / `show` | [概念目录](./cli/concept) |
| `toolkit config` | 配置分层读写与体检 | `config` | [配置体检](./cli/config) |
| `toolkit privacy` | 本机路径扫描与归一 | `privacy` | [隐私体检](./cli/privacy) |
| `toolkit docs` | 文档站主题、导航与产物校验 | `docs` | [文档站校验](./cli/docs-check) |

技能与配置不在页内复制清单，分别见[推荐技能包](./packages)与[配置参考](./config)。

:::

## 一条任务的一生

<TaskJourney />

对话里说需求 → AI 出方案 → 你确认 → 建档落盘 → 执行 → 校验 → 归档 → 规范沉淀。
其中校验与归档由工具完成；校验不通过就回到执行。提交与发版是可选的下一步，不是必经环节。

## 五件套怎么配合

<ModelMap />

| 件套 | 所属层 | 解决什么 | 存放位置 | 入口命令 | 谁维护 |
| --- | --- | --- | --- | --- | --- |
| 任务文件 | 协作过程 | 方案、决策与交付落盘 | `.tasks/active/`、`.tasks/archive/` | `toolkit task` | 人 + AI |
| 规范载体 | 协作过程 | 从任务里提炼可检索的规范 | `.tasks/conventions/` | `toolkit convention` | 人 + AI |
| AI 技能 | 能力分发 | 让 AI 按同一套规范干活 | 全局技能目录 / 项目薄壳 | `toolkit skill` | 随包分发 |
| 全局规则 | 能力分发 | 约束 AI 的角色、输出与工作流 | Agent 的全局规则入口 | `toolkit rule` | 人复制 |
| 配置与作用域 | 贯穿分发与治理 | 决定上面几件在哪些项目生效 | `.toolkitrc.json` 三层 | `toolkit config` / `scope` | 项目 + 个人 |

## 我该用哪一件

| 你想… | 用 |
| --- | --- |
| 留下决策与交付记录 | 任务文件 + `toolkit task` |
| 让 AI 按团队规范做事 | 规范载体 → 技能 / 全局规则 |
| 只在部分项目生效 | `toolkit scope` 与策略规则 |
| 统一 AI 的输出格式 | `toolkit rule compose` |
| 出问题先自查 | 让 AI 看现场：状态、任务校验、文档校验都在它能跑的范围内 |

## 三个最容易混淆的点

| 容易混淆 | 事实 |
| --- | --- |
| 装了 CLI ≠ 装了技能 | CLI 是命令；技能是给 AI 看的规范文本，要 `skill install` 或 `setup` 才落盘 |
| 任务区 ≠ 规范载体 | 任务是一次交付，载体是跨任务沉淀下来的规则；同在 `.tasks/` 下但职责不同 |
| 全局规则是快照 | 复制进 Agent 后不会自动更新；升级后重新组合一次即可同步，可让 AI 代做 |

## 深度了解

::: details 仓库结构

```text
src/commands/    各命令注册与输出
src/tasks/       任务区读写、校验与归档
src/skills/      技能分发与来源解析
src/conventions/ 规范载体形态、升级与归一
skills/          随包分发的 AI 技能
templates/rules/ 全局规则模块与预设
docs/            文档站
```

:::

- 想写脚本或作为库引用：[API 参考](./api)
- 想改工具本身：仓库根 `AGENTS.md` 是开发约束

## 相关页面

- 参考：[快速开始](./getting-started) · [适用场景](./scenarios) · [CLI 参考](./cli) · [配置参考](./config)
