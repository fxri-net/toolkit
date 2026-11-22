---
title: v2 升级说明（upgrade-v2）
---

# v2 升级说明（upgrade-v2）

> 2.0.0 的破坏面集中在「脚本里的命令名」与「JSON 解析」；其余动作重跑命令即可完成。

## 三步升级

1. 升级 CLI：`pnpm add -g @fxri/toolkit`（项目内依赖用 `pnpm add -D @fxri/toolkit@2`）
2. 重跑初始化：`toolkit init`（改写 prepare 钩子与项目 / 本地配置段名，原文件备份 `.bak`）
3. 重装技能：`toolkit skill install --yes`

随后重新生成规则快照：`toolkit rule compose`，把输出粘贴回 Agent 全局规则入口。

## 已移除（无别名，须立即改）

| 旧写法 | 替代 |
| --- | --- |
| `toolkit usage rule` | `toolkit rule compose --module usage` |

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
| `fxri-text-encoding` | `fxri-code-encoding` |

`fxri-plan-review` 与 `fxri-release-changelog` 保留原名；新增 `fxri-test-tty`（test 族）。
旧名写入 `metadata.previousNames`，已保存选择集与安装迁移会自动跟随新名。

## 配置段名

| 旧段名 | 新段名 |
| --- | --- |
| `skillsInstall` | `skillInstall` |
| `skillsDelivery` | `skillDelivery` |
| `projectSkills` | `projectSkill` |
| `tasks` | `task` |

项目层与本地层由 `toolkit init` 就地重写；全局层 `~/.toolkitrc.json` 不在 init 处置范围，
按上表手动改名，2.1.0 起移除兼容。

## JSON 输出

报告类命令统一为八键信封（字段定义见 [CLI 参考 · 输出约定](./cli#输出约定)）：

```json
{
  "schemaVersion": 1,
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

`task add` / `task update`、`rule check`、`docs`（默认全量校验，`docs check` 同义）。

## 安装旧版本

v1 最后一个版本保留为 `1.x` 标签：`npm install -g @fxri/toolkit@1.x`。
v1 文档只存在于 `v1.17.8` 标签源码，不另建在线归档站。

## 相关页面

- [CLI 参考](./cli) · [完整攻略](./guide) · [更新日志](./changelog)
