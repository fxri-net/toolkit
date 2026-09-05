---
"@fxri/toolkit": patch
---

修复：清理 CHANGELOG 双前缀伪影——变更集条目以 `- ` 开头时 changesets 会写入 `- - 条目` 首行并缩进续行，`changelog version/format` 现自动还原为顶层条目，无需人工润色
