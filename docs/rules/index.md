---
title: 全局规则
---

<script setup>
import RuleComposer from '../.vitepress/theme/components/RuleComposer.vue'
</script>

# 全局规则

> 三份规则模板可按需整篇复制；也可以在下方的组合器里自由勾选 6 个模块、调整顺序并一键复制。

## 用途与场景

- 全局规则会整段进入 Agent 上下文：只选当前需要的模块，避免无关纪律占用上下文。
- `recommended` 是默认集（角色与代码规范 + 输出要求 + 工作流）；`complete` 等于 [AI 全局规则](./ai) 整篇；`commit` 与既有 Conventional Commits / commitlint 互斥；`usage` 需先开启技能使用统计。
- 三篇规则页是「整篇阅读」入口，组合器负责细粒度生成；两者内容由测试锁定同源。

## 规则组合器

<RuleComposer />

## 模块与组合口径

| 模块 | 内容 | 更新时间 | 预设 |
| --- | --- | --- | --- |
| `core` | 角色定位与代码规范 | 2026-11-08 01:48 | 极简 / 推荐 / 完整 / 全量 |
| `output` | 输出要求 | 2026-11-08 01:48 | 推荐 / 完整 / 全量 |
| `workflow` | 工作流与方案落盘 | 2026-11-08 01:48 | 推荐 / 完整 / 全量 |
| `env` | 环境与版本 | 2026-11-08 01:48 | 完整 / 全量 |
| `commit` | 提交信息规则 | 2026-09-14 13:22 | 全量 |
| `usage` | 技能使用情况 | 2026-11-08 01:48 | 全量 |

- 组合更新时间取所选模块的**最新锚点**；`recommended` 默认不含 `env`，`complete` 才等于 [AI 全局规则](./ai) 整篇。
- 文档站记忆写在 `localStorage`（键 `fxri-toolkit:rules:v1`），仅当前浏览器；命令行记忆写在 `~/.toolkit/cache/rules-selection.json`，两端不自动同步。
- 「恢复默认」会清除本机记忆；禁用本地存储时组合器仍可使用，只是不保留选择。

## 三篇整篇规则

| 规则 | 适用对象 | 复制方式 |
| --- | --- | --- |
| [AI 全局规则](./ai) | 通用 AI 协作纪律：代码规范、输出要求、方案落盘与验证 | 复制「规则全文」代码块，或组合 `complete` 预设 |
| [提交信息规则](./commit) | 统一 git 提交信息格式与语义 | 复制「规则全文」代码块；与 Conventional Commits / commitlint 互斥 |
| [技能使用情况规则](./usage) | 启用 toolkit 技能使用统计后，约束 AI 不重复补记、不外传数据 | 可选；复制「规则全文」代码块，或执行 `toolkit usage rule` |

## 相关页面

- 规则：[AI 全局规则](./ai) · [提交信息规则](./commit) · [技能使用情况规则](./usage)
- 参考：[CLI · 全局规则](../cli/rules) · [缓存目录](../config/cache)
