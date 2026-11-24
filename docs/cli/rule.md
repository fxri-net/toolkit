---
title: 全局规则（rule）
---

# 全局规则（rule）

> 列出、组合与复制 AI 全局规则模块；规则正文随包分发，组合只改变选择与顺序。

## 用途与场景

- 全局规则会整段进入 Agent 上下文，可按需组合模块（清单见[全局规则索引](../rules/)）。
- 预设：`minimal`（极简，只含 `workflow`，适合自备代码规范）、
  `recommended`（推荐，默认：`core` + `output` + `workflow` + `practices` + `commit`，多数项目从零起步）、
  `full`（全部 6 个模块，适合已启用技能统计）。
- 交互选择时每项附一行说明；显示名、模块清单与适用面取自 `templates/rules/ruleset.json`，与文档站组合器同源。
- 组合更新时间取所选模块的**最新锚点**；选择与顺序可缓存在 `~/.toolkit/cache/rules-selection.json`。

## 常用命令

```bash
toolkit rule compose                # 交互式选择预设或自定义模块，选完尝试复制到剪贴板
toolkit rule list
toolkit rule compose --preset recommended
toolkit rule compose --module usage --module core
toolkit rule compose --module core --copy
toolkit rule compose --preset full --out AGENTS.md
toolkit rule compose --module core --dry-run   # 只预览组合与缓存写入
toolkit rule reset
toolkit rule check           # 校验模块与规则页的更新锚点是否同源（只报不改）
toolkit rule sync            # 把提交信息规则同步到项目内 .trae/rules/git-commit-message.md
toolkit rule sync --dry-run  # 只显示差异，不写盘
```

无参且处于 TTY 时进入交互（预设 / 自定义两步）；非 TTY 或显式传 `--preset` / `--module` 时保持确定性输出，供脚本使用。
交互模式下选择会写入缓存，下一次 `toolkit rule compose` 以缓存为默认勾选。

## 子命令与选项

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `list` | 列出模块、锚点、预设归属与当前缓存 | `--format json` |
| `compose` | 组合输出；无参数时按「缓存 > 推荐组合 recommended」取值 | `--preset`、`--module`（可重复 / 逗号分隔）、`--no-anchor`、`--out`、`--copy`、`--no-cache`、`--dry-run` |
| `reset` | 清除组合缓存 | — |
| `check` | 校验 `templates/rules/*.md` 与 `docs/rules/*.md` 的更新锚点：格式合法且页面锚点等于所含模块最大值 | `--cwd`、`--format json` |
| `sync` | 把 `commit` 模块正文同步到项目内 `.trae/rules/git-commit-message.md`（显式运行，不自动刷新） | `--yes`、`--dry-run` |

`list` / `check` 的 `--format json` 走统一信封（字段见[输出约定](../cli#输出约定)）：报告字段位于 `data`，
`check` 的锚点问题同时映射到顶层 `issues`，存在 error 级问题时 `code` 为 `422`、`extend.exitCode` 为 `1`。

## 边界与注意

- `--module` 的出现顺序即输出顺序；`--preset` 按清单顺序；二者同时出现报错。
- 交互预设选择按 ESC 取消整个命令（取消退出码）；进入「自定义…」后按 ESC 回到预设，不会直接退出。
- 显式传入 `--preset` / `--module` 时默认写入缓存（含顺序），`--no-cache` 可关闭；带 `--out` / `--copy` 时不写缓存（一次性导出不改变默认组合），
   缓存损坏或含未知模块时告警并回落推荐组合 `recommended`。
- `--dry-run` 只预览：不写缓存、不写 `--out` 文件、不复制剪贴板；默认输出仍把组合文本送到 stdout。
- `rule list` 的 `--format` 仅接受 `json`，非法值报错退出 `1`，不再回落文本；JSON 的 `presets` 为 `{ label, summary, modules }` 对象，
   交互选项与文档站组合器据此展示预设说明。
- `--out` / `--copy` 时 stdout 为空，确认与错误提示走 stderr；剪贴板写入失败以非 0 退出。
- 组合只输出文本，不自动改写任何 Agent 的全局规则文件；粘贴位置与常用 Agent 入口见[全局规则 · 怎么落地](../rules/#怎么落地)
- `usage` 模块与 `toolkit rule compose --module usage` 同源；原 `toolkit usage rule` 已移除，替代写法即此命令。
- 模块正文是唯一真源（`templates/rules/`）；文档站各规则页与 `--preset full` 的组合结果由测试锁定逐字一致。

### sync：项目内提交规则快照

只写 `.trae/rules/git-commit-message.md`（当前只有 Trae 需要项目内提交规则；其它 agent 走全局规则，不生成项目文件）。
文件首部记录 `generated_by` 版本与正文摘要，正文与 `commit` 模块逐字一致（不含首行更新时间锚点），生成说明行不进可复制块。

- 无差异：只输出「已是最新（版本 X）」，不提问、不写盘
- 有差异：先给目标路径、当前版本、最新版本与 `+N −M` 差异摘要，再按「写入最新版本 / 保留当前文件 / 查看完整内容」处理，不默认写入
- 文件被手改（正文摘要与记录不符，或文件不是本命令生成的）：提示「与上次生成内容不一致」，默认停在「查看」
- 文件不存在：询问是否创建
- `--dry-run` 只显示差异与将创建的目标，不写盘
- `--yes` 为显式选择直接写入；非 TTY 且无 `--yes` 按无交互退出码结束
- 不挂自动化：不进 `prepare` 钩子、不进 `init` 默认流程；漂移由 `toolkit status` 只提示、不改文件

## 相关页面

- 规则：[全局规则索引](../rules/) · [AI 全局规则](../rules/ai) · [技能使用情况规则](../rules/usage)
- 参考：[CLI 参考](../cli) · [缓存目录](../config/cache)
