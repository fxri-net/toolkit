---
title: rules（全局规则）
---

# rules（全局规则）

> 列出、组合与复制 AI 全局规则模块；规则正文随包分发，组合只改变选择与顺序。

## 用途与场景

- 全局规则会整段进入 Agent 上下文，可按需组合 `core` / `output` / `workflow` / `env` / `commit` / `usage` 六个模块。
- 预设：`minimal`（仅 core）、`recommended`（core + output + workflow，默认）、`complete`（AI 全篇：推荐 + env，等于文档站 AI 全局规则整篇）、`full`（全部）。
- 组合更新时间取所选模块的**最新锚点**；选择与顺序可缓存在 `~/.toolkit/cache/rules-selection.json`。

## 常用命令

```bash
toolkit rules list
toolkit rules compose
toolkit rules compose --preset recommended
toolkit rules compose --module usage --module core
toolkit rules compose --module core --copy
toolkit rules compose --preset complete --out AGENTS.md
toolkit rules reset
```

## 子命令与选项

| 子命令 | 说明 | 主要选项 |
| --- | --- | --- |
| `list` | 列出模块、锚点、预设归属与当前缓存 | `--format json` |
| `compose` | 组合输出；无参数时按「缓存 > recommended」取值 | `--preset`、`--module`（可重复 / 逗号分隔）、`--no-anchor`、`--out`、`--copy`、`--no-cache` |
| `reset` | 清除组合缓存 | — |

## 边界与注意

- `--module` 的出现顺序即输出顺序；`--preset` 按清单顺序；二者同时出现报错。
- 显式传入 `--preset` / `--module` 时默认写入缓存（含顺序），`--no-cache` 可关闭；缓存损坏或含未知模块时告警并回落 `recommended`。
- `--out` / `--copy` 时 stdout 为空，确认与错误提示走 stderr；剪贴板写入失败以非 0 退出。
- 组合只输出文本，不自动改写任何 Agent 的全局规则文件。
- `usage` 模块与 `toolkit usage rule` 同源；后者等价于 `rules compose --module usage`。
- 模块正文是唯一真源（`templates/rules/`）；文档站三篇规则页与 `--preset complete` 的组合结果由测试锁定逐字一致。

## 相关页面

- 规则：[全局规则索引](../rules/) · [AI 全局规则](../rules/ai) · [技能使用情况规则](../rules/usage)
- 参考：[CLI 参考](../cli) · [缓存目录](../config/cache)
