---
title: 概念目录（concept）
---

# 概念目录（concept）

`toolkit concept` 读取随包分发的概念目录，列出可引入的工程概念、变体与采纳步骤。
它面向 AI 与脚本：默认输出人读摘要，加 `--format json` 输出统一信封，便于 AI 直接取用。

> 概念是可选采纳的工程取舍，不是硬性规则；摘要与变体按常见场景表述，采纳时以项目实际与概念包声明为准。
> 安全、合规、授权等被写成「必须 / 不得」的条目属于护栏，采纳后应按硬约束执行，不因概念整体可选而放宽。

## 常用命令

```bash
toolkit concept                         # 列出全部概念（同 list）
toolkit concept list --category safety  # 只看安全类
toolkit concept list --maturity ready   # 只看已具备 CLI 能力的
toolkit concept show quality-gate       # 查看单个概念的采纳步骤
toolkit concept show quality-gate --format json
```

## 参数

| 参数 | 说明 |
| --- | --- |
| `--category <category>` | 按分类过滤：`engineering` / `delivery` / `safety` / `collaboration` / `distribution` / `platform` |
| `--maturity <level>` | 按成熟度过滤：`ready` / `partial` / `repo-only` |
| `--format <format>` | `json`，输出统一信封到 stdout |

## 行为

- 裸命令默认 `list`，与 `toolkit trash` 等查询域一致。
- 概念目录随包分发，路径为 `concepts/catalog.json`；不依赖网络。
- `show` 的 `id` 不存在时报错并以退出码 `1` 结束，列出可用入口。
- 概念条目含 `variants`（变体）、`related`（相关概念）、`support`（可用命令 / 技能 / 模板 / 检查）
  与 `adoption`（前置、步骤、涉及文件），AI 可按这些字段给出取舍并逐步采纳。
- 概念包（`bundles`）把一组概念按场景组合；与规则模块的「预设」、技能分发的「推荐包」不是同一层概念。

## JSON 契约

`data` 字段：

| 命令 | 字段 |
| --- | --- |
| `list` | `category` / `maturity` / `concepts`（每个概念见 `concepts/catalog.json`） |
| `show` | `concept` |

结构定义见随包分发的 [`schemas/concept-catalog.schema.json`][schema]。

[schema]: https://github.com/fxri-net/toolkit/blob/main/schemas/concept-catalog.schema.json

## 退出码

复用 [退出码与解析错误](./exit-codes)：`0` 成功、`1` 参数错误或概念不存在。

## 相关页面

- [一图看懂](../concepts) · [CLI 参考](../cli) · [推荐技能包](../packages)
