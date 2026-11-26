---
"@fxri/toolkit": patch
---

- 修改：技能作用域判定改为「CLI 包根是否位于 cwd 的祖先目录」，不再依赖 `package.json`，非 Node 项目同样适用
