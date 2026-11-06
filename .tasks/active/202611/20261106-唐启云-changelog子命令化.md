---
owner: 唐启云
status: 待办
created: 20261106
updated: 20261106
completed: ''
depends_on: []
scope: toolkit
---

# changelog 域真子命令化

## 计划位置

toolkit 4 / 5；前置：CLI 参数与语义口径统一；目标版本：1.16.2。

## 背景

`changelog` 用位置参数透传 changesets，`version` / `doc` / `format` 是手写分支；`doc` 与 `version` 专属的 7 个选项（`--check`、`--from`、`--to`、`--title`、`--outline`、`--no-frontmatter`、`--no-sync-doc`）挂在全局选项区，`--audit-net` 与 `--history` 也是标志而非子命令，导致 `changelog doc --help` 只能打印组帮助。

## 实施方案

1. 把 `doc` / `version` / `format` / `audit` 注册为真子命令（`audit` 替代 `--audit-net`）。
2. 选项下沉：`--check` / `--from` / `--to` / `--title` / `--outline` / `--no-frontmatter` 归 `changelog doc`；`--no-sync-doc` 与 `--history` 归 `changelog version`；`--history` 同时归 `changelog format`。
3. 其余 changesets 子命令（`add` / `status` / `pre` / `tag` / `init` / `publish` 等）保留透传能力，未知操作数仍转发给 `@changesets/cli`，避免削弱现有能力。
4. 改写 `AGENTS.md` 发版链路中的命令：`changelog audit`、`changelog version`、`changelog format --history`、`changelog doc`。
5. 同步 `skills/fxri-release-changelog/SKILL.md` 与 `skills/README.md`，并按仓库规则递增技能版本（两处版本声明同源）。
6. **不提供兼容层**：`--audit-net` 与移到子命令的选项一律从组级移除，不保留旧写法与别名。
7. 同步文档站命令页与配置页；新增变更集，`patch`。

## 影响范围

- 代码：`src/cli.ts`（changelog 域注册与透传）、`src/changelog/*` 的入口调用。
- 测试：`src/__tests__/changelog*.test.ts` 中的命令串与 `shouldPrintChangelogHelp` 相关断言。
- skills：`skills/fxri-release-changelog/SKILL.md`（命令引用与版本号）、`skills/README.md`（发版清单中的 `--audit-net`）。
- 文档触达：docs/cli/changelog.md、docs/config/changelog.md、docs/cli.md、docs/guide.md、docs/handbook.md、skills/fxri-release-changelog/SKILL.md、skills/README.md
- 规则层：`AGENTS.md` 发版链路（不属于文档触达登记范围，但必须同批改）。
- 无触达：`SPEC.md`、`docs/ai-rules.md`、`docs/commit-rules.md`（未引用被改命令）。

## 验证与回滚

- `pnpm verify` 全绿；手工抽查 `toolkit changelog doc --help`、`changelog version --help`、`changelog audit`、`changelog format --history`，以及 `changelog add` 仍可透传。
- `pnpm sync:changelog-doc` 与镜像一致性检查通过。
- 回滚：单任务单提交，`git revert` 即可；不改 CHANGELOG 历史块。
