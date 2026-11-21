---
title: 全局规则（rules）
---

# 全局规则（rules）

> 列出、组合与复制 AI 全局规则模块；规则正文随包分发，组合只改变选择与顺序。

## 用途与场景

- 全局规则会整段进入 Agent 上下文，可按需组合 `core` / `output` / `workflow` / `personal` / `env` / `commit` / `usage` 七个模块。
- 预设：`minimal`（仅 core）、`recommended`（core + output + workflow，默认）、
  `complete`（自用全篇：推荐 + 个人偏好 + env，等于文档站 AI 全局规则整篇加个人偏好规则）、`full`（全部）。
- 组合更新时间取所选模块的**最新锚点**；选择与顺序可缓存在 `~/.toolkit/cache/rules-selection.json`。

## 常用命令

```bash
toolkit rules compose                # 交互式选择预设或自定义模块，选完尝试复制到剪贴板
toolkit rules list
toolkit rules compose --preset recommended
toolkit rules compose --module usage --module core
toolkit rules compose --module core --copy
toolkit rules compose --preset complete --out AGENTS.md
toolkit rules compose --module core --dry-run   # 只预览组合与缓存写入
toolkit rules reset
toolkit rule check                    # 校验模块与规则页的更新锚点是否同源（只报不改）
```

无参且处于 TTY 时进入交互（预设 / 自定义两步）；非 TTY 或显式传 `--preset` / `--module` 时保持确定性输出，供脚本使用。
交互模式下选择会写入缓存，下一次 `toolkit rules compose` 以缓存为默认勾选。

## 子命令与选项

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `list` | 列出模块、锚点、预设归属与当前缓存 | `--format json` |
| `compose` | 组合输出；无参数时按「缓存 > recommended」取值 | `--preset`、`--module`（可重复 / 逗号分隔）、`--no-anchor`、`--out`、`--copy`、`--no-cache`、`--dry-run` |
| `reset` | 清除组合缓存 | — |
| `check` | 校验 `templates/rules/*.md` 与 `docs/rules/*.md` 的更新锚点：格式合法且页面锚点等于所含模块最大值 | `--cwd`、`--format json` |

`list` / `check` 的 `--format json` 走统一信封 `{ schemaVersion, command, ok, data, issues }`：报告字段位于 `data`，
`check` 的锚点问题同时映射到顶层 `issues`，存在 error 级问题时 `ok` 为 `false`。

## 边界与注意

- `--module` 的出现顺序即输出顺序；`--preset` 按清单顺序；二者同时出现报错。
- 交互预设选择按 ESC 取消整个命令（退出码 `130`）；进入「自定义…」后按 ESC 回到预设，不会直接退出。
- 显式传入 `--preset` / `--module` 时默认写入缓存（含顺序），`--no-cache` 可关闭；带 `--out` / `--copy` 时不写缓存（一次性导出不改变默认组合），
   缓存损坏或含未知模块时告警并回落 `recommended`。
- `--dry-run` 只预览：不写缓存、不写 `--out` 文件、不复制剪贴板；默认输出仍把组合文本送到 stdout。
- `rules list` 的 `--format` 仅接受 `json`，非法值报错退出 `1`，不再回落文本。
- `--out` / `--copy` 时 stdout 为空，确认与错误提示走 stderr；剪贴板写入失败以非 0 退出。
- 组合只输出文本，不自动改写任何 Agent 的全局规则文件；粘贴位置与常用 Agent 入口见[全局规则 · 怎么落地](../rules/#怎么落地)
- `usage` 模块与 `toolkit rules compose --module usage` 同源；原 `toolkit usage rule` 已移除，替代写法即此命令。
- 模块正文是唯一真源（`templates/rules/`）；文档站各规则页与 `--preset complete` 的组合结果由测试锁定逐字一致。

## 相关页面

- 规则：[全局规则索引](../rules/) · [AI 全局规则](../rules/ai) · [技能使用情况规则](../rules/usage)
- 参考：[CLI 参考](../cli) · [缓存目录](../config/cache)
