---
owner: 唐启云
status: 待办
created: 20261112
updated: 20261112
completed: ''
depends_on: []
scope: toolkit
---

# 拆分 tasks 与 changelog 命令模块

> 计划位置：第 3 个（共 10 个）；前置：20261112-唐启云-拆分 skills 与 init 命令模块；后继：20261112-唐启云-拆分 conventions 等命令模块

## 背景

完成上一任务后，`src/cli.ts` 仍保留 tasks 域（`addTasksCommonOptions`、`addTasksFilterOptions`、`resolveTasksContext`、`resolveTaskView`、`buildTaskFilter`、`runTasksOverview/Archive/Check/Stats/Normalize/Export/Import`，约 1993–2290 行）与 changelog 域（`addChangelogCommonOptions`、`resolveChangelogContext`、`runChangelogVersion/Format/Doc/Audit`、`runChangeset` 透传，约 2290–2380 行）。

## 实施方案

1. 新增 `src/commands/tasks.ts`：导出 `registerTasksCommands(program)`，搬入 tasks 域全部选项辅助函数与动作函数，以及 `applyStatusFilter`、`hasActiveTasks` 等仅 tasks 使用的小工具。
2. 新增 `src/commands/changelog.ts`：导出 `registerChangelogCommands(program)`，搬入 changelog 域动作函数、`CHANGESET_PASSTHROUGH` 表与 `runChangeset` 透传逻辑，以及 `resolveLanguages`、`warnUntypedEntries`、`changesetPrefixIssues`、`hasPendingChangeset` 等仅 changelog 使用的辅助函数。
3. `src/cli.ts` 对应区段改为一行注册调用。
4. 纯搬移：不改任何一个 `console.log / console.error / console.warn` 文案、不改 `process.exitCode` 赋值、不改 `--format json` 的键序、不改子命令与选项注册顺序。

## 影响范围

- 新增：`src/commands/tasks.ts`、`src/commands/changelog.ts`。
- 修改：`src/cli.ts`。
- 文档影响：无（行为不变）。
- 变更集：patch 一条（优化：tasks 与 changelog 命令迁入独立模块）。
- ⚠️ `changesetPrefixIssues` 与 tasks 校验共用 `CheckIssue` 类型，搬移后仅调整 import 路径，类型与结构不变。

## 验证方式

- `pnpm vitest run src/__tests__/cli-golden.test.ts`：快照 0 diff。
- `pnpm verify` 全量通过。
- `node dist/cli.js tasks check` 与 `node dist/cli.js changelog doc --check` 输出与重构前一致。
