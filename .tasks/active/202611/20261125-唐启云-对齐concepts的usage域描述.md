---
owner: 唐启云
status: 待办
created: 20261125
updated: 20261125
completed: ''
depends_on: []
scope: docs
---

# 对齐 concepts 的 usage 域描述

> 计划位置：第 3 个（共 4 个）；前置：无；后继：无

## 背景

`docs/concepts.md` 的 13 个命令域表里，`toolkit usage` 的描述写「技能使用统计与导出」，同表链接文案是「技能使用情况」，CLI 页标题也是「技能使用情况（usage）」。另：`多语言 CHANGELOG` 是既有能力名（20261114 曾专门恢复以保留区分特征），不随页面名「发版与更新日志」改动。

## 实施方案

1. `docs/concepts.md` L38：`技能使用统计与导出（默认关闭）` 改为 `技能使用情况：统计与导出（默认关闭）`。
2. 不批量替换 `多语言 CHANGELOG`；README、guide、handbook、config 页的能力名用法保持不变。

## 影响范围

- 文档触达：docs/concepts.md
- 变更集：无（只改文档文案）

## 验证方式

1. grep 确认 `docs/concepts.md` 不再出现「技能使用统计」。
2. 归档后 `pnpm verify`（含文档可读性与规范一致性）。

## 回滚

单提交回退该行文案。
