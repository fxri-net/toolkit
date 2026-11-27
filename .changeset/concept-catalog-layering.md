---
"@fxri/toolkit": patch
---

- 修改：概念目录只保留可迁移的工程概念，本仓命令 / 技能 / 模板迁入 `concepts/reference.json`，`toolkit concept show` 末尾单列「本仓参考实现（可选）」
- 修改：`toolkit concept list` 的 `--maturity` 改为 `--adoption`（`generic` / `tooling`），JSON 的 `data.maturity` 改为 `data.adoption`
- 修改：`fxri-base-adoption` 按「概念本体 + 可选参考实现」两层取用，不再写死概念条数
- 修改：概念目录与参考实现契约升到 1.1
