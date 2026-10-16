# 变更集（Changesets）

本目录遵循 changesets 约定，记录「使用者可感知的改动」，供发版时合并成 CHANGELOG 与版本号。

在本仓库，变更集的创建与消费由 `@fxri/toolkit` 自身的 `toolkit changelog` 命令完成（底层引擎为 `@changesets/cli`）——流程见根目录 `AGENTS.md` 的「发版链路」与 `skills/fxri-release-changelog/SKILL.md`。

- 条目须以 `类型：` 前缀开头（前缀表见上述 skill）
- 上游文档：[changesets 仓库](https://github.com/changesets/changesets) ｜ [常见问题](https://github.com/changesets/changesets/blob/main/docs/common-questions.md)
