---
"@fxri/toolkit": patch
---

修复 `changelog format`（及 `version` 自带格式化）未去掉 changesets changelog-git 写入的 commit hash 前缀，导致中文 CHANGELOG 条目带 `800a1cf: ` 这类前缀。
