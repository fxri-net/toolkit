---
"@fxri/toolkit": patch
---

- 修复：`fxri-session-recap` 的归属判定补回分类标签分册加载规则——`scope` 中非端值且载体下存在同名分册时按该分册加载，避免精简后只读主文件时漏加载
