---
owner: 唐启云
status: 待办
created: 20261112
updated: 20261112
completed: ''
depends_on: []
scope: toolkit
---

# 拆分 conventions 等命令模块

> 计划位置：第 4 个（共 10 个）；前置：20261112-唐启云-拆分 tasks 与 changelog 命令模块；后继：20261112-唐启云-拆分 skills 源文件模块

## 背景

`src/cli.ts` 拆完 skills / init / tasks / changelog 四域后，仍剩 conventions（`printUpgradeReport`、`printConventionsStatus`、`printConventionsFormat`）、config（`printConfigStatus`）、rules（list / compose / reset 三个子命令）、docs-theme 四个域的打印函数与命令注册，目标是让 `cli.ts` 收敛到 200 行以内，只保留 program 装配、help 收口与 `main`。

## 实施方案

1. 新增 `src/commands/conventions.ts`：导出 `registerConventionsCommands(program)`，搬入 conventions 域打印函数与命令注册。
2. 新增 `src/commands/config.ts`：导出 `registerConfigCommands(program)`，搬入 `printConfigStatus` 与 config 命令注册（含 `foldHome` / `foldHomeInText` 的调用面）。
3. 新增 `src/commands/rules.ts`：导出 `registerRulesCommands(program)`，搬入 rules list / compose / reset 的动作体与相关辅助函数。
4. 新增 `src/commands/docs-theme.ts`：导出 `registerDocsThemeCommands(program)`，搬入 docs theme 命令注册。
5. `src/cli.ts` 最终形态：`#!/usr/bin/env node`、program 基础配置、help footer、按序调用各 `registerXxxCommands(program)`、`setupHelp` / `helpCommand`、`ensureUtf8`、`main` 与 `cliReady` 导出；目标 ≤200 行。
6. 纯搬移：rules compose 的缓存写入提示走 stderr、`--out` / `--copy` 互斥判定、`--format` 非法值回落告警全部原样保留，不做「顺手统一」。

## 影响范围

- 新增：`src/commands/conventions.ts`、`src/commands/config.ts`、`src/commands/rules.ts`、`src/commands/docs-theme.ts`。
- 修改：`src/cli.ts`（降至 200 行以内）。
- 文档影响：无（行为不变）。
- 变更集：patch 一条（优化：cli.ts 收敛为命令装配入口）。
- ⚠️ `setupHelp` 与 `helpCommand` 的调用顺序是既有正确性约束（help 子命令自带 `helpOption(false)`），搬移时不得调整相对顺序。

## 验证方式

- `pnpm vitest run src/__tests__/cli-golden.test.ts`：快照 0 diff（尤其全量 help 树）。
- `pnpm verify` 全量通过。
- 复核 `src/cli.ts` 行数 ≤200，且不再出现任何 `console.log` 业务输出。
