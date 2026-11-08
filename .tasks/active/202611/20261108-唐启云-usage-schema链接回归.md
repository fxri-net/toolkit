---
owner: 唐启云
status: 待办
created: 20261108
updated: 20261108
completed: ''
depends_on: []
scope: toolkit
---

# usage schema 链接回归句内形态

> 计划位置：第 2 个（共 3 个）；前置：20261108-唐启云-一致性校验补引用存在性；后继：无

## 背景

上一批为满足 120 字符行宽，把 `docs/usage/schema.md` 的 schema 指引拆成「目录一句 + 单条链接」两行，
渲染后是一个悬垂的项目符号，观感不如句内链接。显示名缩短即可在保持行宽的前提下回归句内形态。

## 实施方案

把两行改回一句：`机器可读 schema 见仓库根 [skill-usage-event.v1.json](https://github.com/fxri-net/toolkit/blob/main/schemas/skill-usage-event.v1.json)。`
显示名由 `schemas/skill-usage-event.v1.json` 缩为 `skill-usage-event.v1.json`，链接目标不变；整行须 ≤120 字符。

## 影响范围

- 文档触达：docs/usage/schema.md
- 锚点与链接目标不变：仅改显示名与换行形态
- 不建变更集：`docs/` 不随包分发

## 验证方式

1. 改动行 ≤120 字符，`node scripts/check-docs-readability.mjs` 全仓 0 处超标
2. `pnpm docs:build` 通过（链接可解析）
3. `pnpm verify` 全绿
