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

| 模块 | 内容 | 预设 |
| --- | --- | --- |
| `core` | 角色定位与代码规范 | 极简 / 推荐 / AI 全篇 / 全量 |
| `output` | 输出要求 | 推荐 / AI 全篇 / 全量 |
| `workflow` | 工作流与方案落盘 | 推荐 / AI 全篇 / 全量 |
| `env` | 环境与版本 | AI 全篇 / 全量 |
| `commit` | 提交信息规则 | 全量 |
| `usage` | 技能使用情况 | 全量 |

- 组合更新时间取所选模块的**最新锚点**；`recommended` 默认不含 `env`，`complete`（AI 全篇）才等于 [AI 全局规则](./ai) 整篇。
- 点预设会直接切换为该预设的选择与顺序（与 CLI `rules compose --preset` 一致），手动勾选或排序后视为自定义组合并显示「当前：自定义」。
- 「全部取消」清空选择且不写入记忆，刷新回落 `recommended`；空态下该按钮禁用。
- `env` 是工作流章节的补充，正文以 `## 环境与版本` 开头；建议与 `workflow` 一起使用。
- 清空全部模块不会持久化，刷新回落 `recommended`。
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
