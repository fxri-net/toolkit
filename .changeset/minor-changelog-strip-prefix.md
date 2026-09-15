---
"@fxri/toolkit": minor
---

新增：CHANGELOG 归类后剥离条目已识别的类型前缀

- 条目归入语义分组后，已识别的 `类型：` 前缀被剥离（`- 修复：xxx` → `- xxx`），类型由分组标题承接，明细不再与之重复
- 未识别的前缀（如正文里的 `说明：`）与依赖源条目 `- Updated dependencies`（缩进续行承载包版本）原样保留；剥离后文本为空也不改动
- 既有历史块本无前缀，剥离是回归原生形态；1.9.0–1.9.3 块经 `toolkit changelog --history format` 一并统一
- ⚠️ 按条目类型检索（`grep "^- 修复："`）不再可用：前缀只作归类信号，分组后不再保留
- 修复：`changelog` 域选项透传导致 `--history` 写在子命令之后被静默忽略，文档与技能中的 `toolkit changelog format --history` 写法更正为 `toolkit changelog --history format`
