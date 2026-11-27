---
title: v1 → v2 升级
---

# v1 → v2 升级

> 2.0.0 的破坏面集中在「脚本里的命令名」与「JSON 解析」；工程侧迁移由 `toolkit upgrade` 一次完成。

## 统一入口迁移（推荐）

1. 升级 CLI：`pnpm add -g @fxri/toolkit`（项目内依赖用 `pnpm add -D @fxri/toolkit@2`）
2. 在当前工程执行 `toolkit upgrade`（TTY 预览后确认；CI / 脚本用 `toolkit upgrade --all --yes`）
   - 需要只读门禁时用 `toolkit upgrade --check`（有可自动处理的残留时退出 1）
   - 自动处理三层配置段名、`package.json` 旧钩子与旧命令名、技能旧名登记、规范载体、历史 `.bak`，
     以及技能状态 / 使用事件 / 索引 / 队列 / 上传账本 / 回收站清单的旧版本写法
3. 重新生成规则快照：`toolkit rule compose --copy --no-cache`，把输出粘贴回 Agent 全局规则入口

细节与退出码见[升级迁移](./cli/upgrade)。迁移只改形态与版本写法、不改行为；迁移后重跑 `toolkit task init` 应零改动。

## 手工兜底（自动迁移没覆盖到时）

- 项目配置：`toolkit task init`（只处理项目 / 本地层，原文件备份 `.bak`）
- 技能：`toolkit skill install --yes`（安装器会跟随曾用名迁移）
- 规范载体：`toolkit convention upgrade`

## 已移除（无别名，须立即改）

| 旧写法 | 替代 |
| --- | --- |
| `toolkit usage rule` | `toolkit rule compose --module usage --no-cache` |

## 已改名（别名保留至 2.1.0）

旧命令命中时由 CLI 在 stderr 提示新路径，脚本可在 2.1.0 前逐步替换。

<!-- toolkit:command-table:start -->
| 旧路径 | 新路径 |
| --- | --- |
| `toolkit tasks` | `toolkit task` |
| `toolkit skills` | `toolkit skill` |
| `toolkit skills path` | `toolkit skill status --path` |
| `toolkit skills gate` | `toolkit config get\|set skillDelivery.default` |
| `toolkit skills sources` | `toolkit skill source` |
| `toolkit rules` | `toolkit rule` |
| `toolkit conventions` | `toolkit convention` |
| `toolkit changelog` | `toolkit release` |
| `toolkit changelog version` | `toolkit release bump` |
| `toolkit changelog format` | `toolkit release changelog` |
| `toolkit changelog doc` | `toolkit release mirror` |
| `toolkit changelog add` | `toolkit release changeset add` |
<!-- toolkit:command-table:end -->

## 技能新旧名对照

| 旧名 | 新名 |
| --- | --- |
| `fxri-plan-to-task` | `fxri-plan-task` |
| `fxri-session-recap` | `fxri-plan-recap` |
| `fxri-skill-authoring` | `fxri-writing-skill` |
| `fxri-docs-writing` | `fxri-writing-docs` |
| `fxri-text-encoding` | `fxri-base-encoding` |
| `fxri-code-encoding` | `fxri-base-encoding` |
| `fxri-code-safety` | `fxri-base-safety` |

`fxri-plan-review` 与 `fxri-release-changelog` 保留原名；新增 `fxri-test-tty`（test 族）。
旧名写入 `metadata.previousNames`，已保存选择集与安装迁移会自动跟随新名。

## 配置段名

| 旧段名 | 新段名 |
| --- | --- |
| `skillsInstall` | `skillInstall` |
| `skillsDelivery` | `skillDelivery` |
| `projectSkills` | `projectSkill` |
| `tasks` | `task` |

三层配置均由 `toolkit upgrade` 就地重写（含全局层 `~/.toolkitrc.json`）；新旧段并存且内容不同、或段写错层时，
先按 `toolkit upgrade --check` 的提示确认，再执行 `toolkit upgrade --prune-legacy` 删除已失效的旧段 / 误放段。
手工兜底时，项目层与本地层可用 `toolkit task init`，全局层用 `toolkit upgrade --layers global`，2.1.0 起移除兼容。

## JSON 输出

报告类命令统一为八键信封（字段定义见 [CLI 参考 · 输出约定](./cli#输出约定)）：

```json
{
  "schemaVersion": "1.0",
  "command": "task stats",
  "code": 200,
  "message": "成功",
  "data": { "total": 3 },
  "extend": { "exitCode": 0 },
  "debug": {},
  "issues": []
}
```

读取变化：原顶层字段移入 `data`，`command` 标识命令来源，`code` / `message` 表达结论，
`extend.exitCode` 承载进程退出码，`issues` 汇总问题。
数据流保持原格式，不套信封：`usage data export`、`task export` 写出的文件、`release changeset` 透传。

## 全局工作目录

新脚本用 `toolkit --cwd <path> <命令>`；各命令原有的 `--cwd` 继续可用。

## 更新日志链接

文档站更新日志按主版本分页后，旧锚点迁到 `/changelog/1.x#…`，按站点内实际链接调整。

## 新命令

`task add` / `task update`、`rule check`、`upgrade`（v1 工程统一入口迁移）、`docs`（默认全量校验，`docs check` 同义）。

## 安装旧版本

v1 最后一个版本保留为 `1.x` 标签：`npm install -g @fxri/toolkit@1.x`。
v1 文档只存在于 `v1.17.8` 标签源码，不另建在线归档站。

## 相关页面

- [CLI 参考](./cli) · [完整攻略](./guide) · [更新日志](./changelog)
