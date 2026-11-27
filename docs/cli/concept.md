---
title: 概念目录（concept）
---

# 概念目录（concept）

`toolkit concept` 读取随包分发的概念目录，列出可迁移到任意项目的工程概念、变体与采纳步骤。
它面向 AI 与脚本：默认输出人读摘要，加 `--format json` 输出统一信封，便于 AI 直接取用。

概念分两层：`concepts/catalog.json` 是概念本体，不含任何具体工具；`concepts/reference.json` 单独登记本仓参考实现，
只在安装 @fxri/toolkit 后可见，供已用本工具的用户对照。

> 概念是可选采纳的工程取舍，不是硬性规则；摘要与变体按常见场景表述，采纳时以项目实际与概念包声明为准。
> 安全、合规、授权等被写成「必须 / 不得」的条目属于护栏，采纳后应按硬约束执行，不因概念整体可选而放宽。

## 常用命令

```bash
toolkit concept                          # 列出全部概念（同 list）
toolkit concept list --category safety   # 只看安全类
toolkit concept list --adoption generic  # 只看无需配套工具的
toolkit concept show quality-gate        # 查看单个概念的采纳步骤
toolkit concept show quality-gate --format json
```

## 参数

| 参数 | 说明 |
| --- | --- |
| `--category <category>` | 按分类过滤：`engineering` / `delivery` / `safety` / `collaboration` / `distribution` / `platform` |
| `--adoption <level>` | 按落地形态过滤：`generic`（照步骤即可做）/ `tooling`（需配套脚本或工具） |
| `--format <format>` | `json`，输出统一信封到 stdout |

## 行为

- 裸命令默认 `list`，与 `toolkit trash` 等查询域一致。
- 概念目录随包分发，路径为 `concepts/catalog.json`；不依赖网络。
- `show` 的 `id` 不存在时报错并以退出码 `1` 结束，列出可用入口。
- 概念条目只描述可迁移内容：`variants`（变体）、`related`（相关概念）与 `adoption`（前置、步骤、涉及文件）。
- 命中参考实现时，`show` 末尾单独输出「本仓参考实现（可选）」；JSON 的 `reference` 字段为 `null` 或该条目的命令 / 技能 / 模板 / 检查。
- 概念包（`bundles`）把一组概念按场景组合；与规则模块的「预设」、技能分发的「推荐包」不是同一层概念。

## JSON 契约

`data` 字段：

| 命令 | 字段 |
| --- | --- |
| `list` | `category` / `adoption` / `concepts`（每个概念见 `concepts/catalog.json`） |
| `show` | `concept` / `reference` |

结构定义见随包分发的 [`concept-catalog.schema.json`][schema] 与 [`concept-reference.schema.json`][reference-schema]。

[schema]: https://github.com/fxri-net/toolkit/blob/main/schemas/concept-catalog.schema.json
[reference-schema]: https://github.com/fxri-net/toolkit/blob/main/schemas/concept-reference.schema.json

## 退出码

复用 [退出码与解析错误](./exit-codes)：`0` 成功、`1` 参数错误或概念不存在。

## 相关页面

- [一图看懂](../overview) · [CLI 参考](../cli) · [推荐技能包](../packages)
